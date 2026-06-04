import {
  getInputVolume,
  getOutputVolume,
  listInputDevices,
  listOutputDevices,
  type AudioDevice,
  type VolumeInfo,
} from '@/lib/commands';

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail';

function readVolume(
  read: () => Promise<VolumeInfo>,
): Promise<VolumeInfo | null> {
  return read().catch(() => null);
}

export interface SoundQueryData {
  devices: { output: AudioDevice[]; input: AudioDevice[] };
  volumes: { output: VolumeInfo | null; input: VolumeInfo | null };
  status: ProbeStatus;
  message: string;
}

export async function fetchSound(): Promise<SoundQueryData> {
  const [out, inp, outputVol, inputVol] = await Promise.all([
    listOutputDevices(),
    listInputDevices(),
    readVolume(getOutputVolume),
    readVolume(getInputVolume),
  ]);
  const empty = out.length === 0 && inp.length === 0;
  return {
    devices: { output: out, input: inp },
    volumes: { output: outputVol, input: inputVol },
    status: empty ? 'warn' : 'pass',
    message: empty
      ? 'No audio devices found.'
      : `${out.length} output, ${inp.length} input device${
          out.length + inp.length === 1 ? '' : 's'
        }.`,
  };
}
