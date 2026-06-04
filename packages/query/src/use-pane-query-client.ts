import { useState } from 'react';
import { createPaneQueryClient } from './client';

/**
 * Instantiate the shared Pane QueryClient once per provider mount. Both apps'
 * providers use this so the client-creation pattern lives in one place; the
 * mobile provider layers its NetInfo/AppState wiring on top.
 */
export function usePaneQueryClient() {
  const [client] = useState(createPaneQueryClient);
  return client;
}
