import { useEffect, useRef } from 'react';
export function GoodsSignaturePad({ disabled, onChange }: { disabled: boolean; onChange: (image: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    stroked = useRef(false);
  const clear = () => {
    const element = canvas.current,
      context = element?.getContext('2d');
    if (element && context) {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, element.width, element.height);
    }
  };
  useEffect(clear, []);
  return (
    <div>
      <span>Chữ ký nhận hàng</span>
      <canvas
        className="goods-signature-pad"
        ref={canvas}
        width={600}
        height={180}
        aria-label="Khung ký nhận hàng"
        aria-disabled={disabled}
        onPointerDown={event => {
          if (disabled) return;
          const element = canvas.current,
            context = element?.getContext('2d');
          if (!element || !context) return;
          const rect = element.getBoundingClientRect();
          context.strokeStyle = '#172554';
          context.lineWidth = 2;
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(
            ((event.clientX - rect.left) * element.width) / rect.width,
            ((event.clientY - rect.top) * element.height) / rect.height
          );
          drawing.current = true;
          stroked.current = false;
          element.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (disabled || !drawing.current) return;
          const element = canvas.current,
            context = element?.getContext('2d');
          if (!element || !context) return;
          const rect = element.getBoundingClientRect();
          context.lineTo(
            ((event.clientX - rect.left) * element.width) / rect.width,
            ((event.clientY - rect.top) * element.height) / rect.height
          );
          context.stroke();
          stroked.current = true;
        }}
        onPointerUp={() => {
          if (drawing.current && stroked.current && !disabled && canvas.current)
            onChange(canvas.current.toDataURL('image/jpeg', 0.7));
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <button
        type="button"
        className="btn btn-outline"
        disabled={disabled}
        onClick={() => {
          clear();
          onChange('');
        }}
      >
        Xóa chữ ký
      </button>
    </div>
  );
}
