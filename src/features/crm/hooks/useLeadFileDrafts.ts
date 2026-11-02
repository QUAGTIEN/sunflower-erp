import type { UserProfile } from '@/shared/types/user';
import type React from 'react';
import { useState } from 'react';
import { type LeadFileRecord } from '@/features/crm/model/crmModels';

export interface LeadFileDraftInputs {
  currentUser: UserProfile;
}

/** Unsaved files and share links attached to the lead form; they are written with the lead on save. */
export const useLeadFileDrafts = ({ currentUser }: LeadFileDraftInputs) => {
  const [uploadingFiles, setUploadingFiles] = useState<LeadFileRecord[]>([]);
  const [attachmentLinkName, setAttachmentLinkName] = useState('');
  const [attachmentLinkUrl, setAttachmentLinkUrl] = useState('');

  const handleLeadFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const oversizedFile = files.find(file => file.size > 900_000);
    if (oversizedFile) {
      window.alert('Tệp lớn hơn 900 KB. Vui lòng lưu trên Google Drive hoặc OneDrive và dùng đường dẫn chia sẻ.');
      event.target.value = '';
      return;
    }
    const nextFiles = await Promise.all(
      files.map(
        file =>
          new Promise<LeadFileRecord>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: `lead-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                size: file.size,
                folderId: 'other',
                folder: 'Tài liệu khác',
                url: '',
                data: String(reader.result || ''),
                createdAt: new Date().toISOString(),
                createdById: currentUser.uid,
                createdBy: currentUser.displayName
              });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setUploadingFiles(previous => [...previous, ...nextFiles]);
    event.target.value = '';
  };

  const handleAddAttachmentLink = () => {
    const name = attachmentLinkName.trim();
    const url = attachmentLinkUrl.trim();
    if (!name || !/^https?:\/\//i.test(url)) {
      window.alert('Nhập tên tệp và đường dẫn chia sẻ bắt đầu bằng http:// hoặc https://.');
      return;
    }
    setUploadingFiles(previous => [
      ...previous,
      {
        id: `lead-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        folderId: 'other',
        folder: 'Tài liệu khác',
        url,
        data: '',
        createdAt: new Date().toISOString(),
        createdById: currentUser.uid,
        createdBy: currentUser.displayName
      }
    ]);
    setAttachmentLinkName('');
    setAttachmentLinkUrl('');
  };

  return {
    uploadingFiles,
    setUploadingFiles,
    attachmentLinkName,
    setAttachmentLinkName,
    attachmentLinkUrl,
    setAttachmentLinkUrl,
    handleLeadFilesChange,
    handleAddAttachmentLink
  };
};
