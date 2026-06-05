import type { Pairing } from './types';

export const queryKeys = {
  pairing: ['pairing'] as const,
  companion: (pairing: Pairing) =>
    ['companion', pairing.host, pairing.port, pairing.deviceToken] as const,
};
