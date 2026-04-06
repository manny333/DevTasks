import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number; // ms, default 4000
}

export default function UndoToast({ message, onUndo, onDismiss, duration = 4000 }: UndoToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss, duration]);

  const handleUndo = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onUndo();
  };

  return createPortal(
    <div className="undo-toast">
      <span className="undo-toast-msg">{message}</span>
      <button className="undo-toast-btn" onClick={handleUndo}>
        Deshacer
      </button>
      <div
        className="undo-toast-bar"
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>,
    document.body
  );
}
