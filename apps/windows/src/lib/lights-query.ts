import {
  detectDxLight,
  detectMsiLighting,
  getDynamicLightingStatus,
  getLightStates,
  listDynamicLightingDevices,
  type DxLightPresence,
  type DynamicLightingDevice,
  type DynamicLightingStatus,
  type LightState,
  type MsiLightingPresence,
} from '@/lib/commands';
import { readQueryPart } from '@/lib/query-parts';
import type { Status } from '@/lib/status';

export type Light =
  | { kind: 'dynamic'; id: string; device: DynamicLightingDevice }
  | { kind: 'msi' }
  | { kind: 'dxlight' };

export interface LightsQueryData {
  lights: Light[];
  savedStates: Record<string, LightState>;
  scan: {
    status: Status;
    message: string;
    disabledReason: string;
  };
}

const dynamicStatusFallback: DynamicLightingStatus = {
  canControl: true,
  hasPackageIdentity: false,
  reason: null,
};

const missingMsi: MsiLightingPresence = {
  present: false,
  vendorId: 0,
  productId: 0,
};

const missingDxLight: DxLightPresence = {
  present: false,
  vendorId: 0,
  productId: 0,
};

export async function fetchLights(): Promise<LightsQueryData> {
  const [dynamicStatus, dynamic, msi, dxlight, states] = await Promise.all([
    readQueryPart(getDynamicLightingStatus, dynamicStatusFallback),
    readQueryPart(listDynamicLightingDevices, [] as DynamicLightingDevice[]),
    readQueryPart(detectMsiLighting, missingMsi),
    readQueryPart(detectDxLight, missingDxLight),
    readQueryPart(getLightStates, {} as Record<string, LightState>),
  ]);
  const disabledReason = dynamicStatus.data.canControl
    ? ''
    : (dynamicStatus.data.reason ?? '');
  const errors = [
    dynamicStatus.error
      ? `Dynamic Lighting status unavailable: ${dynamicStatus.error}`
      : '',
    dynamic.error
      ? `Dynamic Lighting devices unavailable: ${dynamic.error}`
      : '',
    msi.error ? `MSI lighting unavailable: ${msi.error}` : '',
    dxlight.error ? `DX Light unavailable: ${dxlight.error}` : '',
    states.error ? `Saved light states unavailable: ${states.error}` : '',
  ].filter(Boolean);

  const collected: Light[] = [
    ...dynamic.data.map((d) => ({
      kind: 'dynamic' as const,
      id: d.id,
      device: d,
    })),
    ...(msi.data.present ? [{ kind: 'msi' as const }] : []),
    ...(dxlight.data.present ? [{ kind: 'dxlight' as const }] : []),
  ];

  return {
    lights: collected,
    savedStates: states.data,
    scan: {
      status:
        errors.length > 0
          ? collected.length === 0
            ? 'fail'
            : 'warn'
          : collected.length > 0
            ? 'pass'
            : 'warn',
      message:
        errors.join(' ') ||
        (collected.length === 0 ? 'No controllable lights detected.' : ''),
      disabledReason,
    },
  };
}

export function lightKey(l: Light) {
  return l.kind === 'dynamic' ? `dynamic:${l.id}` : l.kind;
}
