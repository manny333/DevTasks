import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TaskAssignee } from '../../types';

interface MentionTextareaProps {
  value: string;
  onChange: (val: string) => void;
  onMentionsChange: (ids: Set<string>) => void;
  assignees: TaskAssignee[];
  placeholder?: string;
  rows?: number;
}

export default function MentionTextarea({
  value,
  onChange,
  onMentionsChange,
  assignees,
  placeholder,
  rows = 3,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionedIdsRef = useRef(new Set<string>());

  const [query, setQuery] = useState<string | null>(null);
  const [queryStart, setQueryStart] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Filtered list — max 6 results
  const filtered =
    query !== null
      ? assignees
          .filter((a) => a.user.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6)
      : [];

  function updateDropdownPos() {
    const ta = textareaRef.current;
    if (!ta) return;
    const rect = ta.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }

  function detectMention(ta: HTMLTextAreaElement) {
    const cursor = ta.selectionStart;
    const before = ta.value.slice(0, cursor);
    // Match an @ followed by word-chars at the very end of the text-before-cursor
    const match = before.match(/@(\w*)$/);
    if (match) {
      setQuery(match[1]);
      setQueryStart(cursor - match[0].length);
      setActiveIndex(0);
      updateDropdownPos();
    } else {
      setQuery(null);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    detectMention(e.target);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered[activeIndex]) {
        e.preventDefault();
        pickMention(filtered[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setQuery(null);
    }
  }

  function pickMention(assignee: TaskAssignee) {
    const ta = textareaRef.current;
    if (!ta) return;

    const cursor = ta.selectionStart;
    // Use first name so it stays clean in the text
    const firstName = assignee.user.name.split(' ')[0];
    const insertText = `@${firstName} `;
    const newValue = value.slice(0, queryStart) + insertText + value.slice(cursor);

    onChange(newValue);
    mentionedIdsRef.current.add(assignee.userId);
    onMentionsChange(new Set(mentionedIdsRef.current));
    setQuery(null);

    const newCursor = queryStart + insertText.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }

  // Reset tracked mentions when the textarea is cleared (after submit)
  useEffect(() => {
    if (value === '') {
      mentionedIdsRef.current = new Set();
      onMentionsChange(new Set());
    }
  }, [value, onMentionsChange]);

  return (
    <div className="mention-textarea-wrap" style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        // Delay close so a click on a dropdown item can register first
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={placeholder}
        rows={rows}
      />

      {query !== null && filtered.length > 0 && dropdownPos &&
        createPortal(
          <div
            className="mention-dropdown"
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              minWidth: Math.min(dropdownPos.width, 280),
            }}
          >
            {filtered.map((a, i) => (
              <button
                key={a.userId}
                className={`mention-item${i === activeIndex ? ' mention-item--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent textarea blur
                  pickMention(a);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {a.user.avatar ? (
                  <img
                    className="mention-avatar"
                    src={a.user.avatar}
                    alt={a.user.name}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="mention-avatar mention-avatar--init">
                    {a.user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="mention-name">{a.user.name}</span>
              </button>
            ))}
            <div className="mention-hint">↑↓ · Enter · Esc</div>
          </div>,
          document.body
        )}
    </div>
  );
}
