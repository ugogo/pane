import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import {
  FluentProvider,
  webLightTheme,
  makeStyles,
  tokens,
  Title2,
  Caption1,
  Badge,
  Link,
  Button,
  Spinner,
  ProgressBar,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  MessageBarActions,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import { AccentCard } from './components/features/AccentCard';
import { BrightnessCard } from './components/features/BrightnessCard';
import { CaptureCard } from './components/features/CaptureCard';
import { InfraCard } from './components/features/InfraCard';
import { LightingCard } from './components/features/LightingCard';
import { MetricsCard } from './components/features/MetricsCard';
import { SoundCard } from './components/features/SoundCard';
import { prepareCaptureWindows } from './lib/commands';
import {
  checkForUpdatesOnLaunch,
  installUpdate,
  restartToApplyUpdate,
  type PendingUpdate,
} from './lib/updater';

type UpdateNoticeState =
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

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const useStyles = makeStyles({
  root: {
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  container: {
    maxWidth: '1024px',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: '24px',
    paddingBottom: '24px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  header: {
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  designLink: {
    marginLeft: 'auto',
    fontSize: '12px',
  },
  version: {
    marginTop: '4px',
    display: 'block',
  },
  notice: {
    marginBottom: '16px',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '8px',
  },
  progressLabel: {
    minWidth: '40px',
    textAlign: 'right',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
});

export function App() {
  const styles = useStyles();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState<UpdateNoticeState>({
    status: 'hidden',
  });

  useEffect(() => {
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void prepareCaptureWindows().catch((err) => {
          console.error('Failed to prepare capture windows', err);
        });
      });
    });

    void getVersion()
      .then(setAppVersion)
      .catch((err) => {
        console.error('Failed to load app version', err);
      });

    void checkForUpdatesOnLaunch().then((result) => {
      if (result.status === 'error') {
        setUpdateNotice({ status: 'error', message: result.message });
      } else if (result.status === 'available') {
        setUpdateNotice({
          status: 'available',
          update: result.update,
          version: result.update.version,
        });
      }
    });

    return () => cancelAnimationFrame(firstFrame);
  }, []);

  const handleInstallUpdate = async () => {
    if (updateNotice.status !== 'available') return;

    const { update, version } = updateNotice;
    let downloadedBytes = 0;
    let contentLength: number | undefined;

    setUpdateNotice({
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

      setUpdateNotice({
        status: 'installing',
        update,
        version,
        downloadedBytes,
        contentLength,
      });
    });

    if (result.status === 'error') {
      setUpdateNotice({ status: 'error', message: result.message });
      return;
    }

    setUpdateNotice({ status: 'installed', version });
  };

  return (
    <FluentProvider theme={webLightTheme} className={styles.root}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <Title2>Pane</Title2>
            {import.meta.env.DEV ? (
              <>
                <Badge appearance="tint" color="warning" size="small">
                  dev
                </Badge>
                <Link href="?view=design" className={styles.designLink}>
                  Design system →
                </Link>
              </>
            ) : null}
          </div>
          <Caption1 className={styles.version}>
            Version {appVersion ?? 'unavailable'}
          </Caption1>
        </header>

        <UpdateNotice
          className={styles.notice}
          progressRowClassName={styles.progressRow}
          progressLabelClassName={styles.progressLabel}
          state={updateNotice}
          onInstall={handleInstallUpdate}
          onRestart={() => void restartToApplyUpdate()}
        />

        <div className={styles.grid}>
          <MetricsCard />
          <CaptureCard />
          <InfraCard />
          <LightingCard />
          <BrightnessCard />
          <SoundCard />
          <AccentCard />
        </div>
      </div>
    </FluentProvider>
  );
}

function UpdateNotice({
  state,
  onInstall,
  onRestart,
  className,
  progressRowClassName,
  progressLabelClassName,
}: {
  state: UpdateNoticeState;
  onInstall: () => void;
  onRestart: () => void;
  className: string;
  progressRowClassName: string;
  progressLabelClassName: string;
}) {
  if (state.status === 'hidden') return null;

  if (state.status === 'error') {
    return (
      <MessageBar className={className} intent="error">
        <MessageBarBody>
          <MessageBarTitle>Update failed</MessageBarTitle>
          {state.message}
        </MessageBarBody>
      </MessageBar>
    );
  }

  if (state.status === 'installed') {
    return (
      <MessageBar className={className} intent="success">
        <MessageBarBody>
          <MessageBarTitle>Pane {state.version} is installed</MessageBarTitle>
          Restart when you are ready.
        </MessageBarBody>
        <MessageBarActions>
          <Button
            appearance="primary"
            icon={<ArrowClockwiseRegular />}
            onClick={onRestart}
          >
            Restart
          </Button>
        </MessageBarActions>
      </MessageBar>
    );
  }

  const isInstalling = state.status === 'installing';
  const progress =
    isInstalling && state.contentLength
      ? Math.min(
          100,
          Math.round((state.downloadedBytes / state.contentLength) * 100),
        )
      : null;
  const progressLabel = isInstalling
    ? progress === null
      ? formatBytes(state.downloadedBytes)
      : `${progress}%`
    : null;

  return (
    <MessageBar className={className} intent="warning">
      <MessageBarBody>
        <MessageBarTitle>Pane {state.version} is available</MessageBarTitle>
        {isInstalling ? 'Installing update…' : 'Update when you are ready.'}
        {isInstalling ? (
          <div className={progressRowClassName}>
            <ProgressBar
              value={progress === null ? undefined : progress / 100}
            />
            <Caption1 className={progressLabelClassName}>
              {progressLabel}
            </Caption1>
          </div>
        ) : null}
      </MessageBarBody>
      <MessageBarActions>
        <Button
          appearance="primary"
          disabled={isInstalling}
          icon={
            isInstalling ? <Spinner size="tiny" /> : <ArrowDownloadRegular />
          }
          onClick={onInstall}
        >
          {isInstalling ? 'Installing' : 'Update'}
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
}
