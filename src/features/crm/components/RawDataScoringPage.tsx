import { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { CUSTOMER_INSIGHT_GROUPS, CUSTOMER_INSIGHT_ITEMS } from '../model/customerInsightCatalog';
import {
  DEFAULT_LEAD_CANDIDATE_SCORING_RULES,
  normalizeLeadCandidateScoringRules,
  type LeadCandidateScoringRules
} from '../model/leadCandidateScoring';
import './RawDataScoringPage.css';

interface Props {
  currentUser: UserProfile;
  onBack: () => void;
}

const RULE_COLLECTION = 'raw_data_priority_rules';
const RULE_DOCUMENT_ID = 'scoring-default';
const POINT_OPTIONS = Array.from({ length: 21 }, (_, index) => (index - 10) * 5);
const CAP_OPTIONS = Array.from({ length: 21 }, (_, index) => index * 5);
const cloneRules = (rules: LeadCandidateScoringRules): LeadCandidateScoringRules => ({
  points: { ...rules.points },
  groupCaps: { ...rules.groupCaps }
});
const formatPoints = (points: number) => points > 0 ? `+${points}` : String(points);
const getErrorCode = (error: unknown) => (
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
);

export function RawDataScoringPage({ currentUser, onBack }: Props) {
  const [rules, setRules] = useState<LeadCandidateScoringRules>(() => cloneRules(DEFAULT_LEAD_CANDIDATE_SCORING_RULES));
  const [savedRules, setSavedRules] = useState<LeadCandidateScoringRules>(() => cloneRules(DEFAULT_LEAD_CANDIDATE_SCORING_RULES));
  const [selectedGroupId, setSelectedGroupId] = useState(CUSTOMER_INSIGHT_GROUPS[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const hasChanges = !loading && JSON.stringify(rules) !== JSON.stringify(savedRules);
  const totalCap = Object.values(rules.groupCaps).reduce((sum, value) => sum + value, 0);
  const selectedGroup = useMemo(
    () => CUSTOMER_INSIGHT_GROUPS.find(group => group.id === selectedGroupId) || CUSTOMER_INSIGHT_GROUPS[0],
    [selectedGroupId]
  );
  const visibleItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi');
    if (!normalizedSearch) return selectedGroup?.items || [];
    return (selectedGroup?.items || []).filter(item => item.label.toLocaleLowerCase('vi').includes(normalizedSearch));
  }, [searchTerm, selectedGroup]);

  useEffect(() => {
    let active = true;
    void dbService.getDocument(RULE_COLLECTION, RULE_DOCUMENT_ID).then(value => {
      if (!active) return;
      const next = value ? normalizeLeadCandidateScoringRules(value) : cloneRules(DEFAULT_LEAD_CANDIDATE_SCORING_RULES);
      setRules(next);
      setSavedRules(cloneRules(next));
      setExists(Boolean(value));
      setLoadFailed(false);
    }).catch(loadError => {
      if (!active) return;
      setLoadFailed(true);
      setError(getErrorCode(loadError).includes('permission-denied')
        ? 'Chưa có quyền tải cấu hình điểm. Vui lòng xuất bản Firestore Rules mới nhất.'
        : 'Không thể tải cấu hình điểm. Vui lòng kiểm tra kết nối và thử lại.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const updatePoint = (itemId: string, points: number) => {
    setRules(previous => ({ ...previous, points: { ...previous.points, [itemId]: points } }));
    setMessage('');
    setError('');
  };

  const updateCap = (groupId: string, cap: number) => {
    setRules(previous => ({ ...previous, groupCaps: { ...previous.groupCaps, [groupId]: cap } }));
    setMessage('');
    setError('');
  };

  const resetDefaults = () => {
    setRules(cloneRules(DEFAULT_LEAD_CANDIDATE_SCORING_RULES));
    setMessage('');
    setError('');
  };

  const goBack = () => {
    if (hasChanges && !window.confirm('Bạn có thay đổi chưa lưu. Bạn vẫn muốn rời trang?')) return;
    onBack();
  };

  const save = async () => {
    if (!hasChanges || saving || loadFailed) return;
    setSaving(true);
    setMessage('');
    setError('');
    const normalized = normalizeLeadCandidateScoringRules(rules);
    const now = new Date().toISOString();
    const payload = { id: RULE_DOCUMENT_ID, ...normalized, updatedAt: now, updatedById: currentUser.uid, updatedByName: currentUser.displayName };
    try {
      if (exists) await dbService.updateDocument(RULE_COLLECTION, RULE_DOCUMENT_ID, payload);
      else await dbService.addDocument(RULE_COLLECTION, payload);
      setRules(normalized);
      setSavedRules(cloneRules(normalized));
      setExists(true);
      setMessage('Đã lưu cấu hình điểm tự động.');
      auditService.recordSafely(currentUser, {
        category: 'administration', module: 'lead_candidates', action: 'candidate_scoring_rules_updated',
        summary: `Cập nhật quy tắc chấm điểm ${CUSTOMER_INSIGHT_ITEMS.length} tiêu chí`,
        targetType: 'raw_data_scoring_rules', targetId: RULE_DOCUMENT_ID, targetLabel: 'Quy tắc chấm điểm dữ liệu thô'
      });
    } catch (saveError) {
      setError(getErrorCode(saveError).includes('permission-denied')
        ? 'Tài khoản hiện tại không có quyền lưu cấu hình điểm.'
        : 'Không thể lưu cấu hình điểm. Vui lòng kiểm tra kết nối và thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = loading
    ? 'Đang tải cấu hình'
    : loadFailed
      ? 'Tải cấu hình thất bại'
      : hasChanges
        ? 'Có thay đổi chưa lưu'
        : exists
          ? 'Đã tải cấu hình'
          : 'Đang dùng cấu hình mặc định';
  const statusTone = loading
    ? 'is-loading'
    : loadFailed
      ? 'is-error'
      : hasChanges
        ? 'is-pending'
        : 'is-success';

  return <section className="raw-score-rules" aria-label="Cấu hình điểm khách hàng">
    <header className="raw-score-rules__header">
      <h2>Thiết lập điểm tự động</h2>
      <div className="raw-score-rules__header-actions">
        <button type="button" className="btn btn-outline" onClick={goBack}>Quay lại</button>
        <button type="button" className="btn btn-outline" onClick={resetDefaults} disabled={loading || saving || loadFailed}>Khôi phục mặc định</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={loading || saving || loadFailed || !hasChanges}>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
      </div>
    </header>

    <section className="raw-score-rules__status" aria-label="Trạng thái cấu hình">
      <div><strong>{CUSTOMER_INSIGHT_ITEMS.length} tiêu chí</strong><span aria-hidden="true">•</span><strong>{CUSTOMER_INSIGHT_GROUPS.length} nhóm</strong><span aria-hidden="true">•</span><strong className={totalCap !== 100 ? 'is-warning' : ''}>Giới hạn tổng {totalCap} điểm</strong></div>
      <span className={`raw-score-rules__status-badge ${statusTone}`} role="status">{statusLabel}</span>
    </section>

    {error && <p className="raw-score-rules__notice is-error" role="alert">{error}</p>}
    {message && <p className="raw-score-rules__notice is-success" role="status">{message}</p>}

    <div className="raw-score-rules__workspace">
      <aside className="raw-score-rules__group-list" aria-label="Nhóm tiêu chí">
        <header><h3>Nhóm tiêu chí</h3><span>Giới hạn</span></header>
        <div>
          {CUSTOMER_INSIGHT_GROUPS.map((group, groupIndex) => {
            const isSelected = group.id === selectedGroup?.id;
            const isChanged = rules.groupCaps[group.id] !== savedRules.groupCaps[group.id]
              || group.items.some(item => rules.points[item.id] !== savedRules.points[item.id]);
            return <button
              type="button"
              key={group.id}
              className={`${isSelected ? 'is-selected' : ''} ${isChanged ? 'is-changed' : ''}`}
              aria-pressed={isSelected}
              onClick={() => { setSelectedGroupId(group.id); setSearchTerm(''); }}
            >
              <span className="raw-score-rules__group-name" title={group.label}>{groupIndex + 1}. {group.label}</span>
              <strong>{rules.groupCaps[group.id]} điểm</strong>
            </button>;
          })}
        </div>
      </aside>

      {selectedGroup && <main className="raw-score-rules__editor">
        <header className="raw-score-rules__editor-header">
          <h3>{CUSTOMER_INSIGHT_GROUPS.findIndex(group => group.id === selectedGroup.id) + 1}. {selectedGroup.label}</h3>
          <label><span>Giới hạn nhóm</span><select value={rules.groupCaps[selectedGroup.id]} disabled={loading || saving || loadFailed} onChange={event => updateCap(selectedGroup.id, Number(event.target.value))}>{CAP_OPTIONS.map(value => <option key={value} value={value}>{value} điểm</option>)}</select></label>
        </header>

        <div className="raw-score-rules__search">
          <label htmlFor="raw-score-rule-search">Tìm tiêu chí</label>
          <input id="raw-score-rule-search" type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Nhập tên tiêu chí..." />
        </div>

        <div className="raw-score-rules__table-wrap">
          <table>
            <colgroup><col /><col className="raw-score-rules__effect-column" /><col className="raw-score-rules__point-column" /></colgroup>
            <thead><tr><th>Tiêu chí</th><th>Tác động</th><th>Điểm</th></tr></thead>
            <tbody>{visibleItems.length ? visibleItems.map(item => {
              const points = rules.points[item.id] || 0;
              const isChanged = points !== savedRules.points[item.id];
              return <tr key={item.id} className={isChanged ? 'is-changed' : ''}><td title={item.label}>{item.label}</td><td><span className={`raw-score-rules__effect ${points > 0 ? 'is-positive' : points < 0 ? 'is-negative' : 'is-neutral'}`}>{points > 0 ? 'Tăng' : points < 0 ? 'Giảm' : 'Không đổi'}</span></td><td><select aria-label={`Điểm cho ${item.label}`} value={points} disabled={loading || saving || loadFailed} onChange={event => updatePoint(item.id, Number(event.target.value))}>{POINT_OPTIONS.map(value => <option key={value} value={value}>{formatPoints(value)}</option>)}</select></td></tr>;
            }) : <tr><td colSpan={3} className="raw-score-rules__empty">Không tìm thấy tiêu chí phù hợp.</td></tr>}</tbody>
          </table>
        </div>
      </main>}
    </div>
  </section>;
}
