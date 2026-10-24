import type React from 'react';
import { useState } from 'react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { LeadCandidateFileRecord } from '@/features/crm/model/leadCandidateModels';

export interface CandidateFileDraftInputs {
  currentUser: UserProfile;
}

/** Unsaved files and share links attached to the raw-data form; they are written with the candidate on save. */
export const useCandidateFileDrafts = ({ currentUser }: CandidateFileDraftInputs) => {
  const [candidateFiles, setCandidateFiles] = useState<LeadCandidateFileRecord[]>([]);
  const [candidateLinkName, setCandidateLinkName] = useState('');
  const [candidateLinkUrl, setCandidateLinkUrl] = useState('');

  const appendCandidateFiles = async (files: File[]) => {
    const oversizedFile = files.find(file => file.size > 900_000);
    if (oversizedFile) {
      window.alert('Tệp lớn hơn 900 KB. Vui lòng lưu trên Google Drive hoặc OneDrive và dùng đường dẫn chia sẻ.');
      return;
    }
    const nextFiles = await Promise.all(
      files.map(
        file =>
          new Promise<LeadCandidateFileRecord>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: `candidate-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    setCandidateFiles(previous => [...previous, ...nextFiles]);
  };

  const handleCandidateFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await appendCandidateFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleCandidateFilesDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    await appendCandidateFiles(Array.from(event.dataTransfer.files || []));
  };

  const handleAddCandidateLink = () => {
    const name = candidateLinkName.trim();
    const url = candidateLinkUrl.trim();
    if (!name || !/^https?:\/\//i.test(url)) {
      window.alert('Nhập tên tài liệu và đường dẫn chia sẻ bắt đầu bằng http:// hoặc https://.');
      return;
    }
    setCandidateFiles(previous => [
      ...previous,
      {
        id: `candidate-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        size: 0,
        folderId: 'other',
        folder: 'Tài liệu khác',
        url,
        data: '',
        createdAt: new Date().toISOString(),
        createdById: currentUser.uid,
        createdBy: currentUser.displayName
      }
    ]);
    setCandidateLinkName('');
    setCandidateLinkUrl('');
  };

  return {
    candidateFiles,
    setCandidateFiles,
    candidateLinkName,
    setCandidateLinkName,
    candidateLinkUrl,
    setCandidateLinkUrl,
    handleCandidateFilesChange,
    handleCandidateFilesDrop,
    handleAddCandidateLink
  };
};
