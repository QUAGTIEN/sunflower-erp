import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import type { LeadCandidateRecord } from '../model/leadCandidateModels';
import { CUSTOMER_INSIGHT_ITEMS } from '../model/customerInsightCatalog';
import {
  calculateLeadCandidateAutomaticScore,
  DEFAULT_LEAD_CANDIDATE_SCORING_RULES,
  getLeadCandidatePriorityLevel,
  LEAD_CANDIDATE_PRIORITY_LABELS,
  normalizeLeadCandidateScore,
  normalizeLeadCandidateScoringRules,
  type LeadCandidateScoringMode,
  type LeadCandidateScoringRules
} from '../model/leadCandidateScoring';
import './LeadCandidateScoreDialog.css';

interface Props {
  candidate: LeadCandidateRecord;
  currentUser: UserProfile;
  onClose: () => void;
}

const SCORE_OPTIONS = Array.from({ length: 21 }, (_, index) => index * 5);
const formatPoints = (points: number) => points > 0 ? `+${points}` : String(points);

export function LeadCandidateScoreDialog({ candidate, currentUser, onClose }: Props) {
  const initialMode: LeadCandidateScoringMode = candidate.scoringMode === 'manual' ? 'manual' : 'automatic';
  const initialManualScore = normalizeLeadCandidateScore(candidate.manualScore);
  const initialReason = candidate.manualScoreReason || '';
  const [rules, setRules] = useState<LeadCandidateScoringRules>(DEFAULT_LEAD_CANDIDATE_SCORING_RULES);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [mode, setMode] = useState<LeadCandidateScoringMode>(initialMode);
  const [manualScore, setManualScore] = useState(initialManualScore);
  const [reason, setReason] = useState(initialReason);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const hasChanges = mode !== initialMode || manualScore !== initialManualScore || reason !== initialReason;
  const requestClose = useCallback(() => {
    if (saving) return;
    if (hasChanges && !window.confirm('Bạn có thay đổi điểm chưa lưu. Bạn vẫn muốn đóng?')) return;
    onClose();
  }, [hasChanges, onClose, saving]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [requestClose]);

  useEffect(() => {
    let active = true;
    void dbService.getDocument('raw_data_priority_rules', 'scoring-default').then(value => {
      if (active && value) setRules(normalizeLeadCandidateScoringRules(value));
    }).catch(() => {
      if (active) setError('Không tải được cấu hình mới nhất; điểm tự động đang dùng mức mặc định.');
    }).finally(() => {
      if (active) setRulesLoading(false);
    });
    return () => { active = false; };
  }, []);

  const automatic = useMemo(
    () => calculateLeadCandidateAutomaticScore(candidate.customerInsightValues || [], rules),
    [candidate.customerInsightValues, rules]
  );
  const effectiveScore = mode === 'manual' ? normalizeLeadCandidateScore(manualScore) : automatic.automaticScore;
  const priorityLevel = getLeadCandidatePriorityLevel(effectiveScore);

  const save = async () => {
    if (saving || rulesLoading) return;
    if (mode === 'manual' && !reason.trim()) {
      setError('Vui lòng nhập lý do khi chấm điểm thủ công.');
      return;
    }
    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    try {
      await dbService.updateDocument('lead_candidates', candidate.id, {
        scoringMode: mode,
        automaticScore: automatic.automaticScore,
        manualScore: normalizeLeadCandidateScore(manualScore),
        effectiveScore,
        priorityLevel,
        manualScoreReason: mode === 'manual' ? reason.trim() : '',
        scoreBreakdown: automatic.breakdown,
        scoreCalculatedAt: now,
        scoreUpdatedById: currentUser.uid,
        scoreUpdatedByName: currentUser.displayName,
        updatedAt: now,
        updatedBy: currentUser.displayName
      });
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'lead_candidates', action: 'candidate_priority_score_updated',
        summary: `Chấm điểm ${candidate.companyName}: ${effectiveScore} điểm (${mode === 'manual' ? 'thủ công' : 'tự động'})`,
        targetType: 'lead_candidate', targetId: candidate.id, targetLabel: candidate.companyName
      });
      onClose();
    } catch {
      setError('Không thể lưu điểm lúc này. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="candidate-score-dialog__backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <section className="candidate-score-dialog" role="dialog" aria-modal="true" aria-labelledby="candidate-score-dialog-title">
      <header>
        <div><h2 id="candidate-score-dialog-title">Chấm điểm khách hàng</h2><p title={candidate.companyName}>{candidate.companyName}</p></div>
        <button type="button" className="btn btn-outline" onClick={requestClose} disabled={saving}>Đóng</button>
      </header>

      <div className="candidate-score-dialog__summary">
        <div><span>Điểm hiệu lực</span><strong>{effectiveScore}</strong></div>
        <div><span>Mức ưu tiên</span><strong>{LEAD_CANDIDATE_PRIORITY_LABELS[priorityLevel]}</strong></div>
        <div><span>Điểm tự động</span><strong>{rulesLoading ? 'Đang tính...' : automatic.automaticScore}</strong></div>
        <div><span>Phân loại đã có</span><strong>{candidate.customerInsightValues?.length || 0}/{CUSTOMER_INSIGHT_ITEMS.length} mục</strong></div>
      </div>

      <div className="candidate-score-dialog__mode" role="radiogroup" aria-label="Phương thức chấm điểm">
        <label className={mode === 'automatic' ? 'is-active' : ''}><input type="radio" name="candidate-score-mode" checked={mode === 'automatic'} onChange={() => { setMode('automatic'); setError(''); }} /><span><strong>Tự động</strong><small>Dùng điểm từ phân loại khách hàng</small></span></label>
        <label className={mode === 'manual' ? 'is-active' : ''}><input type="radio" name="candidate-score-mode" checked={mode === 'manual'} onChange={() => { setMode('manual'); setError(''); }} /><span><strong>Thủ công</strong><small>Chỉ định trực tiếp điểm hiệu lực</small></span></label>
      </div>

      {mode === 'manual' ? <div className="candidate-score-dialog__manual">
        <label><span>Điểm thủ công *</span><select autoFocus value={manualScore} onChange={event => setManualScore(Number(event.target.value))}>{SCORE_OPTIONS.map(score => <option key={score} value={score}>{score} điểm</option>)}</select></label>
        <label><span>Lý do chấm thủ công *</span><textarea rows={4} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Nhập căn cứ đánh giá khách hàng..." /><small>{reason.length}/500</small></label>
      </div> : <div className="candidate-score-dialog__breakdown">
        <h3>Tiêu chí đang tạo điểm</h3>
        {automatic.breakdown.length ? <div>{automatic.breakdown.map(item => <p key={item.itemId}><span title={item.label}>{item.label}</span><strong className={item.points < 0 ? 'is-negative' : item.points > 0 ? 'is-positive' : ''}>{formatPoints(item.points)}</strong></p>)}</div> : <p className="candidate-score-dialog__empty">Khách hàng chưa có tiêu chí phân loại tạo điểm.</p>}
      </div>}

      {error && <p className="candidate-score-dialog__error" role="alert">{error}</p>}
      <footer><button type="button" className="btn btn-outline" onClick={requestClose} disabled={saving}>Hủy</button><button type="button" className="btn btn-primary" onClick={save} disabled={saving || rulesLoading}>{saving ? 'Đang lưu...' : 'Lưu điểm'}</button></footer>
    </section>
  </div>;
}
