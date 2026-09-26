import React from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ReceiptText,
  UserRoundSearch
} from 'lucide-react';
import './CrmRecordHeader.css';

type CrmRecordDetailTab = 'classification' | 'profile';

interface CrmRecordHeaderTabsProps {
  activeTab: CrmRecordDetailTab;
  classificationCount: number;
  classificationTotal: number;
  classificationLabel: string;
  profileLabel: string;
  ariaLabel: string;
  onTabChange: (tab: CrmRecordDetailTab) => void;
}

interface CrmRecordHeaderFactsProps {
  taxCode: string;
  saleName: string;
  classificationCount: number;
  classificationTotal: number;
  profileCompleted: number;
  profileTotal: number;
  stageLabel: string;
  nextCareLabel: string;
}

interface HeaderProgressProps {
  label: string;
  completed: number;
  total: number;
  color: string;
}

const clampCount = (value: number, total: number) => Math.min(Math.max(0, value), Math.max(0, total));

const HeaderProgress: React.FC<HeaderProgressProps> = ({ label, completed, total, color }) => {
  const safeTotal = Math.max(0, total);
  const safeCompleted = clampCount(completed, safeTotal);
  const percentage = safeTotal > 0 ? Math.round(safeCompleted / safeTotal * 100) : 0;
  const countLabel = `${safeCompleted}/${safeTotal}`;

  return <div className="crm-record-header-facts__progress">
    <span
      className="crm-record-header-facts__ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-valuenow={safeCompleted}
      style={{ background: `conic-gradient(${color} ${percentage}%, #e5edf7 0)` }}
    >
      <b>{countLabel}</b>
    </span>
    <div>
      <span>{label}</span>
      <strong title={`${countLabel} ${label.toLocaleLowerCase('vi-VN')}`}>{countLabel} đã có</strong>
    </div>
  </div>;
};

export const CrmRecordHeaderTabs: React.FC<CrmRecordHeaderTabsProps> = ({
  activeTab,
  classificationCount,
  classificationTotal,
  classificationLabel,
  profileLabel,
  ariaLabel,
  onTabChange
}) => <nav className="crm-record-header-tabs" role="tablist" aria-label={ariaLabel}>
  <button
    type="button"
    role="tab"
    aria-selected={activeTab === 'classification'}
    className={activeTab === 'classification' ? 'is-active' : ''}
    onClick={() => onTabChange('classification')}
  >
    {classificationLabel} <strong>{clampCount(classificationCount, classificationTotal)}/{classificationTotal}</strong>
  </button>
  <button
    type="button"
    role="tab"
    aria-selected={activeTab === 'profile'}
    className={activeTab === 'profile' ? 'is-active' : ''}
    onClick={() => onTabChange('profile')}
  >
    {profileLabel}
  </button>
</nav>;

export const CrmRecordHeaderFacts: React.FC<CrmRecordHeaderFactsProps> = ({
  taxCode,
  saleName,
  classificationCount,
  classificationTotal,
  profileCompleted,
  profileTotal,
  stageLabel,
  nextCareLabel
}) => <div className="crm-record-header-facts">
  <div>
    <ReceiptText size={17} aria-hidden="true" />
    <div><span>Mã số thuế</span><strong title={taxCode}>{taxCode}</strong></div>
  </div>
  <div>
    <UserRoundSearch size={17} aria-hidden="true" />
    <div><span>Sale phụ trách</span><strong title={saleName}>{saleName}</strong></div>
  </div>
  <HeaderProgress label="Phân loại" completed={classificationCount} total={classificationTotal} color="#2563b8" />
  <HeaderProgress label="Thông tin hồ sơ" completed={profileCompleted} total={profileTotal} color="#16895b" />
  <div>
    <CheckCircle2 size={17} aria-hidden="true" />
    <div><span>Giai đoạn hiện tại</span><strong title={stageLabel}>{stageLabel}</strong></div>
  </div>
  <div>
    <CalendarClock size={17} aria-hidden="true" />
    <div><span>Chăm sóc tiếp</span><strong title={nextCareLabel}>{nextCareLabel}</strong></div>
  </div>
</div>;
