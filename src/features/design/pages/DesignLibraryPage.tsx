import React, { useEffect, useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { ApprovedDesignLibrary } from '@/features/design/components/ApprovedDesignLibrary';
import { DesignPOLike, DesignRecord } from '@/features/design/model/designWorkflow';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import './Design.css';

interface DesignLibraryProps {
  pos: DesignPOLike[];
  currentUser: UserProfile;
}

export const DesignLibrary: React.FC<DesignLibraryProps> = ({ pos, currentUser }) => {
  const [designs, setDesigns] = useState<DesignRecord[]>([]);

  useEffect(() => dbService.subscribeCollection('designs', data => setDesigns(data as DesignRecord[])), []);

  return (
    <div className="design-request-view design-library-view">
      <PageContextHeader section="Kho mẫu" current="Danh sách mẫu thiết kế" />

      <ApprovedDesignLibrary designs={designs} pos={pos} currentUser={currentUser} />
    </div>
  );
};
