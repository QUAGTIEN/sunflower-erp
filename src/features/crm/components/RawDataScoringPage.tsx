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

const RULE_DOCUMENT_ID = 'default';
const POINT_OPTIONS = Array.from({ length: 21 }, (_, index) => (index - 10) * 5);
const CAP_OPTIONS = Array.from({ length: 21 }, (_, index) => index * 5);
const cloneRules = (rules: LeadCandidateScoringRules): LeadCandidateScoringRules => ({
  points: { ...rules.points },
  groupCaps: { ...rules.groupCaps }
});
const formatPoints = (points: number) => points > 0 ? `+${points}` : String(points);

export function RawDataScoringPage({ currentUser, onBack }: Props) {
  const [rules, setRules] = useState<LeadCandidateScoringRules>(() => cloneRules(DEFAULT_LEAD_CANDIDATE_SCORING_RULES));
  const [savedRules, setSavedRules] = useState<LeadCandidateScoringRules>(() => cloneRules(DEFAULT_LEAD_CANDIDATE_SCORING_RULES));
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const hasChanges = useMemo(() => !exists || JSON.stringify(rules) !== JSON.stringify(savedRules), [exists, rules, savedRules]);
  const totalCap = Object.values(rules.groupCaps).reduce((sum, value) => sum + value, 0);

  useEffect(() => {
    let active = true;
    void dbService.getDocument('raw_data_scoring_rules', RULE_DOCUMENT_ID).then(value => {
      if (!active) return;
      const next = value ? normalizeLeadCandidateScoringRules(value) : cloneRules(DEFAULT_LEAD_CANDIDATE_SCORING_RULES);
      setRules(next);
      setSavedRules(cloneRules(next));
      setExists(Boolean(value));
    }).catch(() => {
      if (active) setError('Không thể tải cấu hình điểm. Hệ thống đang hiển thị mức mặc định.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const updatePoint = (itemId: string, points: number) => {
    setRules(previous => ({ ...previous, points: { ...previous.points, [itemId]: points } }));
    setMessage('');
  };

  const updateCap = (groupId: string, cap: number) => {
    setRules(previous => ({ ...previous, groupCaps: { ...previous.groupCaps, [groupId]: cap } }));
    setMessage('');
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
    if (!hasChanges || saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    const normalized = normalizeLeadCandidateScoringRules(rules);
    const now = new Date().toISOString();
    const payload = { id: RULE_DOCUMENT_ID, ...normalized, updatedAt: now, updatedById: currentUser.uid, updatedByName: currentUser.displayName };
    try {
      if (exists) await dbService.updateDocument('raw_data_scoring_rules', RULE_DOCUMENT_ID, payload);
      else await dbService.addDocument('raw_data_scoring_rules', payload);
      setRules(normalized);
      setSavedRules(cloneRules(normalized));
      setExists(true);
      setMessage('Đã lưu quy tắc chấm điểm. Điểm tự động sẽ áp dụng theo cấu hình mới.');
      auditService.recordSafely(currentUser, {
        category: 'administration', module: 'lead_candidates', action: 'candidate_scoring_rules_updated',
        summary: `Cập nhật quy tắc chấm điểm ${CUSTOMER_INSIGHT_ITEMS.length} tiêu chí`,
        targetType: 'raw_data_scoring_rules', targetId: RULE_DOCUMENT_ID, targetLabel: 'Quy tắc chấm điểm dữ liệu thô'
      });
    } catch {
      setError('Không thể lưu cấu hình điểm. Vui lòng kiểm tra kết nối hoặc quyền truy cập.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="raw-score-rules" aria-label="Cấu hình điểm khách hàng">
    <header className="raw-score-rules__header">
      <div><h2>Thiết lập điểm tự động</h2><p>Cấu hình trọng số cho {CUSTOMER_INSIGHT_ITEMS.length} tiêu chí. Mọi giá trị đều theo bội số của 5.</p></div>
      <div className="raw-score-rules__header-actions">
        <button type="button" className="btn btn-outline" onClick={goBack}>Quay lại</button>
        <button type="button" className="btn btn-outline" onClick={resetDefaults} disabled={loading || saving}>Khôi phục mặc định</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={loading || saving || !hasChanges}>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
      </div>
    </header>

    <section className="raw-score-rules__summary" aria-label="Tóm tắt cấu hình">
      <div><span>Số tiêu chí</span><strong>{CUSTOMER_INSIGHT_ITEMS.length}</strong></div>
      <div><span>Số nhóm</span><strong>{CUSTOMER_INSIGHT_GROUPS.length}</strong></div>
      <div><span>Tổng giới hạn nhóm</span><strong>{totalCap} điểm</strong></div>
      <p>Điểm cuối cùng luôn được giới hạn từ 0 đến 100. Điểm âm làm giảm mức ưu tiên của khách hàng.</p>
    </section>

    {loading && <p className="raw-score-rules__notice" role="status">Đang tải cấu hình điểm...</p>}
    {error && <p className="raw-score-rules__notice is-error" role="alert">{error}</p>}
    {message && <p className="raw-score-rules__notice is-success" role="status">{message}</p>}

    <div className="raw-score-rules__groups">
      {CUSTOMER_INSIGHT_GROUPS.map((group, groupIndex) => {
        const configuredPoints = group.items.reduce((sum, item) => sum + Math.max(0, rules.points[item.id] || 0), 0);
        return <details key={group.id} className="raw-score-rule-group" open={groupIndex === 0}>
          <summary>
            <span>{groupIndex + 1}. {group.label}</span>
            <span>{group.items.length} tiêu chí · Tổng điểm dương {configuredPoints}</span>
            <label onClick={event => event.stopPropagation()}><span>Giới hạn nhóm</span><select value={rules.groupCaps[group.id]} disabled={loading || saving} onChange={event => updateCap(group.id, Number(event.target.value))}>{CAP_OPTIONS.map(value => <option key={value} value={value}>{value} điểm</option>)}</select></label>
          </summary>
          <div className="raw-score-rule-group__table-wrap">
            <table>
              <thead><tr><th>Tiêu chí phân loại</th><th>Loại tác động</th><th>Điểm tự động</th></tr></thead>
              <tbody>{group.items.map(item => {
                const points = rules.points[item.id] || 0;
                return <tr key={item.id}><td title={item.label}>{item.label}</td><td><span className={`raw-score-rule-group__effect ${points > 0 ? 'is-positive' : points < 0 ? 'is-negative' : 'is-neutral'}`}>{points > 0 ? 'Cộng điểm' : points < 0 ? 'Trừ điểm' : 'Không tính điểm'}</span></td><td><select aria-label={`Điểm cho ${item.label}`} value={points} disabled={loading || saving} onChange={event => updatePoint(item.id, Number(event.target.value))}>{POINT_OPTIONS.map(value => <option key={value} value={value}>{formatPoints(value)} điểm</option>)}</select></td></tr>;
              })}</tbody>
            </table>
          </div>
        </details>;
      })}
    </div>

    <footer className="raw-score-rules__footer">
      <span>{hasChanges ? 'Có thay đổi chưa lưu.' : 'Cấu hình đã được lưu.'}</span>
      <button type="button" className="btn btn-outline" onClick={goBack} disabled={saving}>Hủy</button>
      <button type="button" className="btn btn-primary" onClick={save} disabled={loading || saving || !hasChanges}>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
    </footer>
  </section>;
}
