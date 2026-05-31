import { useState, type ReactNode } from 'react';
import {
  FluentProvider,
  webLightTheme,
  makeStyles,
  shorthands,
  tokens,
  Title3,
  Subtitle2,
  Body1,
  Caption1,
  Button,
  Badge,
  Card,
  CardHeader,
  Switch,
  Slider,
  Field,
  Input,
  Dropdown,
  Option,
  Spinner,
  Tooltip,
  Divider,
  type BadgeProps,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  ArrowClockwiseRegular,
  DeleteRegular,
  WeatherSunnyRegular,
  Speaker2Regular,
} from '@fluentui/react-icons';

// ── Styles (Griffel; theme-aware via Fluent tokens) ──────────────────────────

const useStyles = makeStyles({
  provider: {
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  layout: {
    display: 'flex',
    gap: '32px',
    maxWidth: '1100px',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: '24px',
    paddingBottom: '24px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  nav: {
    position: 'sticky',
    top: '24px',
    alignSelf: 'flex-start',
    width: '180px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  navLink: {
    textDecorationLine: 'none',
    color: tokens.colorNeutralForeground2,
    paddingTop: '6px',
    paddingBottom: '6px',
    paddingLeft: '12px',
    paddingRight: '12px',
    borderRadius: tokens.borderRadiusMedium,
    fontSize: '14px',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      color: tokens.colorNeutralForeground1,
    },
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    flexGrow: 1,
    minWidth: 0,
  },
  section: {
    scrollMarginTop: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  spec: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '12px',
  },
  specRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    alignItems: 'center',
    gap: '16px',
  },
  specLabel: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
  swatch: {
    width: '160px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  swatchChip: {
    height: '56px',
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
  },
  swatchMeta: {
    display: 'flex',
    flexDirection: 'column',
  },
  mono: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '11px',
    color: tokens.colorNeutralForeground3,
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '420px',
  },
  brandBadge: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingLeft: '8px',
    paddingRight: '8px',
    borderRadius: tokens.borderRadiusCircular,
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
  },
});

type Styles = ReturnType<typeof useStyles>;

// ── Demo state owned by the page; Fluent components stay controlled ──────────

interface DemoState {
  switchOn: boolean;
  volume: number;
  text: string;
  device: string;
}

const INITIAL_DEMO: DemoState = {
  switchOn: true,
  volume: 40,
  text: 'CmdOrCtrl+Shift+4',
  device: 'speakers',
};

type SetDemo = <K extends keyof DemoState>(key: K, value: DemoState[K]) => void;

const DEVICES = [
  { value: 'speakers', label: 'Speakers (Realtek)' },
  { value: 'headset', label: 'Headset (Arctis)' },
  { value: 'monitor', label: 'Monitor (DisplayPort)' },
];

// Pane's probe status mapped onto Fluent Badge colors.
const STATUS_BADGES: { label: string; color: BadgeProps['color'] }[] = [
  { label: 'idle', color: 'informative' },
  { label: 'pass', color: 'success' },
  { label: 'warn', color: 'warning' },
  { label: 'fail', color: 'danger' },
  { label: 'disabled', color: 'subtle' },
];

// Hoisted so it isn't recreated each render (Input.contentBefore).
const sunnyIcon = <WeatherSunnyRegular />;

// ── Layout helpers (module-level so react-hooks/static-components is happy) ───

function Section({
  styles,
  title,
  description,
  children,
}: {
  styles: Styles;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={styles.section}>
      <div className={styles.sectionHead}>
        <Title3>{title}</Title3>
        <Body1>{description}</Body1>
      </div>
      {children}
    </Card>
  );
}

function SpecRow({
  styles,
  label,
  children,
}: {
  styles: Styles;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.specRow}>
      <span className={styles.specLabel}>{label}</span>
      <div className={styles.spec}>{children}</div>
    </div>
  );
}

