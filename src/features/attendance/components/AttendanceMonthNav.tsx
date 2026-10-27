import { useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { RefreshingIndicator } from '@/components/LoadingStates';

interface Props {
  month: string;
  currentMonth: string;
  refreshing: boolean;
  disabled: boolean;
  onSelect: (month: string) => void;
  onRefresh: () => void;
}

const FIRST_MONTH = '2000-01';
const LAST_MONTH = '2099-12';
// A fixed numeric label avoids the browser's localized month text ("Tháng Mười 2026") being clipped.
const monthLabel = (month: string) => `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`;
const shiftMonth = (month: string, offset: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
};

export function AttendanceMonthNav({ month, currentMonth, refreshing, disabled, onSelect, onRefresh }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    try {
      picker.current?.showPicker();
    } catch {
      picker.current?.focus();
    }
  };
  return (
    <div className="attendance-month-controls">
      <RefreshingIndicator active={refreshing} />
      <div className="attendance-month-nav" role="group" aria-label="Chọn tháng">
        <button
          type="button"
          aria-label="Tháng trước"
          title="Tháng trước"
          disabled={disabled || month === FIRST_MONTH}
          onClick={() => onSelect(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="attendance-month-label"
          title="Chọn tháng"
          disabled={disabled}
          onClick={openPicker}
        >
          <CalendarDays />
          <span>{monthLabel(month)}</span>
        </button>
        <input
          ref={picker}
          className="attendance-month-picker"
          aria-label="Tháng chấm công"
          type="month"
          min={FIRST_MONTH}
          max={LAST_MONTH}
          tabIndex={-1}
          value={month}
          disabled={disabled}
          onChange={event => onSelect(event.target.value)}
        />
        <button
          type="button"
          aria-label="Tháng sau"
          title="Tháng sau"
          disabled={disabled || month === LAST_MONTH}
          onClick={() => onSelect(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </button>
      </div>
      <button
        type="button"
        className="btn btn-outline"
        disabled={disabled || month === currentMonth}
        onClick={() => onSelect(currentMonth)}
      >
        Tháng này
      </button>
      <IconButton label="Tải lại" icon={<RefreshCw />} onClick={onRefresh} disabled={disabled || refreshing} />
    </div>
  );
}
