import React from 'react';
import { ListPlus, UserRoundSearch, AlertCircle } from 'lucide-react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';

interface LeadCandidateBatchBarProps {
  selectedQueueCandidateIds: string[];
  setSelectedQueueCandidateIds: React.Dispatch<React.SetStateAction<string[]>>;
  setBatchQueueError: React.Dispatch<React.SetStateAction<string>>;
  addSelectedCandidatesToWorkQueue: () => Promise<void | undefined>;
  savingBatchQueue: boolean;
  currentUser: UserProfile;
  batchAssigneeId: string;
  setBatchAssigneeId: React.Dispatch<React.SetStateAction<string>>;
  saleUsers: UserProfile[];
  assignSelectedCandidatesToSale: () => Promise<void | undefined>;
  batchQueueError: string;
}

/** Bulk action bar that moves selected raw-data rows into a sale's work queue. */
export const LeadCandidateBatchBar: React.FC<LeadCandidateBatchBarProps> = ({
  selectedQueueCandidateIds,
  setSelectedQueueCandidateIds,
  setBatchQueueError,
  addSelectedCandidatesToWorkQueue,
  savingBatchQueue,
  currentUser,
  batchAssigneeId,
  setBatchAssigneeId,
  saleUsers,
  assignSelectedCandidatesToSale,
  batchQueueError
}) => (
  <section className="lead-candidate-batch-bar" aria-label="Chuyển dữ liệu sang công việc cần xử lý">
    <div>
      <ListPlus size={17} />
      <strong>Đã chọn {selectedQueueCandidateIds.length} khách hàng</strong>
      <button
        type="button"
        onClick={() => {
          setSelectedQueueCandidateIds([]);
          setBatchQueueError('');
        }}
      >
        Bỏ chọn
      </button>
    </div>
    <div className="lead-candidate-batch-actions">
      <button
        type="button"
        className="btn btn-primary"
        onClick={addSelectedCandidatesToWorkQueue}
        disabled={savingBatchQueue}
      >
        <ListPlus size={14} /> {savingBatchQueue ? 'Đang xử lý...' : 'Đưa vào Công việc cần xử lý'}
      </button>
      {currentUser.role === 'admin' && (
        <div className="lead-candidate-batch-assignment">
          <label>
            <span>Bàn giao cho Sale</span>
            <select
              value={batchAssigneeId}
              onChange={event => {
                setBatchAssigneeId(event.target.value);
                setBatchQueueError('');
              }}
            >
              <option value="">Chọn Sale nhận việc</option>
              {saleUsers.map(user => (
                <option key={user.uid} value={user.uid}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn lead-candidate-assign-button"
            onClick={assignSelectedCandidatesToSale}
            disabled={savingBatchQueue || !batchAssigneeId}
          >
            <UserRoundSearch size={14} /> Bàn giao
          </button>
        </div>
      )}
    </div>
    {batchQueueError && (
      <p>
        <AlertCircle size={13} /> {batchQueueError}
      </p>
    )}
  </section>
);
