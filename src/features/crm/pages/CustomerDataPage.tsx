import React, { useEffect, useMemo, useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { LeadCandidateWorkspace } from '@/features/crm/components/LeadCandidateWorkspace';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import './CustomerData.css';

interface CustomerDataProps {
  customers: CustomerRecord[];
  leads: LeadRecord[];
  users: UserProfile[];
  currentUser: UserProfile;
  onStartConversion: (candidate: LeadCandidateRecord) => void;
}

export const CustomerData: React.FC<CustomerDataProps> = ({
  customers,
  leads,
  users,
  currentUser,
  onStartConversion
}) => {
  const [candidates, setCandidates] = useState<LeadCandidateRecord[]>([]);
  const saleUsers = useMemo(() => users.filter(user => user.role === 'sale'), [users]);

  useEffect(() => {
    return dbService.subscribeCollection('lead_candidates', data => {
      setCandidates(sortNewestFirst(data as LeadCandidateRecord[], candidate => [candidate.createdAt, candidate.updatedAt]));
    });
  }, []);

  return (
    <div className="customer-data-page">
      <PageContextHeader section="Dữ liệu thô" current="Tất cả dữ liệu" className="customer-data-page__header" />

      <LeadCandidateWorkspace
        candidates={candidates}
        leads={leads}
        customers={customers}
        saleUsers={saleUsers}
        currentUser={currentUser}
        onStartConversion={onStartConversion}
      />
    </div>
  );
};
