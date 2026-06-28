import { useRef, useState } from 'react';
import { Button } from 'pickle-ui';

const MOD_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

function codeToToken(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `num${code.slice(6).toLowerCase()}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  switch (code) {
    case 'Space':
      return 'Space';
    case 'Enter':
      return 'Enter';
    case 'Tab':
      return 'Tab';
    case 'Escape':
      return 'Escape';
    case 'Backspace':
      return 'Backspace';
    case 'Insert':
    case 'Delete':
    case 'Home':
    case 'End':
    case 'PageUp':
    case 'PageDown':
      return code;
    case 'ArrowUp':
      return 'Up';
    case 'ArrowDown':
      return 'Down';
    case 'ArrowLeft':
      return 'Left';
    case 'ArrowRight':
      return 'Right';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    case 'Backslash':
      return '\\';
    case 'Backquote':
      return '`';
    default:
      return null;
  }
}

function buildAccelerator(
  e: KeyboardEvent | React.KeyboardEvent,
): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (MOD_KEYS.has(e.key)) return null;
  const token = codeToToken(e.code);
  if (!token) return null;
  parts.push(token);
  return parts.join('+');
}

export interface ShortcutInputProps {
  value: string;
  onCommit: (accelerator: string) => void;
  onClear?: () => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function ShortcutInput({
  value,
  onCommit,
  onClear,
  placeholder,
  ariaLabel = 'Shortcut input',
}: ShortcutInputProps) {
  const [capturing, setCapturing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLButtonElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setCapturing(false);
      setDraft('');
      ref.current?.blur();
      return;
    }

    if (
      (e.key === 'Backspace' || e.key === 'Delete') &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey
    ) {
      setDraft('');
      onClear?.();
      return;
    }

    const live: string[] = [];
    if (e.ctrlKey || e.metaKey) live.push('CmdOrCtrl');
    if (e.altKey) live.push('Alt');
    if (e.shiftKey) live.push('Shift');
    if (!MOD_KEYS.has(e.key)) {
      const token = codeToToken(e.code);
      if (token) live.push(token);
    }
    setDraft(live.join('+'));

    const accel = buildAccelerator(e);
    if (accel) {
      onCommit(accel);
      setCapturing(false);
      ref.current?.blur();
    }
  }

  function handleKeyUp(e: React.KeyboardEvent) {
    if (!capturing) return;
    const live: string[] = [];
    if (e.ctrlKey || e.metaKey) live.push('CmdOrCtrl');
    if (e.altKey) live.push('Alt');
    if (e.shiftKey) live.push('Shift');
    setDraft(live.join('+'));
  }

  const display = capturing
    ? draft || 'Press a chord…'
    : value || placeholder || 'Not set';

  return (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      aria-label={ariaLabel}
      aria-pressed={capturing || undefined}
      className="w-full justify-start"
      onFocus={() => {
        setCapturing(true);
        setDraft('');
      }}
      onBlur={() => {
        setCapturing(false);
        setDraft('');
      }}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {display}
    </Button>
  );
}
