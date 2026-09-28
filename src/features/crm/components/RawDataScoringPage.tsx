import { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import type { LeadCandidateRecord } from '../model/leadCandidateModels';
import { CUSTOMER_INSIGHT_GROUPS, CUSTOMER_INSIGHT_ITEMS } from '../model/customerInsightCatalog';
import {
  calculateLeadCandidateAutomaticScore,
  getLeadCandidatePriorityLevel,
  LEAD_CANDIDATE_GROUP_CAPS,
  LEAD_CANDIDATE_PRIORITY_LABELS,
  LEAD_CANDIDATE_SCORE_POINTS,
  normalizeLeadCandidateScore,
  type LeadCandidateScoringMode
} from '../model/leadCandidateScoring';
import './RawDataScoringPage.css';

interface Props {
  candidates: LeadCandidateRecord[];
  currentUser: UserProfile;
  onBack: () => void;
  onOpenCandidate: (id: string) => void;
}

const SCORE_OPTIONS = Array.from({ length: 21 }, (_, index) => index * 5);
const formatPoints = (points: number) => points > 0 ? `+${points}` : String(points);

export function RawDataScoringPage({ candidates, currentUser, onBack, onOpenCandidate }: Props) {
  const availableCandidates = useMemo(() => candidates
    .filter(candidate => candidate.status !== 'converted' && !candidate.convertedLeadId)
    .slice()
    .sort((left, right) => left.companyName.localeCompare(right.companyName, 'vi-VN')), [candidates]);
  const [selectedId, setSelectedId] = useState(() => availableCandidates[0]?.id || '');
  const selectedCandidate = availableCandidates.find(candidate => candidate.id === selectedId) || availableCandidates[0];
  const [mode, setMode] = useState<LeadCandidateScoringMode>('automatic');
  const [manualScore, setManualScore] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedCandidate) return;
    setSelectedId(selectedCandidate.id);
    setMode(selectedCandidate.scoringMode || 'automatic');
    setManualScore(normalizeLeadCandidateScore(selectedCandidate.manualScore));
    setReason(selectedCandidate.manualScoreReason || '');
    setMessage('');
    setError('');
  }, [selectedCandidate?.id]);

  const automatic = useMemo(
    () => calculateLeadCandidateAutomaticScore(selectedCandidate?.customerInsightValues || []),
    [selectedCandidate?.customerInsightValues]
  );
  const effectiveScore = mode === 'manual' ? normalizeLeadCandidateScore(manualScore) : automatic.automaticScore;
  const priorityLevel = getLeadCandidatePriorityLevel(effectiveScore);
  const selectedValues = useMemo(() => new Set(selectedCandidate?.customerInsightValues || []), [selectedCandidate?.customerInsightValues]);

  const saveScore = async () => {
    if (!selectedCandidate || saving) return;
    if (mode === 'manual' && !reason.trim()) {
      setError('Vui lòng nhập lý do khi chấm điểm thủ công.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const now = new Date().toISOString();
    try {
      await dbService.updateDocument('lead_candidates', selectedCandidate.id, {
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
        category: 'business',
        module: 'lead_candidates',
        action: 'candidate_priority_score_updated',
        summary: `Cập nhật điểm ưu tiên ${selectedCandidate.companyName}: ${effectiveScore} điểm (${mode === 'manual' ? 'thủ công' : 'tự động'})`,
        targetType: 'lead_candidate',
        targetId: selectedCandidate.id,
        targetLabel: selectedCandidate.companyName
      });
      setMessage(`Đã lưu ${effectiveScore} điểm cho ${selectedCandidate.companyName}.`);
    } catch {
      setError('Không thể lưu điểm lúc này. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedCandidate) {
    return <section className="raw-scoring-page">
      <div className="raw-scoring-page__empty">
        <h2>Chấm điểm khách hàng</h2>
        <p>Chưa có hồ sơ dữ liệu thô phù hợp để chấm điểm.</p>
        <button type="button" className="btn btn-outline" onClick={onBack}>Quay lại tổng quan</button>
      </div>
    </section>;
  }

  return <section className="raw-scoring-page" aria-label="Chấm điểm khách hàng">
    <div className="raw-scoring-page__toolbar">
      <button type="button" className="btn btn-outline" onClick={onBack}>Quay lại</button>
      <label>
        <span>Khách hàng</span>
        <select value={selectedCandidate.id} onChange={event => setSelectedId(event.target.value)}>
          {availableCandidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.companyName}</option>)}
        </select>
      </label>
      <div className="raw-scoring-page__identity">
        <strong title={selectedCandidate.companyName}>{selectedCandidate.companyName}</strong>
        <span>MST: {selectedCandidate.taxCode || 'Chưa cập nhật'} · Sale: {selectedCandidate.assignedSaleName || 'Chưa phân công'}</span>
      </div>
      <button type="button" className="btn btn-outline" onClick={() => onOpenCandidate(selectedCandidate.id)}>Mở hồ sơ phân loại</button>
    </div>

    <div className="raw-scoring-page__layout">
      <section className="raw-scoring-page__rules" aria-labelledby="raw-scoring-rules-title">
        <header>
          <div><h2 id="raw-scoring-rules-title">Điểm tự động theo phân loại</h2><p>Điểm được tính từ các mục đã xác nhận trong hồ sơ khách hàng.</p></div>
          <strong>{selectedValues.size}/{CUSTOMER_INSIGHT_ITEMS.length} mục</strong>
        </header>
        <div className="raw-scoring-page__groups">
          {CUSTOMER_INSIGHT_GROUPS.map((group, index) => {
            const selectedItems = group.items.filter(item => selectedValues.has(item.id));
            return <details key={group.id} className="raw-scoring-group" open={index === 0}>
              <summary>
                <span>{index + 1}. {group.label}</span>
                <strong>{selectedItems.length}/{group.items.length} mục · Tối đa {LEAD_CANDIDATE_GROUP_CAPS[group.id]} điểm</strong>
              </summary>
              <div className="raw-scoring-group__table-wrap">
                <table>
                  <thead><tr><th>Tiêu chí</th><th>Trạng thái</th><th>Điểm</th></tr></thead>
                  <tbody>{group.items.map(item => {
                    const checked = selectedValues.has(item.id);
                    const points = LEAD_CANDIDATE_SCORE_POINTS[item.id] || 0;
                    return <tr key={item.id} className={checked ? 'is-selected' : ''}>
                      <td title={item.label}>{item.label}</td>
                      <td>{checked ? 'Đã xác nhận' : 'Chưa xác nhận'}</td>
                      <td><strong className={points < 0 ? 'is-negative' : points > 0 ? 'is-positive' : ''}>{formatPoints(points)}</strong></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            </details>;
          })}
        </div>
      </section>

      <aside className="raw-scoring-page__sidebar">
        <section className={`raw-scoring-summary raw-scoring-summary--${priorityLevel}`}>
          <div className="raw-scoring-summary__score"><strong>{effectiveScore}</strong><span>Điểm hiệu lực</span></div>
          <div><h2>Ưu tiên {LEAD_CANDIDATE_PRIORITY_LABELS[priorityLevel].toLocaleLowerCase('vi-VN')}</h2><p>Điểm dùng để sắp xếp thứ tự khai thác khách hàng.</p></div>
          <dl><div><dt>Tự động</dt><dd>{automatic.automaticScore}</dd></div><div><dt>Thủ công</dt><dd>{mode === 'manual' ? manualScore : 'Chưa dùng'}</dd></div></dl>
        </section>

        <section className="raw-scoring-page__mode" aria-labelledby="raw-scoring-mode-title">
          <h2 id="raw-scoring-mode-title">Phương thức chấm điểm</h2>
          <div className="raw-scoring-page__mode-options">
            <label className={mode === 'automatic' ? 'is-active' : ''}><input type="radio" name="scoring-mode" value="automatic" checked={mode === 'automatic'} onChange={() => setMode('automatic')} /><span>Tự động</span><small>Dùng điểm từ phân loại khách hàng</small></label>
            <label className={mode === 'manual' ? 'is-active' : ''}><input type="radio" name="scoring-mode" value="manual" checked={mode === 'manual'} onChange={() => setMode('manual')} /><span>Thủ công</span><small>Chỉ định trực tiếp điểm hiệu lực</small></label>
          </div>
          {mode === 'manual' && <div className="raw-scoring-page__manual-fields">
            <label><span>Điểm thủ công *</span><select value={manualScore} onChange={event => setManualScore(Number(event.target.value))}>{SCORE_OPTIONS.map(score => <option key={score} value={score}>{score} điểm</option>)}</select></label>
            <label><span>Lý do chấm thủ công *</span><textarea rows={4} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Nhập căn cứ đánh giá khách hàng..." /><small>{reason.length}/500</small></label>
          </div>}
          {selectedCandidate.scoreUpdatedByName && <p className="raw-scoring-page__updated">Cập nhật gần nhất bởi {selectedCandidate.scoreUpdatedByName}{selectedCandidate.scoreCalculatedAt ? ` · ${new Date(selectedCandidate.scoreCalculatedAt).toLocaleString('vi-VN')}` : ''}</p>}
        </section>

        <section className="raw-scoring-page__breakdown" aria-labelledby="raw-scoring-breakdown-title">
          <h2 id="raw-scoring-breakdown-title">Chi tiết điểm tự động</h2>
          <div>{automatic.breakdown.length ? automatic.breakdown.map(item => <p key={item.itemId}><span title={item.label}>{item.label}</span><strong className={item.points < 0 ? 'is-negative' : item.points > 0 ? 'is-positive' : ''}>{formatPoints(item.points)}</strong></p>) : <p className="raw-scoring-page__muted">Chưa có mục phân loại được xác nhận.</p>}</div>
          <footer><span>Tổng sau giới hạn nhóm</span><strong>{automatic.automaticScore} điểm</strong></footer>
        </section>
      </aside>
    </div>

    <footer className="raw-scoring-page__footer">
      <div>{error && <p className="is-error" role="alert">{error}</p>}{message && <p className="is-success" role="status">{message}</p>}</div>
      <button type="button" className="btn btn-outline" onClick={onBack} disabled={saving}>Hủy</button>
      <button type="button" className="btn btn-primary" onClick={saveScore} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu điểm'}</button>
    </footer>
  </section>;
}
