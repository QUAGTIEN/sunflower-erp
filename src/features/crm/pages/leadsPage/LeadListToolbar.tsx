import React from 'react';
import { Search, Settings2, X, Plus } from 'lucide-react';
import { DataFilterButton } from '@/components/DataWorkspaceFilters';
import { useLanguage } from '@/context/LanguageContext';

interface LeadListToolbarProps {
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  setLeadCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  leadActiveFilterCount: number;
  showLeadFilters: boolean;
  setShowLeadFilters: React.Dispatch<React.SetStateAction<boolean>>;
  canEditColumns: boolean;
  setShowColumnCustomizer: React.Dispatch<React.SetStateAction<boolean>>;
  clearFilters: () => void;
  openCreateForm: () => void;
}

/** Lead list toolbar: search, sort, filter toggle, column settings and create button. */
export const LeadListToolbar: React.FC<LeadListToolbarProps> = ({
  searchTerm,
  setSearchTerm,
  setLeadCurrentPage,
  leadActiveFilterCount,
  showLeadFilters,
  setShowLeadFilters,
  canEditColumns,
  setShowColumnCustomizer,
  clearFilters,
  openCreateForm
}) => {
  const { t } = useLanguage();
  return (
    <section className="lead-page-navigation__tools lead-candidate-toolbar">
      <div className="lead-search">
        <Search size={16} />
        <input
          value={searchTerm}
          onChange={event => {
            setSearchTerm(event.target.value);
            setLeadCurrentPage(1);
          }}
          placeholder={t('Tìm công ty, liên hệ, SĐT, địa chỉ, nhu cầu, nhãn...')}
        />
      </div>
      <DataFilterButton
        activeCount={leadActiveFilterCount}
        open={showLeadFilters}
        onClick={() => setShowLeadFilters(true)}
      />
      {canEditColumns && (
        <button
          type="button"
          className="lead-candidate-column-button"
          aria-label={t('Tùy chỉnh cột')}
          title={t('Tùy chỉnh cột')}
          onClick={() => setShowColumnCustomizer(true)}
        >
          <Settings2 size={16} />
        </button>
      )}
      {(searchTerm || leadActiveFilterCount > 0) && (
        <button type="button" className="btn btn-outline lead-toolbar-reset" onClick={clearFilters}>
          <X size={14} /> Đặt lại
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={openCreateForm}>
        <Plus size={16} /> {t('Thêm Lead')}
      </button>
    </section>
  );
};
