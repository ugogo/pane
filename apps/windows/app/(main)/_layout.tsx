import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link, Slot, usePathname } from 'expo-router';
import {
  ActivityIcon,
  AlertTriangleIcon,
  CameraIcon,
  CheckCircle2Icon,
  DownloadIcon,
  LanguagesIcon,
  LightbulbIcon,
  Loader2Icon,
  MinusIcon,
  MonitorIcon,
  PowerIcon,
  RotateCcwIcon,
  SmartphoneIcon,
  SquareIcon,
  Volume2Icon,
  XIcon,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Button,
  Card,
  Label,
  MutedText,
  PageTransition,
  Text,
  colors,
  ScrollView,
  View,
  XStack,
  YStack,
} from '@pane/ui';
import { AppBootFailure } from '@/components/app-boot-failure';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { APP_DISPLAY_NAME } from '@/lib/app-name';
import { useAppBoot } from '@/lib/use-app-boot';
import { UpdateCheckContext } from '@/lib/update-check-context';
import { useUpdateCheck, type UpdateNoticeState } from '@/lib/use-update-check';
import { restartToApplyUpdate } from '@/lib/updater';

const modules = [
  {
    path: '/capture',
    label: 'Capture',
    title: 'Capture',
    description: 'Fullscreen and area capture with global shortcuts.',
    icon: CameraIcon,
  },
  {
    path: '/display',
    label: 'Display',
    title: 'Display',
    description: 'Monitor brightness and presets.',
    icon: MonitorIcon,
  },
  {
    path: '/sound',
    label: 'Sound',
    title: 'Sound',
    description: 'Default devices and volume.',
    icon: Volume2Icon,
  },
  {
    path: '/lights',
    label: 'Lights',
    title: 'Lights',
    description: 'Supported lighting hardware.',
    icon: LightbulbIcon,
  },
  {
    path: '/accent',
    label: 'Accents',
    title: 'Accents',
    description: 'Long-press letters for variants.',
    icon: LanguagesIcon,
  },
  {
    path: '/startup',
    label: 'System',
    title: 'System',
    description: 'Windows launch and power commands.',
    icon: PowerIcon,
  },
  {
    path: '/companion',
    label: 'Companion',
    title: 'Companion',
    description: 'Control Pane settings from your iPhone.',
    icon: SmartphoneIcon,
  },
  {
    path: '/diagnostics',
    label: 'Diagnostics',
    title: 'Diagnostics',
    description: 'Memory, startup timing, and process ID.',
    icon: ActivityIcon,
  },
] as const;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MainLayout() {
  const { isBooting, appVersion, bootError } = useAppBoot();
  const updateCheck = useUpdateCheck();

  if (bootError) {
    return <AppBootFailure message={bootError} />;
  }

  if (isBooting) {
    return (
      <YStack height="100vh" overflow="hidden">
        <AppTitlebar />
        <YStack
          flex={1}
          backgroundColor="$background"
          alignItems="center"
          justifyContent="center"
        >
          <Loader2Icon aria-hidden color="$placeholderColor" size={16} />
        </YStack>
      </YStack>
    );
  }

  return (
    <MainShellErrorBoundary>
      <UpdateCheckContext.Provider value={updateCheck}>
        <AppShell
          appVersion={appVersion}
          updateNotice={updateCheck.notice}
          onInstallUpdate={updateCheck.install}
        />
      </UpdateCheckContext.Provider>
    </MainShellErrorBoundary>
  );
}

function MainShellErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary
      renderFallback={(message) => (
        <AppBootFailure title="Pane ran into a problem" message={message} />
      )}
    >
      {children}
    </AppErrorBoundary>
  );
}

