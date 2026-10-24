import React from 'react';
import type { CandidateWorkspaceView, CandidateSort } from './leadCandidateWorkspaceConfig';
import { UserRoundSearch, CalendarClock, ListPlus, Search, Settings2, Plus, X } from 'lucide-react';
import { DataFilterButton } from '@/components/DataWorkspaceFilters';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';

interface LeadCandidateCommandBarProps {
  showRawOverview: () => void;
  currentUser: UserProfile;
  workspaceView: CandidateWorkspaceView;
  setWorkspaceView: React.Dispatch<React.SetStateAction<CandidateWorkspaceView>>;
  setSelectedQueueCandidateIds: React.Dispatch<React.SetStateAction<string[]>>;
  setBatchQueueError: React.Dispatch<React.SetStateAction<string>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setShowDataFilters: React.Dispatch<React.SetStateAction<boolean>>;
  setShowColumnCustomizer: React.Dispatch<React.SetStateAction<boolean>>;
  setCandidateSort: React.Dispatch<React.SetStateAction<CandidateSort>>;
  setSaleFilters: React.Dispatch<React.SetStateAction<string[]>>;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  candidateSort: CandidateSort;
  activeFilterCount: number;
  showDataFilters: boolean;
  canEditColumns: boolean;
  openCreateForm: () => void;
  clearDataFilters: () => void;
}

/** Raw-data list toolbar: view tabs, search, filter toggle and primary actions. */
export const LeadCandidateCommandBar: React.FC<LeadCandidateCommandBarProps> = ({
  showRawOverview,
  currentUser,
  workspaceView,
  setWorkspaceView,
  setSelectedQueueCandidateIds,
  setBatchQueueError,
  setCurrentPage,
  setShowDataFilters,
  setShowColumnCustomizer,
  setCandidateSort,
  setSaleFilters,
  searchTerm,
  setSearchTerm,
  candidateSort,
  activeFilterCount,
  showDataFilters,
  canEditColumns,
  openCreateForm,
  clearDataFilters
}) => (
  <div className="lead-candidate-commandbar">
    <nav
      className="lead-candidate-queues content-tabs content-tabs--compact"
      role="tablist"
      aria-label="Không gian làm việc Sale"
    >
      <button type="button" role="tab" aria-selected={false} onClick={showRawOverview}>
        Tổng quan
      </button>
      {(
        [
          ...(currentUser.role === 'admin'
            ? []
            : [['tasks', 'Công việc cần xử lý'] as [CandidateWorkspaceView, string]]),
          ['all', 'Tất cả dữ liệu']
        ] as Array<[CandidateWorkspaceView, string]>
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={workspaceView === value}
          className={workspaceView === value ? 'is-active' : ''}
          onClick={() => {
            setWorkspaceView(value);
            setSelectedQueueCandidateIds([]);
            setBatchQueueError('');
            setCurrentPage(1);
            setShowDataFilters(false);
            setShowColumnCustomizer(false);
            if (value === 'tasks') setCandidateSort('priority');
            if (value === 'tasks' && currentUser.role !== 'admin') setSaleFilters([]);
          }}
        >
          {value === 'management' && <UserRoundSearch size={15} />}
          {value === 'tasks' && <CalendarClock size={15} />}
          {value === 'all' && currentUser.role !== 'admin' && <ListPlus size={15} />}
          <span>{label}</span>
        </button>
      ))}
    </nav>

    {workspaceView !== 'management' && (
      <section className="lead-candidate-toolbar">
        <label className="lead-candidate-search">
          <Search size={15} />
          <input
            value={searchTerm}
            onChange={event => {
              setSearchTerm(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm doanh nghiệp, MST, điện thoại, người liên hệ..."
          />
        </label>
        <select
          value={candidateSort}
          onChange={event => {
            setCandidateSort(event.target.value as CandidateSort);
            setCurrentPage(1);
          }}
          aria-label="Sắp xếp dữ liệu"
        >
          <option value="priority">Ưu tiên làm việc</option>
          <option value="updated_desc">Mới cập nhật</option>
          <option value="company_asc">Tên doanh nghiệp A–Z</option>
          <option value="next_contact_asc">Lịch gọi gần nhất</option>
        </select>
        <DataFilterButton
          activeCount={activeFilterCount}
          open={showDataFilters}
          onClick={() => setShowDataFilters(true)}
        />
        {canEditColumns && (
          <button
            type="button"
            className="lead-candidate-column-button"
            aria-label="Tùy chỉnh cột"
            title="Tùy chỉnh cột"
            onClick={() => setShowColumnCustomizer(true)}
          >
            <Settings2 size={16} />
          </button>
        )}
        {workspaceView === 'all' && (
          <button type="button" className="btn btn-primary lead-candidate-add-button" onClick={openCreateForm}>
            <Plus size={15} /> Thêm dữ liệu
          </button>
        )}
        {(activeFilterCount > 0 || searchTerm) && (
          <button type="button" className="lead-candidate-clear-filter" onClick={clearDataFilters}>
            <X size={13} /> Đặt lại
          </button>
        )}
      </section>
    )}
  </div>
);
