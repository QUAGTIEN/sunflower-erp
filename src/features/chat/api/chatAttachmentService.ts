import { getApp, getApps } from 'firebase/app';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

export interface ChatAttachmentRecord {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'file';
}

export const CHAT_ATTACHMENT_MAX_FILES = 5;
export const CHAT_ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

const safePathSegment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'file';

const createAttachmentId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isCloudStorageEnabled = Boolean(
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET && import.meta.env.VITE_FIREBASE_AUTH_MODE === 'email-password'
);

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Không thể đọc tệp đính kèm.'));
    reader.readAsDataURL(file);
  });

export const uploadChatAttachments = async (
  files: File[],
  channelId: string,
  messageId: string,
  senderId: string
): Promise<ChatAttachmentRecord[]> => {
  if (files.length === 0) return [];

  if (!isCloudStorageEnabled) {
    return Promise.all(
      files.map(async file => {
        if (file.size > 700 * 1024) {
          throw new Error('Chế độ dữ liệu cục bộ chỉ hỗ trợ tệp nhỏ hơn 700 KB.');
        }
        return {
          id: createAttachmentId(),
          name: file.name,
          url: await readAsDataUrl(file),
          storagePath: '',
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          kind: file.type.startsWith('image/') ? ('image' as const) : ('file' as const)
        };
      })
    );
  }

  if (getApps().length === 0) throw new Error('Firebase chưa được khởi tạo.');
  const storage = getStorage(getApp());
  const uploadedAttachments: ChatAttachmentRecord[] = [];
  let currentUploadPath = '';

  try {
    for (const [index, file] of files.entries()) {
      const attachmentId = createAttachmentId();
      const storagePath = [
        'chat_attachments',
        safePathSegment(channelId),
        safePathSegment(messageId),
        `${index + 1}-${attachmentId}-${safePathSegment(file.name)}`
      ].join('/');
      const attachmentRef = ref(storage, storagePath);
      currentUploadPath = storagePath;
      await uploadBytes(attachmentRef, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          senderId,
          channelId,
          messageId,
          originalName: file.name
        }
      });
      uploadedAttachments.push({
        id: attachmentId,
        name: file.name,
        url: await getDownloadURL(attachmentRef),
        storagePath,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        kind: file.type.startsWith('image/') ? 'image' : 'file'
      });
      currentUploadPath = '';
    }
    return uploadedAttachments;
  } catch (error) {
    await Promise.allSettled(
      [...uploadedAttachments.map(attachment => attachment.storagePath), currentUploadPath]
        .filter(Boolean)
        .map(storagePath => deleteObject(ref(storage, storagePath)))
    );
    throw error;
  }
};

export const deleteChatAttachments = async (attachments: ChatAttachmentRecord[] = []) => {
  if (!isCloudStorageEnabled || getApps().length === 0) return;
  const storage = getStorage(getApp());
  await Promise.allSettled(
    attachments
      .filter(attachment => attachment.storagePath)
      .map(attachment => deleteObject(ref(storage, attachment.storagePath)))
  );
};

export const formatChatAttachmentSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return '0 KB';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};
