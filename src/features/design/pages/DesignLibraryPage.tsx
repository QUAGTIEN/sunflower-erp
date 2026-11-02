import React, { useEffect, useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { Archive, CheckCircle2, FolderOpen } from 'lucide-react';
import { ApprovedDesignLibrary } from '@/features/design/components/ApprovedDesignLibrary';
import { DesignPOLike, DesignRecord, DesignVersion } from '@/features/design/model/designWorkflow';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import '@/components/CustomerHistory.css';
import './Design.css';

interface DesignLibraryProps {
  pos: DesignPOLike[];
  currentUser: UserProfile;
}

export const DesignLibrary: React.FC<DesignLibraryProps> = ({ pos, currentUser }) => {
  const [designs, setDesigns] = useState<DesignRecord[]>([]);

  useEffect(() => dbService.subscribeCollection('designs', data => setDesigns(data as DesignRecord[])), []);

  const approvedCount = designs.filter(design => design.status === 'approved').length;
  const versionCount = designs.reduce(
    (total, design) => total + (design.versions?.length || (design.fileUrl ? 1 : 0)),
    0
  );
  const sourceFileCount = designs.reduce(
    (total, design) =>
      total + (design.versions || []).filter((version: DesignVersion) => version.aiLink || version.corelLink).length,
    0
  );

  return (
    <div className="design-library-view">
      <PageContextHeader section="Kho mẫu" current="Danh sách mẫu thiết kế" />

      <div className="design-library-metrics">
        <div className="design-metric-card">
          <CheckCircle2 size={20} />
          <div>
            <strong>{approvedCount}</strong>
            <span>Mẫu đã được khách hàng duyệt</span>
          </div>
        </div>
        <div className="design-metric-card">
          <Archive size={20} />
          <div>
            <strong>{versionCount}</strong>
            <span>Phiên bản đang được lưu trữ</span>
          </div>
        </div>
        <div className="design-metric-card">
          <FolderOpen size={20} />
          <div>
            <strong>{sourceFileCount}</strong>
            <span>Phiên bản có file thiết kế gốc</span>
          </div>
        </div>
      </div>

      <ApprovedDesignLibrary designs={designs} pos={pos} currentUser={currentUser} />
    </div>
  );
};
