import {
  detectDxLight,
  detectMsiLighting,
  getDynamicLightingStatus,
  getLightStates,
  listDynamicLightingDevices,
  type DynamicLightingDevice,
  type LightState,
} from '@/lib/commands';

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail' | 'disabled';

export type Light =
  | { kind: 'dynamic'; id: string; device: DynamicLightingDevice }
  | { kind: 'msi' }
  | { kind: 'dxlight' };

export interface LightsQueryData {
  lights: Light[];
  savedStates: Record<string, LightState>;
  scan: {
    status: ProbeStatus;
    message: string;
    disabledReason: string;
  };
}

export async function fetchLights(): Promise<LightsQueryData> {
  let disabledReason = '';
  let scanMessage = '';
  let scanStatus: ProbeStatus = 'idle';

  const [dynamic, msi, dxlight, states] = await Promise.all([
    Promise.all([
      getDynamicLightingStatus(),
      listDynamicLightingDevices().catch(() => []),
    ])
      .then(([status, devices]) => {
        disabledReason = status.canControl ? '' : (status.reason ?? '');
        return devices;
      })
      .catch((e: unknown) => {
        scanStatus = 'warn';
        scanMessage = String(e);
        return [];
      }),
    detectMsiLighting().catch(() => ({
      present: false,
      vendorId: 0,
      productId: 0,
    })),
    detectDxLight().catch(() => ({
      present: false,
      vendorId: 0,
      productId: 0,
    })),
    getLightStates().catch(() => ({}) as Record<string, LightState>),
  ]);

  const collected: Light[] = [
    ...dynamic.map((d) => ({
      kind: 'dynamic' as const,
      id: d.id,
      device: d,
    })),
    ...(msi.present ? [{ kind: 'msi' as const }] : []),
    ...(dxlight.present ? [{ kind: 'dxlight' as const }] : []),
  ];

  return {
    lights: collected,
    savedStates: states,
    scan: {
      status:
        scanStatus !== 'idle'
          ? scanStatus
          : collected.length > 0
            ? 'pass'
            : 'warn',
      message:
        scanMessage ||
        (collected.length === 0
          ? 'No controllable lights detected.'
          : `${collected.length} light${collected.length === 1 ? '' : 's'} detected.`),
      disabledReason,
    },
  };
}

export function lightKey(l: Light) {
  return l.kind === 'dynamic' ? `dynamic:${l.id}` : l.kind;
}
