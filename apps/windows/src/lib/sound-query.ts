import {
  getInputVolume,
  getOutputVolume,
  listInputDevices,
  listOutputDevices,
  type AudioDevice,
  type VolumeInfo,
} from '@/lib/commands';
import { readQueryPart } from '@/lib/query-parts';
import type { Status } from '@/lib/status';

function readVolume(
  read: () => Promise<VolumeInfo>,
): Promise<VolumeInfo | null> {
  return read().catch(() => null);
}

export interface SoundQueryData {
  devices: { output: AudioDevice[]; input: AudioDevice[] };
  volumes: { output: VolumeInfo | null; input: VolumeInfo | null };
  status: Status;
  message: string;
}

export async function fetchSound(): Promise<SoundQueryData> {
  const [outputDevices, inputDevices, outputVol, inputVol] = await Promise.all([
    readQueryPart(listOutputDevices, [] as AudioDevice[]),
    readQueryPart(listInputDevices, [] as AudioDevice[]),
    readVolume(getOutputVolume),
    readVolume(getInputVolume),
  ]);
  const out = outputDevices.data;
  const inp = inputDevices.data;
  const errors = [
    outputDevices.error
      ? `Output devices unavailable: ${outputDevices.error}`
      : '',
    inputDevices.error
      ? `Input devices unavailable: ${inputDevices.error}`
      : '',
  ].filter(Boolean);
  const empty = out.length === 0 && inp.length === 0;
  return {
    devices: { output: out, input: inp },
    volumes: { output: outputVol, input: inputVol },
    status:
      errors.length > 0 ? (empty ? 'fail' : 'warn') : empty ? 'warn' : 'pass',
    message:
      errors.join(' ') ||
      (empty
        ? 'No audio devices found.'
        : `${out.length} output, ${inp.length} input device${
            out.length + inp.length === 1 ? '' : 's'
          }.`),
  };
}
