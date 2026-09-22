import type { CallResult } from './callHistory';

export type CallNextAction = 'none' | 'callback' | 'quote' | 'sample' | 'meeting' | 'zalo' | 'email';

export interface CallDraft {
  need: string;
  product: string;
  quantity: string;
  targetPrice: string;
  note: string;
  potentialLevel: '' | 'high' | 'medium' | 'low';
  nextAction: CallNextAction;
  followUpAt: string;
  followUpNote: string;
}

export const EMPTY_CALL_DRAFT: CallDraft = {
  need: '', product: '', quantity: '', targetPrice: '', note: '', potentialLevel: '',
  nextAction: 'none', followUpAt: '', followUpNote: ''
};

export const CALL_NEXT_ACTION_LABELS: Record<CallNextAction, string> = {
  none: 'Không có', callback: 'Gọi lại', quote: 'Gửi báo giá', sample: 'Gửi mẫu',
  meeting: 'Hẹn gặp', zalo: 'Nhắn Zalo', email: 'Gửi email'
};

export const callDraftStorageKey = (userId: string, subjectKey: string, phone: string) =>
  `sunflower:call-workspace:${userId}:${subjectKey}:${phone}`;

export function callSummaryNote(draft: CallDraft): string {
  return [
    draft.need.trim() && `Nhu cầu: ${draft.need.trim()}`,
    draft.product.trim() && `Sản phẩm: ${draft.product.trim()}`,
    draft.quantity.trim() && `Số lượng: ${draft.quantity.trim()}`,
    draft.targetPrice.trim() && `Giá mục tiêu: ${draft.targetPrice.trim()}`,
    draft.note.trim() && `Ghi chú: ${draft.note.trim()}`,
    draft.potentialLevel && `Mức độ tiềm năng: ${{ high: 'Cao', medium: 'Trung bình', low: 'Thấp' }[draft.potentialLevel]}`,
    draft.nextAction !== 'none' && `Bước tiếp theo: ${CALL_NEXT_ACTION_LABELS[draft.nextAction]}`,
    draft.nextAction !== 'none' && draft.followUpAt && `Thời hạn: ${new Date(draft.followUpAt).toLocaleString('vi-VN')}`,
    draft.nextAction !== 'none' && draft.followUpNote.trim() && `Cần làm: ${draft.followUpNote.trim()}`
  ].filter(Boolean).join('\n');
}

export function validateCallWrap(result: CallResult | '', draft: CallDraft, now = Date.now()): string {
  if (!result || result === 'pending') return 'Vui lòng chọn kết quả cuộc gọi.';
  if (draft.nextAction !== 'none') {
    const followUpAt = new Date(draft.followUpAt).getTime();
    if (!Number.isFinite(followUpAt) || followUpAt <= now || !draft.followUpNote.trim()) {
      return 'Vui lòng nhập thời gian tương lai và nội dung cho bước tiếp theo.';
    }
  }
  const noteLength = callSummaryNote(draft).length;
  return noteLength > 500 ? `Nội dung cuộc gọi vượt giới hạn 500 ký tự (${noteLength}/500). Vui lòng rút gọn ghi chú.` : '';
}
