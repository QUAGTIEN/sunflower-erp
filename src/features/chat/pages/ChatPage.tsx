import React, { useState, useEffect, useRef } from 'react';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { useLanguage } from '@/context/LanguageContext';
import { getPOQueueLabel } from '@/features/sales/model/poWorkflow';
import { Download, FileText, Paperclip, Plus, X } from 'lucide-react';
import { formatTime } from '@/shared/utils/dateFormatting';
import {
  CHAT_ATTACHMENT_MAX_FILES,
  CHAT_ATTACHMENT_MAX_FILE_SIZE,
  deleteChatAttachments,
  formatChatAttachmentSize,
  type ChatAttachmentRecord,
  uploadChatAttachments
} from '@/features/chat/api/chatAttachmentService';

interface PendingChatAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

const createPendingAttachmentId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

const createMessageId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `message-${crypto.randomUUID()}`
    : `message-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const isSafeAttachmentUrl = (url: string) => (
  /^https:\/\//i.test(url) || /^data:/i.test(url)
);

const CHAT_CHANNEL_COLORS = [
  '#1e40af',
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#be123c',
  '#0369a1',
  '#4338ca',
  '#166534'
];

interface ChatPageProps {
  currentUser: UserProfile;
  messages: any[];
  pos: any[];
  productionCommands: any[];
  onNavigateToPO: (poId: string) => void;
  onNavigateToLSX: (lsxId: string) => void;
  users: UserProfile[];
  channels: any[];
}

export const ChatPage: React.FC<ChatPageProps> = ({
  currentUser,
  messages,
  pos,
  productionCommands,
  onNavigateToPO,
  onNavigateToLSX,
  users,
  channels
}) => {
  const { t } = useLanguage();
  const [activeChannelId, setActiveChannelId] = useState<string>('all');
  const [messageText, setMessageText] = useState('');
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<PendingChatAttachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => () => {
    pendingAttachmentsRef.current.forEach(attachment => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelMembers, setNewChannelMembers] = useState<string[]>([]);

  const [editChannelName, setEditChannelName] = useState('');
  const [editChannelDesc, setEditChannelDesc] = useState('');
  const [editChannelMembers, setEditChannelMembers] = useState<string[]>([]);

  const handleCreateChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    const newChannel = {
      name: newChannelName.trim(),
      desc: newChannelDesc.trim(),
      members: [...newChannelMembers, currentUser.uid], // Creator is always a member
      roles: [],
      createdBy: currentUser.uid,
      createdAt: new Date().toISOString()
    };

    const created = await dbService.addDocument('channels', newChannel);
    if (created) {
      setActiveChannelId(created.id);
    }
    setShowCreateModal(false);
  };

  const handleEditChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editChannelName.trim() || !activeChannelId) return;

    await dbService.updateDocument('channels', activeChannelId, {
      name: editChannelName.trim(),
      desc: editChannelDesc.trim(),
      members: editChannelMembers
    });

    setShowEditModal(false);
  };

  const handleToggleMember = (userId: string, isEdit: boolean) => {
    if (userId === currentUser.uid && isEdit) {
      // Creator/Admin cannot remove themselves from membership
      return;
    }
    if (isEdit) {
      setEditChannelMembers(prev =>
        prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
      );
    } else {
      setNewChannelMembers(prev =>
        prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
      );
    }
  };

  const clearPendingAttachments = () => {
    setPendingAttachments(current => {
      current.forEach(attachment => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
    setAttachmentError('');
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments(current => current.filter(attachment => {
      if (attachment.id !== attachmentId) return true;
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return false;
    }));
    setAttachmentError('');
  };

  const handleAttachmentSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    const availableSlots = CHAT_ATTACHMENT_MAX_FILES - pendingAttachments.length;
    if (availableSlots <= 0) {
      setAttachmentError(t(`Mỗi tin nhắn chỉ được đính kèm tối đa ${CHAT_ATTACHMENT_MAX_FILES} tệp.`));
      return;
    }

    const oversizedFiles = selectedFiles.filter(file => file.size > CHAT_ATTACHMENT_MAX_FILE_SIZE);
    const acceptedFiles = selectedFiles
      .filter(file => file.size <= CHAT_ATTACHMENT_MAX_FILE_SIZE)
      .slice(0, availableSlots);

    if (oversizedFiles.length > 0) {
      setAttachmentError(t('Mỗi tệp đính kèm phải nhỏ hơn hoặc bằng 10 MB.'));
    } else if (selectedFiles.length > availableSlots) {
      setAttachmentError(t(`Mỗi tin nhắn chỉ được đính kèm tối đa ${CHAT_ATTACHMENT_MAX_FILES} tệp.`));
    } else {
      setAttachmentError('');
    }

    setPendingAttachments(current => [
      ...current,
      ...acceptedFiles.map(file => ({
        id: createPendingAttachmentId(),
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
      }))
    ]);
  };

  const handleRecallMessage = async (message: { id: string; attachments?: ChatAttachmentRecord[] }) => {
    if (window.confirm(t('Bạn có chắc chắn muốn thu hồi tin nhắn này?'))) {
      await dbService.updateDocument('messages', message.id, { recalled: true });
      await deleteChatAttachments(message.attachments || []);
    }
  };

  const handleDeleteMessage = async (message: { id: string; senderName?: string; attachments?: ChatAttachmentRecord[] }) => {
    if (currentUser.role !== 'admin') return;
    if (!window.confirm(t('Xóa vĩnh viễn tin nhắn này? Thao tác không thể khôi phục.'))) return;

    try {
      await dbService.deleteDocument('messages', message.id);
      await deleteChatAttachments(message.attachments || []);
      auditService.recordSafely(currentUser, {
        category: 'administration',
        module: 'system',
        action: 'chat_message_deleted',
        summary: `Xóa tin nhắn của ${message.senderName || 'người dùng'} trong kênh chat`,
        targetType: 'message',
        targetId: message.id,
        targetLabel: activeChannel?.name || activeChannelId,
        pageId: 'chat'
      });
    } catch (error) {
      console.error('[Chat] Could not delete message.', error);
      window.alert(t('Không thể xóa tin nhắn. Vui lòng thử lại.'));
    }
  };

  // Auto-complete suggestions states
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<'member' | 'task'>('member');
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionTriggerIndex, setSuggestionTriggerIndex] = useState(-1);

  // Monitor text typing for @ and # triggers
  useEffect(() => {
    const triggerMatch = messageText.match(/([@#])([a-zA-Z0-9-]*)$/);
    if (triggerMatch) {
      const char = triggerMatch[1];
      const queryStr = triggerMatch[2];
      const index = triggerMatch.index ?? -1;

      setSuggestionType(char === '@' ? 'member' : 'task');
      setSuggestionQuery(queryStr);
      setSuggestionTriggerIndex(index);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [messageText]);

  // Filter items
  const getFilteredSuggestions = () => {
    if (suggestionType === 'member') {
      return (users || []).filter(u =>
        u.displayName.toLowerCase().includes(suggestionQuery.toLowerCase()) ||
        u.role.toLowerCase().includes(suggestionQuery.toLowerCase())
      );
    } else {
      const matchedPos = (pos || [])
        .filter(p => p.poCode.toLowerCase().includes(suggestionQuery.toLowerCase()))
        .map(p => ({ id: p.id, code: p.poCode, type: 'PO', label: `${p.poCode} (${p.customerName})` }));

      const matchedLsx = (productionCommands || [])
        .filter(l => l.lsxCode?.toLowerCase().includes(suggestionQuery.toLowerCase()))
        .map(l => ({ id: l.id, code: l.lsxCode, type: 'LSX', label: `${l.lsxCode} (${l.productName})` }));

      return [...matchedPos, ...matchedLsx];
    }
  };

  const filteredSuggestions = getFilteredSuggestions();

  const handleSelectSuggestion = (item: any) => {
    const beforeTrigger = messageText.substring(0, suggestionTriggerIndex);
    const replacement = suggestionType === 'member'
      ? `@${item.displayName} `
      : `${item.code} `;

    setMessageText(beforeTrigger + replacement);
    setShowSuggestions(false);
  };

  // Filter channels based on current user role or explicit membership
  const availableChannels = (channels || []).filter(ch => {
    const hasRoleAccess = ch.roles ? ch.roles.includes(currentUser.role) : false;
    const hasMemberAccess = ch.members ? ch.members.includes(currentUser.uid) : false;
    const isCreator = ch.createdBy === currentUser.uid;
    const isAdmin = currentUser.role === 'admin';
    return hasRoleAccess || hasMemberAccess || isCreator || isAdmin;
  });

  // Mark active channel as read
  useEffect(() => {
    localStorage.setItem(`erp_last_read_ch_${currentUser.uid}_${activeChannelId}`, new Date().toISOString());
    scrollToBottom();
  }, [activeChannelId, currentUser.uid, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!messageText.trim() && pendingAttachments.length === 0) || isSendingMessage) return;

    const messageId = createMessageId();
    const filesToUpload = pendingAttachments.map(attachment => attachment.file);
    let uploadedAttachments: ChatAttachmentRecord[] = [];
    setIsSendingMessage(true);
    setAttachmentError('');

    try {
      uploadedAttachments = await uploadChatAttachments(
        filesToUpload,
        activeChannelId,
        messageId,
        currentUser.uid
      );

      const newMessage = {
        id: messageId,
        type: 'channel',
        targetId: activeChannelId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        senderRole: currentUser.role,
        messageText: messageText.trim(),
        attachments: uploadedAttachments,
        createdAt: new Date().toISOString(),
        ...(replyingTo ? {
          replyTo: {
            id: replyingTo.id,
            senderName: replyingTo.senderName,
            text: replyingTo.messageText || (replyingTo.attachments?.length ? t('Tệp đính kèm') : '')
          }
        } : {})
      };

      await dbService.addDocument('messages', newMessage);
      setMessageText('');
      setReplyingTo(null);
      clearPendingAttachments();
      localStorage.setItem(`erp_last_read_ch_${currentUser.uid}_${activeChannelId}`, new Date().toISOString());
      setTimeout(scrollToBottom, 50);
    } catch (error) {
      await deleteChatAttachments(uploadedAttachments);
      console.error('[Chat] Could not send attachments.', error);
      setAttachmentError(error instanceof Error
        ? error.message
        : t('Không thể gửi tệp đính kèm. Vui lòng thử lại.'));
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Helper to parse message text for PO or LSX codes and retrieve matching documents
  const renderMessageContent = (msgText: string) => {
    // Simple text split to render links if any
    const poRegex = /PO-\d{4}-\d{4}/g;
    const lsxRegex = /LSX-\d{4}-\d{4}/g;

    const poMatches = msgText.match(poRegex) || [];
    const lsxMatches = msgText.match(lsxRegex) || [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>{msgText}</span>

        {/* Render PO Link Cards */}
        {poMatches.map(poCode => {
          const po = pos.find(p => p.poCode === poCode);
          if (!po) return null;
          return (
            <div key={po.id} className="chat-task-card">
              <span className="chat-task-card-title">{t('Đơn Hàng')} {poCode}</span>
              <span className="chat-task-card-desc">{po.customerName} - {po.items?.[0]?.productName || t('Tem Nhãn')} ({t(getPOQueueLabel(po))})</span>
              <button
                type="button"
                className="chat-task-card-btn"
                onClick={() => onNavigateToPO(po.id)}
              >
                {t('Xem Chi Tiết Đơn Hàng')} →
              </button>
            </div>
          );
        })}

        {/* Render LSX Link Cards */}
        {lsxMatches.map(lsxCode => {
          const lsx = productionCommands.find(l => l.lsxCode === lsxCode);
          if (!lsx) return null;
          return (
            <div key={lsx.id} className="chat-task-card">
              <span className="chat-task-card-title">{t('Lệnh Sản Xuất')} {lsxCode}</span>
              <span className="chat-task-card-desc">{lsx.productName} - Qty: {lsx.qtyToProduce?.toLocaleString()} ({t(lsx.status)})</span>
              <button
                type="button"
                className="chat-task-card-btn"
                onClick={() => onNavigateToLSX(lsx.id)}
              >
                {t('Xem Lệnh Sản Xuất')} →
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMessageAttachments = (attachments: ChatAttachmentRecord[] = []) => {
    const safeAttachments = attachments.filter(attachment => (
      attachment?.url && isSafeAttachmentUrl(attachment.url)
    ));
    if (safeAttachments.length === 0) return null;

    return (
      <div className="chat-message-attachments">
        {safeAttachments.map(attachment => (
          attachment.kind === 'image' ? (
            <a
              key={attachment.id}
              className="chat-image-attachment"
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              title={t('Mở ảnh')}
            >
              <img src={attachment.url} alt={attachment.name} loading="lazy" />
              <span>{attachment.name}</span>
            </a>
          ) : (
            <a
              key={attachment.id}
              className="chat-file-attachment"
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              download={attachment.name}
              title={t('Mở hoặc tải tệp')}
            >
              <FileText size={22} aria-hidden="true" />
              <span className="chat-file-attachment__details">
                <strong>{attachment.name}</strong>
                <small>{formatChatAttachmentSize(attachment.size)}</small>
              </span>
              <Download size={16} aria-hidden="true" />
            </a>
          )
        ))}
      </div>
    );
  };

  // Get unread count for a channel
  const getUnreadCount = (channelId: string) => {
    const lastReadStr = localStorage.getItem(`erp_last_read_ch_${currentUser.uid}_${channelId}`);
    if (!lastReadStr) {
      return messages.filter(message => (
        message.type === 'channel'
        && message.targetId === channelId
        && message.senderId !== currentUser.uid
      )).length;
    }
    const lastReadTime = new Date(lastReadStr).getTime();

    return messages.filter(
      msg =>
        msg.type === 'channel' &&
        msg.targetId === channelId &&
        msg.senderId !== currentUser.uid &&
        new Date(msg.createdAt).getTime() > lastReadTime
    ).length;
  };

  const activeChannel = availableChannels.find(ch => ch.id === activeChannelId) || availableChannels[0];
  const channelMessages = messages.filter(msg => msg.type === 'channel' && msg.targetId === activeChannelId);

  return (
    <div className="chat-page-view" style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
      <div className="chat-page-container">
        {/* Sidebar Kênh */}
        <div className="chat-channels-list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', margin: 0 }}>
              {t('Kênh thảo luận')}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline btn-symbol"
              style={{ width: '24px', height: '24px', minWidth: '24px', borderRadius: '4px' }}
              onClick={() => {
                setNewChannelName('');
                setNewChannelDesc('');
                setNewChannelMembers([]);
                setShowCreateModal(true);
              }}
              title={t('Tạo kênh mới')}
            >
              <Plus size={12} />
            </button>
          </div>
          {availableChannels.map((ch, channelIndex) => {
            const count = getUnreadCount(ch.id);
            return (
              <button
                key={ch.id}
                className={`chat-channel-btn ${activeChannelId === ch.id ? 'active' : ''}`}
                style={{ '--chat-channel-color': CHAT_CHANNEL_COLORS[channelIndex % CHAT_CHANNEL_COLORS.length] } as React.CSSProperties}
                onClick={() => {
                  clearPendingAttachments();
                  setReplyingTo(null);
                  setActiveChannelId(ch.id);
                }}
              >
                <span># {ch.name}</span>
                {count > 0 && <span className="chat-channel-badge">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Khung Chat */}
        <div className="chat-box-panel">
          <div className="chat-box-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '15px' }}># {activeChannel?.name}</span>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>{activeChannel?.desc}</p>
            </div>
            {(currentUser.role === 'admin' || activeChannel?.createdBy === currentUser.uid) && activeChannel?.id !== 'all' && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '12px', padding: '4px 10px' }}
                onClick={() => {
                  setEditChannelName(activeChannel.name);
                  setEditChannelDesc(activeChannel.desc || '');
                  setEditChannelMembers(activeChannel.members || []);
                  setShowEditModal(true);
                }}
              >
                {t('Sửa kênh')}
              </button>
            )}
          </div>

          <div className="chat-messages-area">
            {channelMessages.map(msg => {
              const isMe = msg.senderId === currentUser.uid;
              return (
                <div key={msg.id} className={`chat-message-row ${isMe ? 'me' : 'other'}`}>
                  <div className="chat-message-meta" style={{ display: 'flex', gap: '6px', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{msg.senderName}</span>
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>({String(msg.senderRole || '').toUpperCase()})</span>
                    <span>•</span>
                    <span>{formatTime(msg.createdAt)}</span>
                    {!msg.recalled && (
                      <>
                        <span>•</span>
                        <button
                          onClick={() => setReplyingTo(msg)}
                          style={{ border: 'none', background: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, fontSize: '10px' }}
                        >
                          {t('Trả lời')}
                        </button>
                        {(isMe || currentUser.role === 'admin') && (
                          <>
                            <span>•</span>
                            <button
                              onClick={() => void handleRecallMessage(msg)}
                              style={{ border: 'none', background: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0, fontSize: '10px' }}
                            >
                              {t('Thu hồi')}
                            </button>
                          </>
                        )}
                        {currentUser.role === 'admin' && (
                          <>
                            <span>•</span>
                            <button
                              onClick={() => void handleDeleteMessage(msg)}
                              style={{ border: 'none', background: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0, fontSize: '10px' }}
                              title={t('Xóa vĩnh viễn tin nhắn')}
                            >
                              {t('Xóa')}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="chat-message-bubble">
                    {msg.recalled ? (
                      <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>
                        {t('Tin nhắn đã bị thu hồi')}
                      </span>
                    ) : (
                      <>
                        {msg.replyTo && (
                          <div style={{
                            padding: '4px 8px',
                            backgroundColor: isMe ? 'rgba(255, 255, 255, 0.15)' : '#f1f5f9',
                            borderRadius: '4px',
                            fontSize: '11px',
                            marginBottom: '6px',
                            borderLeft: '3px solid var(--color-primary)',
                            color: isMe ? '#e2e8f0' : 'var(--color-text-muted)',
                            fontStyle: 'italic',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            <strong>@{msg.replyTo.senderName}:</strong> "{msg.replyTo.text || t('Tệp đính kèm')}"
                          </div>
                        )}
                        {msg.messageText ? renderMessageContent(msg.messageText) : null}
                        {renderMessageAttachments(msg.attachments || [])}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
            {channelMessages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                {t('Chưa có tin nhắn nào trong kênh này. Hãy bắt đầu cuộc hội thoại!')}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="chat-suggestions-popup">
                <div className="chat-suggestion-header">
                  {suggestionType === 'member' ? t('Gợi ý tag nhân viên') : t('Gợi ý mã liên kết')}
                </div>
                {filteredSuggestions.map((item: any) => (
                  <div
                    key={item.id}
                    className="chat-suggestion-item"
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    <span className="chat-suggestion-item-main">
                      {suggestionType === 'member' ? `@${item.displayName}` : item.code}
                    </span>
                    <span className="chat-suggestion-item-sub">
                      {suggestionType === 'member' ? t(item.role.toUpperCase()) : item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {replyingTo && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 12px',
                backgroundColor: '#f1f5f9',
                borderTop: '1px solid var(--color-border-light)',
                fontSize: '12px',
                color: 'var(--color-text-muted)',
                borderRadius: '4px 4px 0 0',
                margin: '0 10px -1px 10px'
              }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                  <strong>{t('Trả lời')} {replyingTo.senderName}:</strong>{' '}
                  "{replyingTo.messageText || (replyingTo.attachments?.length ? t('Tệp đính kèm') : '')}"
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    padding: '0 4px'
                  }}
                >
                  ×
                </button>
              </div>
            )}
            {pendingAttachments.length > 0 && (
              <div className="chat-pending-attachments" aria-label={t('Tệp đang chờ gửi')}>
                {pendingAttachments.map(attachment => (
                  <div key={attachment.id} className="chat-pending-attachment">
                    {attachment.previewUrl ? (
                      <img src={attachment.previewUrl} alt="" />
                    ) : (
                      <FileText size={24} aria-hidden="true" />
                    )}
                    <span>
                      <strong>{attachment.file.name}</strong>
                      <small>{formatChatAttachmentSize(attachment.file.size)}</small>
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(attachment.id)}
                      aria-label={`${t('Bỏ tệp')} ${attachment.file.name}`}
                      title={t('Bỏ tệp')}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachmentError && (
              <div className="chat-attachment-error" role="alert">{attachmentError}</div>
            )}
            <form onSubmit={handleSendMessage} className="chat-input-bar">
              <input
                ref={attachmentInputRef}
                type="file"
                className="chat-attachment-input"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                onChange={handleAttachmentSelection}
              />
              <button
                type="button"
                className="chat-attach-button"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={isSendingMessage || pendingAttachments.length >= CHAT_ATTACHMENT_MAX_FILES}
                title={t('Đính kèm ảnh hoặc tệp')}
                aria-label={t('Đính kèm ảnh hoặc tệp')}
              >
                <Paperclip size={19} aria-hidden="true" />
              </button>
              <input
                type="text"
                className="chat-input-field"
                placeholder={t('Nhập nội dung... (Gõ @ để tag nhân viên, # để gọi đơn hàng PO/LSX)')}
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                disabled={isSendingMessage}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '8px 20px', fontWeight: 600 }}
                disabled={isSendingMessage || (!messageText.trim() && pendingAttachments.length === 0)}
              >
                {isSendingMessage ? t('Đang gửi...') : t('Gửi')}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* CREATE CHANNEL MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('TẠO KÊNH THẢO LUẬN MỚI')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowCreateModal(false)}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleCreateChannelSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label>{t('Tên Kênh *')}</label>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={e => setNewChannelName(e.target.value)}
                    placeholder={t('Ví dụ: Thảo luận PO-Aqua...')}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('Mô Tả Kênh')}</label>
                  <input
                    type="text"
                    value={newChannelDesc}
                    onChange={e => setNewChannelDesc(e.target.value)}
                    placeholder={t('Mô tả mục đích kênh chat...')}
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 600 }}>{t('Thành Viên Tham Gia')}</label>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'white' }}>
                    {users.filter(u => u.uid !== currentUser.uid && u.active).map(u => (
                      <label key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={newChannelMembers.includes(u.uid)}
                          onChange={() => handleToggleMember(u.uid, false)}
                        />
                        <span style={{ fontSize: '13px' }}>{u.displayName} ({t(u.role.toUpperCase())})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary">{t('Tạo Kênh')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CHANNEL MODAL */}
      {showEditModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('CHỈNH SỬA THÔNG TIN KÊNH')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowEditModal(false)}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleEditChannelSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label>{t('Tên Kênh *')}</label>
                  <input
                    type="text"
                    value={editChannelName}
                    onChange={e => setEditChannelName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('Mô Tả Kênh')}</label>
                  <input
                    type="text"
                    value={editChannelDesc}
                    onChange={e => setEditChannelDesc(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 600 }}>{t('Thành Viên Kênh')}</label>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'white' }}>
                    {users.filter(u => u.uid !== currentUser.uid && u.active).map(u => (
                      <label key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={editChannelMembers.includes(u.uid)}
                          onChange={() => handleToggleMember(u.uid, true)}
                        />
                        <span style={{ fontSize: '13px' }}>{u.displayName} ({t(u.role.toUpperCase())})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary">{t('Lưu Thay Đổi')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
