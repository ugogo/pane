import { useState } from 'react';
import type { Status, StatusMessage } from './status';

const IDLE: StatusMessage = { status: 'idle', message: '' };

/**
 * Tracks a single `{ status, message }` for a card's last action. Replaces the
 * ad-hoc `useState<string>()` error fields and reducer `notify` actions the
 * feature cards each grew independently. Pair with `<StatusText>`.
 */
export function useActionStatus(initial: StatusMessage = IDLE) {
  const [state, setState] = useState<StatusMessage>(initial);
  return {
    status: state.status,
    message: state.message,
    set: (status: Status, message = '') => setState({ status, message }),
    clear: () => setState(IDLE),
  };
}