function AppShell({
  appVersion,
  updateNotice,
  onInstallUpdate,
}: {
  appVersion: string | null;
  updateNotice: UpdateNoticeState;
  onInstallUpdate: () => void;
}) {
  const contentScrollRef = useRef<ScrollView>(null);
  const pathname = usePathname();
  const matchedModule = modules.find((m) => m.path === pathname);
  const activeModule = matchedModule ?? modules[0];

  useLayoutEffect(() => {
    contentScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [pathname]);

  return (
    <YStack height="100vh" overflow="hidden">
      <AppTitlebar />

      <div className="app-main-frame">
        <div className="app-sidebar">
          <nav aria-label="Pane modules" className="app-nav-list">
            {modules.map(({ path, label, icon: Icon }) => {
              const isActive = pathname === path;
              return (
                <Link
                  key={path}
                  href={path}
                  className={
                    isActive
                      ? 'app-nav-link app-nav-link-active'
                      : 'app-nav-link'
                  }
                >
                  <Icon aria-hidden size={16} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <ScrollView
          ref={contentScrollRef}
          flex={1}
          backgroundColor="$background"
        >
          <YStack
            borderBottomWidth={1}
            borderColor="$borderColor"
            gap="$1"
            padding="$6"
            paddingHorizontal="$8"
            backgroundColor="$background"
            style={{ position: 'sticky', top: 0, zIndex: 10 }}
          >
            <XStack
              gap="$4"
              alignItems="flex-start"
              justifyContent="space-between"
              width="100%"
              style={{ maxWidth: 760, alignSelf: 'center' }}
            >
              <YStack flex={1} gap="$1" style={{ minWidth: 0 }}>
                <Text fontSize="$8" fontWeight="600">
                  {activeModule.title}
                </Text>
                <MutedText fontSize="$3">{activeModule.description}</MutedText>
              </YStack>
              <MutedText
                backgroundColor="$gray2"
                borderColor="$borderColor"
                borderWidth={1}
                style={{ fontFamily: 'monospace' }}
                fontSize="$2"
                paddingHorizontal="$2"
                paddingVertical="$1"
                borderRadius="$3"
              >
                {appVersion ?? 'version unavailable'}
              </MutedText>
            </XStack>
          </YStack>

          <PageTransition
            key={pathname}
            motionKey={pathname}
            backgroundColor="$background"
            gap="$5"
            padding="$6"
            paddingHorizontal="$8"
            width="100%"
            style={{ maxWidth: 760, alignSelf: 'center' }}
          >
            <UpdateNotice
              state={updateNotice}
              onInstall={onInstallUpdate}
              onRestart={() => void restartToApplyUpdate()}
            />
            <Slot />
          </PageTransition>
        </ScrollView>
      </div>
    </YStack>
  );
}

function AppTitlebar() {
  return (
    <div
      className="app-titlebar"
      data-tauri-drag-region
      role="presentation"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest('button')) return;
        void getCurrentWindow().startDragging().catch(console.error);
      }}
    >
      <div className="app-titlebar-left" data-tauri-drag-region>
        <span className="app-titlebar-icon" data-tauri-drag-region>
          <CameraIcon aria-hidden size={12} />
        </span>
        <span className="app-titlebar-title" data-tauri-drag-region>
          {APP_DISPLAY_NAME}
        </span>
      </div>

      <div className="app-titlebar-controls">
        <button
          aria-label="Minimize"
          className="app-window-control"
          type="button"
          onClick={() =>
            void getCurrentWindow().minimize().catch(console.error)
          }
        >
          <MinusIcon aria-hidden size={14} />
        </button>
        <button
          aria-label="Maximize or restore"
          className="app-window-control"
          type="button"
          onClick={() =>
            void getCurrentWindow().toggleMaximize().catch(console.error)
          }
        >
          <SquareIcon aria-hidden size={12} />
        </button>
        <button
          aria-label="Close to tray"
          className="app-window-control app-window-control-close"
          type="button"
          onClick={() => void getCurrentWindow().hide().catch(console.error)}
        >
          <XIcon aria-hidden size={14} />
        </button>
      </div>
    </div>
  );
}

function UpdateNotice({
  state,
  onInstall,
  onRestart,
}: {
  state: UpdateNoticeState;
  onInstall: () => void;
  onRestart: () => void;
}) {
  if (state.status === 'hidden') return null;

  if (state.status === 'error') {
    return (
      <Card
        gap="$2"
        padding="$3"
        style={{
          backgroundColor: colors.errorSurface,
          borderColor: colors.errorBorder,
        }}
      >
        <XStack gap="$2" alignItems="flex-start">
          <AlertTriangleIcon aria-hidden color="$red11" size={16} />
          <YStack flex={1} gap="$1">
            <Text color="$red11" fontWeight="600">
              Update failed
            </Text>
            <Text color="$red11" fontSize="$3">
              {state.message}
            </Text>
          </YStack>
        </XStack>
      </Card>
    );
  }

  if (state.status === 'installed') {
    return (
      <Card padding="$3">
        <XStack gap="$3" alignItems="center" justifyContent="space-between">
          <XStack gap="$2" alignItems="flex-start" style={{ minWidth: 0 }}>
            <CheckCircle2Icon aria-hidden size={16} />
            <YStack style={{ minWidth: 0 }}>
              <Label>Pane {state.version} is installed</Label>
              <MutedText>Restart when ready.</MutedText>
            </YStack>
          </XStack>
          <Button
            icon={<RotateCcwIcon aria-hidden size={16} />}
            btnScale="sm"
            onPress={onRestart}
          >
            Restart
          </Button>
        </XStack>
      </Card>
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
    <Card gap="$3" padding="$3">
      <XStack gap="$3" alignItems="center" justifyContent="space-between">
        <XStack gap="$2" alignItems="flex-start" style={{ minWidth: 0 }}>
          {isInstalling ? (
            <Loader2Icon aria-hidden size={16} />
          ) : (
            <DownloadIcon aria-hidden size={16} />
          )}
          <YStack style={{ minWidth: 0 }}>
            <Label>Pane {state.version} is available</Label>
            <MutedText>
              {isInstalling ? 'Installing update...' : 'Update when ready.'}
            </MutedText>
          </YStack>
        </XStack>
        <Button
          disabled={isInstalling}
          icon={
            isInstalling ? (
              <Loader2Icon aria-hidden size={16} />
            ) : (
              <DownloadIcon aria-hidden size={16} />
            )
          }
          btnScale="sm"
          onPress={onInstall}
        >
          {isInstalling ? 'Installing' : 'Update'}
        </Button>
      </XStack>

      {isInstalling ? (
        <XStack gap="$3" alignItems="center">
          <View
            backgroundColor="$gray3"
            flex={1}
            height={6}
            overflow="hidden"
            borderRadius={999}
          >
            <View
              backgroundColor="$gray9"
              height="100%"
              borderRadius={999}
              width={`${progress ?? 10}%`}
            />
          </View>
          <MutedText fontSize="$2" style={{ width: 48, textAlign: 'right' }}>
            {progressLabel}
          </MutedText>
        </XStack>
      ) : null}
    </Card>
  );
}
