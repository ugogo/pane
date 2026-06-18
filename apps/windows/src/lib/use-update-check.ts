import { useEffect, useState } from 'react';
import {
  checkForUpdates,
  installUpdate,
  type PendingUpdate,
  type UpdateCheckResult,
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

export type UpdateCheckState =
  | { status: 'checking' | 'current' | 'skipped' }
  | { status: 'available'; version: string }
  | { status: 'error'; message: string };

function noticeFromResult(result: UpdateCheckResult): UpdateNoticeState | null {
  if (result.status === 'error') {
    return { status: 'error', message: result.message };
  }
  if (result.status === 'available') {
    return {
      status: 'available',
      update: result.update,
      version: result.update.version,
    };
  }
  return null;
}

function stateFromResult(result: UpdateCheckResult): UpdateCheckState {
  if (result.status === 'available') {
    return { status: 'available', version: result.update.version };
  }
  if (result.status === 'error') {
    return { status: 'error', message: result.message };
  }
  return { status: result.status };
}

/**
 * Checks GitHub Releases once on launch, supports manual rechecks, and drives
 * the install lifecycle with download progress. `install` no-ops unless an
 * update is currently available.
 */
export function useUpdateCheck() {
  const [notice, setNotice] = useState<UpdateNoticeState>({ status: 'hidden' });
  const [checkState, setCheckState] = useState<UpdateCheckState>({
    status: 'checking',
  });

  useEffect(() => {
    void checkForUpdates().then((result) => {
      const nextNotice = noticeFromResult(result);
      if (nextNotice) setNotice(nextNotice);
      setCheckState(stateFromResult(result));
    });
  }, []);

  const checkNow = async () => {
    if (
      checkState.status === 'checking' ||
      notice.status === 'installing' ||
      notice.status === 'installed'
    ) {
      return;
    }

    setCheckState({ status: 'checking' });
    if (notice.status === 'error') setNotice({ status: 'hidden' });

    const result = await checkForUpdates();
    setNotice(noticeFromResult(result) ?? { status: 'hidden' });
    setCheckState(stateFromResult(result));
  };

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

  return { notice, checkState, checkNow, install };
}
