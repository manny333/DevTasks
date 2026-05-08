import { useRef, useState, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import { es } from 'react-day-picker/locale';
import 'react-day-picker/style.css';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function DatePickerInput({ value, onChange, placeholder, disabled }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value + 'T00:00:00') : undefined;
  const displayText = value ? new Date(value + 'T00:00:00').toLocaleDateString() : '';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleSelect = (day: Date | undefined) => {
    if (day) onChange(day.toISOString().split('T')[0]);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const locale = i18n.language === 'es' ? es : undefined;

  return (
    <div className="date-picker-wrap" ref={ref}>
      <button
        type="button"
        className={`date-picker-trigger ${value ? 'has-value' : ''} ${open ? 'open' : ''}`}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        title={value ? new Date(value + 'T00:00:00').toLocaleDateString() : undefined}
      >
        <svg className="date-picker-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className="date-picker-text">{displayText || placeholder || t('tasks.dueDate')}</span>
        {value && !disabled && (
          <svg className="date-picker-clear" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" onClick={handleClear}>
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        )}
      </button>
      {open && (
        <div className="date-picker-popper">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            locale={locale}
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
}
