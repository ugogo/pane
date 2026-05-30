import { useCallback, useRef, useState } from 'react';

const MOD_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

/**
 * Maps a KeyboardEvent.code to the Tauri accelerator token. Tauri's
 * global-shortcut plugin uses Electron-style strings: "CmdOrCtrl", "Shift",
 * "Alt", "F5", "A", "1", etc.
 *
 * Returns null for pure modifier presses (Shift alone, etc.) since those
 * cannot be a complete accelerator.
 */
function codeToToken(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3); // KeyA → A
  if (code.startsWith('Digit')) return code.slice(5); // Digit1 → 1
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
}

/**
 * Click to focus, then press a chord. Live-displays modifiers as you hold
 * them; commits the accelerator when a non-modifier key is pressed. Esc
 * cancels capture; Delete/Backspace clears the binding.
 */
export function ShortcutInput({
  value,
  onCommit,
  onClear,
  placeholder,
}: ShortcutInputProps) {
  const [capturing, setCapturing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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

      // Live preview: show modifiers even before the final key.
      const live: string[] = [];
      if (e.ctrlKey || e.metaKey) live.push('CmdOrCtrl');
      if (e.altKey) live.push('Alt');
      if (e.shiftKey) live.push('Shift');
      if (!MOD_KEYS.has(e.key)) {
        const token = codeToToken(e.code);
        if (token) live.push(token);
      }
      setDraft(live.join('+'));

      // Commit when the chord includes a non-modifier.
      const accel = buildAccelerator(e);
      if (accel) {
        onCommit(accel);
        setCapturing(false);
        ref.current?.blur();
      }
    },
    [onClear, onCommit],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      // Reflect modifier release while still capturing.
      if (!capturing) return;
      const live: string[] = [];
      if (e.ctrlKey || e.metaKey) live.push('CmdOrCtrl');
      if (e.altKey) live.push('Alt');
      if (e.shiftKey) live.push('Shift');
      setDraft(live.join('+'));
    },
    [capturing],
  );

  const display = capturing
    ? draft || 'Press a chord…'
    : value || placeholder || 'Not set';

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="textbox"
      aria-label="Shortcut input"
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
      className={`flex min-h-[2.25rem] cursor-text items-center rounded-md border px-3 font-mono text-sm transition outline-none ${
        capturing
          ? 'border-accent bg-accent/5 text-ink ring-accent/30 ring-2'
          : 'border-line text-ink bg-white hover:border-neutral-300'
      }`}
    >
      <span className={value || capturing ? '' : 'text-neutral-400'}>
        {display}
      </span>
    </div>
  );
}