function Swatch({
  styles,
  name,
  token,
  color,
}: {
  styles: Styles;
  name: string;
  token: string;
  color: string;
}) {
  return (
    <div className={styles.swatch}>
      <div className={styles.swatchChip} style={{ backgroundColor: color }} />
      <div className={styles.swatchMeta}>
        <Caption1>{name}</Caption1>
        <span className={styles.mono}>{token}</span>
        <span className={styles.mono}>{color}</span>
      </div>
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function FoundationsSection({ styles }: { styles: Styles }) {
  return (
    <Section
      styles={styles}
      title="Foundations"
      description="The Fluent 2 web theme (webLightTheme) — Windows-native brand ramp, neutral surfaces and Segoe UI Variable typography. Components below read these tokens, so a dark theme is a one-line swap."
    >
      <Caption1>Key theme tokens</Caption1>
      <div className={styles.spec}>
        <Swatch
          styles={styles}
          name="Brand primary"
          token="colorBrandBackground"
          color="#0f6cbd"
        />
        <Swatch
          styles={styles}
          name="Neutral fg"
          token="colorNeutralForeground1"
          color="#242424"
        />
        <Swatch
          styles={styles}
          name="Surface"
          token="colorNeutralBackground1"
          color="#ffffff"
        />
        <Swatch
          styles={styles}
          name="Stroke"
          token="colorNeutralStroke1"
          color="#d1d1d1"
        />
      </div>
    </Section>
  );
}

function TypographySection({ styles }: { styles: Styles }) {
  return (
    <Section
      styles={styles}
      title="Typography"
      description="Fluent type ramp components (Segoe UI Variable). Use the preset that matches the role rather than raw font sizes."
    >
      <Title3>Title3: section heading</Title3>
      <Subtitle2>Subtitle2: card heading</Subtitle2>
      <Body1>Body1: standard body copy for descriptions.</Body1>
      <Caption1>Caption1: secondary metadata and hints.</Caption1>
    </Section>
  );
}

function ButtonSection({ styles }: { styles: Styles }) {
  return (
    <Section
      styles={styles}
      title="Button"
      description="Fluent Button appearances, sizes, icon support and disabled state."
    >
      <SpecRow styles={styles} label="Appearance">
        <Button appearance="primary">Primary</Button>
        <Button appearance="secondary">Secondary</Button>
        <Button appearance="outline">Outline</Button>
        <Button appearance="subtle">Subtle</Button>
        <Button appearance="transparent">Transparent</Button>
      </SpecRow>
      <SpecRow styles={styles} label="Size">
        <Button size="small">Small</Button>
        <Button size="medium">Medium</Button>
        <Button size="large">Large</Button>
      </SpecRow>
      <SpecRow styles={styles} label="With icon">
        <Button appearance="primary" icon={<ArrowDownloadRegular />}>
          Update
        </Button>
        <Button icon={<ArrowClockwiseRegular />}>Refresh</Button>
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          aria-label="Delete"
        />
      </SpecRow>
      <SpecRow styles={styles} label="Disabled">
        <Button appearance="primary" disabled>
          Primary
        </Button>
        <Button disabled>Secondary</Button>
      </SpecRow>
    </Section>
  );
}

function BadgeSection({ styles }: { styles: Styles }) {
  return (
    <Section
      styles={styles}
      title="Badge"
      description="Status pills for card headers. Pane's idle/pass/warn/fail/disabled map onto Fluent Badge colors."
    >
      <SpecRow styles={styles} label="Status (filled)">
        {STATUS_BADGES.map((b) => (
          <Badge key={b.label} color={b.color}>
            {b.label}
          </Badge>
        ))}
      </SpecRow>
      <SpecRow styles={styles} label="Tint">
        {STATUS_BADGES.map((b) => (
          <Badge key={b.label} appearance="tint" color={b.color}>
            {b.label}
          </Badge>
        ))}
      </SpecRow>
      <SpecRow styles={styles} label="Outline">
        {STATUS_BADGES.map((b) => (
          <Badge key={b.label} appearance="outline" color={b.color}>
            {b.label}
          </Badge>
        ))}
      </SpecRow>
    </Section>
  );
}

function CardSection({ styles }: { styles: Styles }) {
  return (
    <Section
      styles={styles}
      title="Card"
      description="Fluent Card with a header (title + description) and a status badge — the shell for every Pane feature panel."
    >
      <div className={styles.col}>
        <Card>
          <CardHeader
            header={<Subtitle2>Display</Subtitle2>}
            description={
              <Caption1>Per-monitor brightness, contrast and warmth.</Caption1>
            }
            action={<Badge color="success">pass</Badge>}
          />
          <Body1>Card body content sits here.</Body1>
        </Card>
        <Card>
          <CardHeader
            header={<Subtitle2>Lights</Subtitle2>}
            description={<Caption1>No controllable lights detected.</Caption1>}
            action={<Badge color="warning">warn</Badge>}
          />
        </Card>
      </div>
    </Section>
  );
}

function SwitchSection({
  styles,
  checked,
  onChange,
}: {
  styles: Styles;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Section
      styles={styles}
      title="Switch"
      description="Windows-style toggle, replacing the old checkboxes. Controlled by the parent."
    >
      <Switch
        checked={checked}
        onChange={(_, data) => onChange(data.checked)}
        label={checked ? 'Enabled' : 'Disabled'}
      />
      <Switch disabled label="Disabled control" />
    </Section>
  );
}

function SliderSection({
  styles,
  value,
  onChange,
}: {
  styles: Styles;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Section
      styles={styles}
      title="Slider"
      description="Thin accent track for brightness, contrast, warmth and volume. Controlled by the parent."
    >
      <div className={styles.col}>
        <Field label={`Volume — ${value}%`}>
          <Slider
            min={0}
            max={100}
            value={value}
            onChange={(_, data) => onChange(data.value)}
          />
        </Field>
        <Field label="Disabled">
          <Slider min={0} max={100} value={30} disabled />
        </Field>
      </div>
    </Section>
  );
}

function InputSection({
  styles,
  value,
  onChange,
}: {
  styles: Styles;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Section
      styles={styles}
      title="Input & Field"
      description="Labelled text input. Field provides the label, hint and validation slot."
    >
      <div className={styles.col}>
        <Field label="Shortcut" hint="Type a value to see it update.">
          <Input
            value={value}
            onChange={(_, data) => onChange(data.value)}
            contentBefore={sunnyIcon}
          />
        </Field>
        <Field
          label="Validation example"
          validationState="error"
          validationMessage="DDC/CI write failed."
        >
          <Input defaultValue="0xBADCAFE" />
        </Field>
      </div>
    </Section>
  );
}

function DropdownSection({
  styles,
  value,
  onChange,
}: {
  styles: Styles;
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = DEVICES.find((d) => d.value === value);
  return (
    <Section
      styles={styles}
      title="Dropdown"
      description="Device pickers (default output/input). Controlled selection."
    >
      <div className={styles.col}>
        <Field label="Default output device">
          <Dropdown
            value={selected?.label ?? ''}
            selectedOptions={[value]}
            onOptionSelect={(_, data) => onChange(data.optionValue ?? value)}
          >
            {DEVICES.map((d) => (
              <Option key={d.value} value={d.value}>
                {d.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
      </div>
    </Section>
  );
}

function FeedbackSection({ styles }: { styles: Styles }) {
  return (
    <Section
      styles={styles}
      title="Spinner & Tooltip"
      description="Loading and contextual-help affordances for slow DDC/CI and audio operations."
    >
      <SpecRow styles={styles} label="Spinner">
        <Spinner size="tiny" />
        <Spinner size="small" label="Scanning monitors…" />
      </SpecRow>
      <Divider />
      <SpecRow styles={styles} label="Tooltip">
        <Tooltip content="Re-enumerate audio devices" relationship="label">
          <Button icon={<Speaker2Regular />}>Refresh devices</Button>
        </Tooltip>
      </SpecRow>
    </Section>
  );
}

// ── Section registry + dispatcher ─────────────────────────────────────────────

interface SectionDef {
  id: string;
  label: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'foundations', label: 'Foundations' },
  { id: 'typography', label: 'Typography' },
  { id: 'button', label: 'Button' },
  { id: 'badge', label: 'Badge' },
  { id: 'card', label: 'Card' },
  { id: 'switch', label: 'Switch' },
  { id: 'slider', label: 'Slider' },
  { id: 'input', label: 'Input & Field' },
  { id: 'dropdown', label: 'Dropdown' },
  { id: 'feedback', label: 'Spinner & Tooltip' },
];

function SectionContent({
  id,
  styles,
  demo,
  set,
}: {
  id: string;
  styles: Styles;
  demo: DemoState;
  set: SetDemo;
}): ReactNode {
  switch (id) {
    case 'foundations':
      return <FoundationsSection styles={styles} />;
    case 'typography':
      return <TypographySection styles={styles} />;
    case 'button':
      return <ButtonSection styles={styles} />;
    case 'badge':
      return <BadgeSection styles={styles} />;
    case 'card':
      return <CardSection styles={styles} />;
    case 'switch':
      return (
        <SwitchSection
          styles={styles}
          checked={demo.switchOn}
          onChange={(v) => set('switchOn', v)}
        />
      );
    case 'slider':
      return (
        <SliderSection
          styles={styles}
          value={demo.volume}
          onChange={(v) => set('volume', v)}
        />
      );
    case 'input':
      return (
        <InputSection
          styles={styles}
          value={demo.text}
          onChange={(v) => set('text', v)}
        />
      );
    case 'dropdown':
      return (
        <DropdownSection
          styles={styles}
          value={demo.device}
          onChange={(v) => set('device', v)}
        />
      );
    case 'feedback':
      return <FeedbackSection styles={styles} />;
    default:
      return null;
  }
}

function goHome() {
  window.location.search = '';
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function DesignSystem() {
  const styles = useStyles();
  const [demo, setDemoState] = useState<DemoState>(INITIAL_DEMO);

  const set: SetDemo = (key, value) =>
    setDemoState((prev) => ({ ...prev, [key]: value }));

  return (
    <FluentProvider theme={webLightTheme} className={styles.provider}>
      <div className={styles.layout}>
        {/* Sticky table of contents. Deep-link with ?view=design#card. */}
        <nav className={styles.nav}>
          <div className={styles.sectionHead}>
            <Subtitle2>
              Design System <span className={styles.brandBadge}>dev</span>
            </Subtitle2>
            <Caption1>Fluent UI v9 components for the redesign.</Caption1>
          </div>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={styles.navLink}>
              {s.label}
            </a>
          ))}
          <Button appearance="transparent" size="small" onClick={goHome}>
            ← Back to app
          </Button>
        </nav>

        {/* Every section stacked for a single global overview. */}
        <div className={styles.content}>
          {SECTIONS.map((s) => (
            <div key={s.id} id={s.id} className={styles.section}>
              <SectionContent id={s.id} styles={styles} demo={demo} set={set} />
            </div>
          ))}
        </div>
      </div>
    </FluentProvider>
  );
}
