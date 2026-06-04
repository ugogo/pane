import { useEffect, useState } from 'react';
import {
  checkForUpdatesOnLaunch,
  installUpdate,
  type PendingUpdate,
} from '@/lib/updater';

export type UpdateNoticeState =
  | { status: 'hidden' }
  | { status: 'available'; update: PendingUpdate; version: string }
  | {
      status: 'installing';
      update: PendingUpdate;
      version: string;
      downloadedBytes: number;
      contentLength?: number;
    }
  | { status: 'installed'; version: string }
  | { status: 'error'; message: string };

/**
 * Checks GitHub Releases once on launch and drives the install lifecycle,
 * surfacing download progress. The returned `install` no-ops unless an update is
 * currently available.
 */
export function useUpdateCheck() {
  const [notice, setNotice] = useState<UpdateNoticeState>({ status: 'hidden' });

  useEffect(() => {
    void checkForUpdatesOnLaunch().then((result) => {
      if (result.status === 'error') {
        setNotice({ status: 'error', message: result.message });
      } else if (result.status === 'available') {
        setNotice({
          status: 'available',
          update: result.update,
          version: result.update.version,
        });
      }
    });
  }, []);

  const install = async () => {
    if (notice.status !== 'available') return;

    const { update, version } = notice;
    let downloadedBytes = 0;
    let contentLength: number | undefined;

    setNotice({
      status: 'installing',
      update,
      version,
      downloadedBytes,
      contentLength,
    });

    const result = await installUpdate(update, (event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength;
        downloadedBytes = 0;
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength;
      }
      setNotice({
        status: 'installing',
        update,
        version,
        downloadedBytes,
        contentLength,
      });
    });

    if (result.status === 'error') {
      setNotice({ status: 'error', message: result.message });
      return;
    }

    setNotice({ status: 'installed', version });
  };

  return { notice, install };
}
