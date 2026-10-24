import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import {
  requireConfirmedMutation,
  showErrorToast,
  showSuccessToast,
  runMutationAction
} from '@/shared/feedback/mutationFeedback';
import React, { useState, useEffect, useRef } from 'react';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { useLanguage } from '@/context/LanguageContext';
import { getPOQueueLabel } from '@/features/sales/model/poWorkflow';
import { Download, FileText, Paperclip, Plus, Search, Send, Settings2, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { USER_ROLE_LABELS } from '@/shared/types';
import './Chat.css';
import { formatTime } from '@/shared/utils/dateFormatting';
import { productionQuantityLabel } from '@/features/production/model/productionOrder';
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

const createPendingAttachmentId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createMessageId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `message-${crypto.randomUUID()}`
    : `message-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isSafeAttachmentUrl = (url: string) => /^https:\/\//i.test(url) || /^data:/i.test(url);

const getInitials = (name: unknown) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part.charAt(0).toLocaleUpperCase('vi'))
    .join('') || '?';

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
  const [channelSearch, setChannelSearch] = useState('');
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

  useEffect(
    () => () => {
      pendingAttachmentsRef.current.forEach(attachment => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    },
    []
  );

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
    return runMutationAction(
      'ChatPage.tsx:handleCreateChannelSubmit',
      async () => {
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

        showSuccessToast('Đã thêm thành công');
      },
      e
    );
  };

  const handleEditChannelSubmit = async (e: React.FormEvent) => {
    return runMutationAction(
      'ChatPage.tsx:handleEditChannelSubmit',
      async () => {
        e.preventDefault();
        if (!editChannelName.trim() || !activeChannelId) return;

        await requireConfirmedMutation(
          dbService.updateDocument('channels', activeChannelId, {
            name: editChannelName.trim(),
            desc: editChannelDesc.trim(),
            members: editChannelMembers
          })
        );

        setShowEditModal(false);

        showSuccessToast('Đã lưu thành công');
      },
      e
    );
  };

  const handleToggleMember = (userId: string, isEdit: boolean) => {
    if (userId === currentUser.uid && isEdit) {
      // Creator/Admin cannot remove themselves from membership
      return;
    }
    if (isEdit) {
      setEditChannelMembers(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]));
    } else {
      setNewChannelMembers(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]));
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
    setPendingAttachments(current =>
      current.filter(attachment => {
        if (attachment.id !== attachmentId) return true;
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        return false;
      })
    );
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

  const handleDeleteMessage = async (message: {
    id: string;
    senderName?: string;
    attachments?: ChatAttachmentRecord[];
  }) => {
    return runMutationAction(
      'ChatPage.tsx:handleDeleteMessage',
      async () => {
        if (currentUser.role !== 'admin') return;
        if (!(await confirmDelete(t('Xóa vĩnh viễn tin nhắn này? Thao tác không thể khôi phục.')))) return;

        try {
          await requireConfirmedMutation(dbService.deleteDocument('messages', message.id));
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

          showSuccessToast('Đã xóa thành công');
        } catch (error) {
          showErrorToast();
          console.error('[Chat] Could not delete message.', error);
          window.alert(t('Không thể xóa tin nhắn. Vui lòng thử lại.'));
        }
      },
      message
    );
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
      return (users || []).filter(
        u =>
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
    const replacement = suggestionType === 'member' ? `@${item.displayName} ` : `${item.code} `;

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Mark active channel as read
  useEffect(() => {
    localStorage.setItem(`erp_last_read_ch_${currentUser.uid}_${activeChannelId}`, new Date().toISOString());
    scrollToBottom();
  }, [activeChannelId, currentUser.uid, messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!messageText.trim() && pendingAttachments.length === 0) || isSendingMessage) return;

    const messageId = createMessageId();
    const filesToUpload = pendingAttachments.map(attachment => attachment.file);
    let uploadedAttachments: ChatAttachmentRecord[] = [];
    setIsSendingMessage(true);
    setAttachmentError('');

    try {
      uploadedAttachments = await uploadChatAttachments(filesToUpload, activeChannelId, messageId, currentUser.uid);

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
        ...(replyingTo
          ? {
              replyTo: {
                id: replyingTo.id,
                senderName: replyingTo.senderName,
                text: replyingTo.messageText || (replyingTo.attachments?.length ? t('Tệp đính kèm') : '')
              }
            }
          : {})
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
      setAttachmentError(error instanceof Error ? error.message : t('Không thể gửi tệp đính kèm. Vui lòng thử lại.'));
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
              <span className="chat-task-card-title">
                {t('Đơn Hàng')} {poCode}
              </span>
              <span className="chat-task-card-desc">
                {po.customerName} - {po.items?.[0]?.productName || t('Tem Nhãn')} ({t(getPOQueueLabel(po))})
              </span>
              <button type="button" className="chat-task-card-btn" onClick={() => onNavigateToPO(po.id)}>
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
              <span className="chat-task-card-title">
                {t('Lệnh Sản Xuất')} {lsxCode}
              </span>
              <span className="chat-task-card-desc">
                {lsx.productName} — {productionQuantityLabel(lsx)} ({t(lsx.status)})
              </span>
              <button type="button" className="chat-task-card-btn" onClick={() => onNavigateToLSX(lsx.id)}>
                {t('Xem Lệnh Sản Xuất')} →
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMessageAttachments = (attachments: ChatAttachmentRecord[] = []) => {
    const safeAttachments = attachments.filter(attachment => attachment?.url && isSafeAttachmentUrl(attachment.url));
    if (safeAttachments.length === 0) return null;

    return (
      <div className="chat-message-attachments">
        {safeAttachments.map(attachment =>
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
        )}
      </div>
    );
  };

  // Get unread count for a channel
  const getUnreadCount = (channelId: string) => {
    const lastReadStr = localStorage.getItem(`erp_last_read_ch_${currentUser.uid}_${channelId}`);
    if (!lastReadStr) {
      return messages.filter(
        message => message.type === 'channel' && message.targetId === channelId && message.senderId !== currentUser.uid
      ).length;
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

  const normalizedChannelSearch = channelSearch.trim().toLocaleLowerCase('vi');
  const visibleChannels = normalizedChannelSearch
    ? availableChannels.filter(ch =>
        String(ch.name || '')
          .toLocaleLowerCase('vi')
          .includes(normalizedChannelSearch)
      )
    : availableChannels;
  const canEditActiveChannel =
    (currentUser.role === 'admin' || activeChannel?.createdBy === currentUser.uid) && activeChannel?.id !== 'all';
  const activeChannelMemberCount = Array.isArray(activeChannel?.members) ? activeChannel.members.length : 0;

  return (
    <div className="chat-page-view">
      <div className="chat-workspace">
        <aside className="chat-sidebar" aria-label={t('Danh sách kênh')}>
          <div className="chat-sidebar__toolbar">
            <label className="chat-sidebar__search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={channelSearch}
                onChange={event => setChannelSearch(event.target.value)}
                placeholder={t('Tìm kênh')}
                aria-label={t('Tìm kênh')}
              />
            </label>
            <IconButton
              label={t('Tạo kênh mới')}
              icon={<Plus />}
              onClick={() => {
                setNewChannelName('');
                setNewChannelDesc('');
                setNewChannelMembers([]);
                setShowCreateModal(true);
              }}
            />
          </div>
          <div className="chat-sidebar__heading">{t('Kênh thảo luận')}</div>
          <nav className="chat-sidebar__channels">
            {visibleChannels.map(ch => {
              const count = getUnreadCount(ch.id);
              const isActive = activeChannelId === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  className={`chat-channel${isActive ? ' is-active' : ''}`}
                  aria-current={isActive ? 'true' : undefined}
                  title={ch.name}
                  onClick={() => {
                    clearPendingAttachments();
                    setReplyingTo(null);
                    setActiveChannelId(ch.id);
                  }}
                >
                  <span className="chat-channel__hash" aria-hidden="true">
                    #
                  </span>
                  <span className="chat-channel__name">{ch.name}</span>
                  {count > 0 && (
                    <span className="chat-channel__badge" aria-label={`${count} ${t('tin chưa đọc')}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {visibleChannels.length === 0 && <p className="chat-sidebar__empty">{t('Không tìm thấy kênh phù hợp.')}</p>}
          </nav>
        </aside>

        <section className="chat-panel" aria-label={activeChannel ? `# ${activeChannel.name}` : t('Kênh chat')}>
          <header className="chat-panel__header">
            <div className="chat-panel__title">
              <h2 title={activeChannel?.name}># {activeChannel?.name}</h2>
              <p title={activeChannel?.desc}>
                {activeChannel?.desc}
                {activeChannelMemberCount > 0 &&
                  `${activeChannel?.desc ? ' · ' : ''}${activeChannelMemberCount} ${t('thành viên')}`}
              </p>
            </div>
            {canEditActiveChannel && (
              <IconButton
                label={t('Sửa kênh')}
                icon={<Settings2 />}
                onClick={() => {
                  setEditChannelName(activeChannel.name);
                  setEditChannelDesc(activeChannel.desc || '');
                  setEditChannelMembers(activeChannel.members || []);
                  setShowEditModal(true);
                }}
              />
            )}
          </header>

          <div className="chat-panel__messages">
            {channelMessages.map(msg => {
              const isMe = msg.senderId === currentUser.uid;
              const roleLabel =
                USER_ROLE_LABELS[msg.senderRole as keyof typeof USER_ROLE_LABELS] || String(msg.senderRole || '');
              return (
                <article key={msg.id} className={`chat-post${msg.recalled ? ' is-recalled' : ''}`}>
                  <span className="chat-post__avatar" aria-hidden="true">
                    {getInitials(msg.senderName)}
                  </span>
                  <div className="chat-post__body">
                    <div className="chat-post__meta">
                      <strong>{msg.senderName}</strong>
                      {roleLabel && <span>{t(roleLabel)}</span>}
                      <time dateTime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
                      {!msg.recalled && (
                        <span className="chat-post__actions">
                          <button type="button" onClick={() => setReplyingTo(msg)}>
                            {t('Trả lời')}
                          </button>
                          {(isMe || currentUser.role === 'admin') && (
                            <button type="button" className="is-danger" onClick={() => void handleRecallMessage(msg)}>
                              {t('Thu hồi')}
                            </button>
                          )}
                          {currentUser.role === 'admin' && (
                            <button
                              type="button"
                              className="is-danger"
                              onClick={() => void handleDeleteMessage(msg)}
                              title={t('Xóa vĩnh viễn tin nhắn')}
                            >
                              {t('Xóa')}
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    {msg.recalled ? (
                      <p className="chat-post__recalled">{t('Tin nhắn đã bị thu hồi')}</p>
                    ) : (
                      <div className="chat-post__content">
                        {msg.replyTo && (
                          <blockquote className="chat-post__quote">
                            <strong>@{msg.replyTo.senderName}:</strong> {msg.replyTo.text || t('Tệp đính kèm')}
                          </blockquote>
                        )}
                        {msg.messageText ? renderMessageContent(msg.messageText) : null}
                        {renderMessageAttachments(msg.attachments || [])}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
            <div ref={messagesEndRef} />
            {channelMessages.length === 0 && (
              <p className="chat-panel__empty">
                {t('Chưa có tin nhắn nào trong kênh này. Hãy bắt đầu cuộc hội thoại!')}
              </p>
            )}
          </div>

          <div className="chat-composer">
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="chat-suggestions-popup">
                <div className="chat-suggestion-header">
                  {suggestionType === 'member' ? t('Gợi ý tag nhân viên') : t('Gợi ý mã liên kết')}
                </div>
                {filteredSuggestions.map((item: any) => (
                  <div key={item.id} className="chat-suggestion-item" onClick={() => handleSelectSuggestion(item)}>
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
              <div className="chat-composer__reply">
                <span>
                  <strong>
                    {t('Trả lời')} {replyingTo.senderName}:
                  </strong>{' '}
                  {replyingTo.messageText || (replyingTo.attachments?.length ? t('Tệp đính kèm') : '')}
                </span>
                <IconButton label={t('Bỏ trả lời')} icon={<X />} onClick={() => setReplyingTo(null)} />
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
              <div className="chat-attachment-error" role="alert">
                {attachmentError}
              </div>
            )}
            <form onSubmit={handleSendMessage} className="chat-composer__form">
              <input
                ref={attachmentInputRef}
                type="file"
                className="chat-attachment-input"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                onChange={handleAttachmentSelection}
              />
              <IconButton
                label={t('Đính kèm ảnh hoặc tệp')}
                icon={<Paperclip />}
                onClick={() => attachmentInputRef.current?.click()}
                disabled={isSendingMessage || pendingAttachments.length >= CHAT_ATTACHMENT_MAX_FILES}
              />
              <input
                type="text"
                className="chat-composer__input"
                placeholder={t('Nhập nội dung... (Gõ @ để tag nhân viên, # để gọi đơn hàng PO/LSX)')}
                aria-label={t('Nội dung tin nhắn')}
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                disabled={isSendingMessage}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSendingMessage || (!messageText.trim() && pendingAttachments.length === 0)}
              >
                <Send size={14} aria-hidden="true" />
                {isSendingMessage ? t('Đang gửi...') : t('Gửi')}
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* CREATE CHANNEL MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('TẠO KÊNH THẢO LUẬN MỚI')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowCreateModal(false)}>
                {t('Đóng')}
              </button>
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
                  <div
                    style={{
                      maxHeight: '180px',
                      overflowY: 'auto',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      backgroundColor: 'white'
                    }}
                  >
                    {users
                      .filter(u => u.uid !== currentUser.uid && u.active)
                      .map(u => (
                        <label
                          key={u.uid}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}
                        >
                          <input
                            type="checkbox"
                            checked={newChannelMembers.includes(u.uid)}
                            onChange={() => handleToggleMember(u.uid, false)}
                          />
                          <span style={{ fontSize: '13px' }}>
                            {u.displayName} ({t(u.role.toUpperCase())})
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                  {t('Hủy')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('Tạo Kênh')}
                </button>
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
              <button className="btn btn-sm btn-outline" onClick={() => setShowEditModal(false)}>
                {t('Đóng')}
              </button>
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
                  <input type="text" value={editChannelDesc} onChange={e => setEditChannelDesc(e.target.value)} />
                </div>
                <div className="form-group">
                  <label style={{ fontWeight: 600 }}>{t('Thành Viên Kênh')}</label>
                  <div
                    style={{
                      maxHeight: '180px',
                      overflowY: 'auto',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      backgroundColor: 'white'
                    }}
                  >
                    {users
                      .filter(u => u.uid !== currentUser.uid && u.active)
                      .map(u => (
                        <label
                          key={u.uid}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}
                        >
                          <input
                            type="checkbox"
                            checked={editChannelMembers.includes(u.uid)}
                            onChange={() => handleToggleMember(u.uid, true)}
                          />
                          <span style={{ fontSize: '13px' }}>
                            {u.displayName} ({t(u.role.toUpperCase())})
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)}>
                  {t('Hủy')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('Lưu Thay Đổi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
