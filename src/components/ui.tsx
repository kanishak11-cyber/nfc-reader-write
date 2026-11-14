import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gradient, mono, radius, space, type, useTheme, type Theme } from '@/lib/theme';

import { Icon, type IconName } from './Icon';

/* Press ------------------------------------------------------------ */

/** Every pressable clay surface sinks 2px and swaps to the pressed shadow while held. */
function ClayPressable({
  onPress,
  style,
  shadow,
  disabled,
  children,
  ...a11y
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  shadow: string | null;
  disabled?: boolean;
  children: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab' | 'switch';
  accessibilityState?: { disabled?: boolean; busy?: boolean; selected?: boolean; checked?: boolean };
  hitSlop?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      {...a11y}
      style={({ pressed }) => [
        style,
        shadow ? { boxShadow: pressed ? t.clayPressed : shadow } : null,
        pressed ? { transform: [{ translateY: 2 }] } : null,
        disabled ? { opacity: 0.45 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/* Screen ----------------------------------------------------------- */

export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
export const goHome = () => (router.canGoBack() ? router.dismissAll() : router.replace('/'));

/**
 * A screen on `bg`: header on top, content in a column with section gaps, and an
 * optional footer (the screen's one primary button) pinned to the bottom.
 */
export function Screen({
  title,
  header,
  action,
  footer,
  onBack,
  gap = space.xl,
  children,
}: {
  title?: string;
  /** Replaces the back-and-title header, e.g. the app header on Home. */
  header?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  /** Overrides the back button, e.g. to step back inside a multi-step screen. */
  onBack?: () => void;
  gap?: number;
  children: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + space.md,
          paddingBottom: footer ? space.sm : insets.bottom + space.xxl,
          paddingHorizontal: space.xl,
          gap,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {header ?? (
          <View style={styles.screenHeader}>
            <IconButton icon="back" label="Back" onPress={onBack ?? goBack} />
            <Text style={[type.title, styles.screenTitle, { color: t.ink }]} accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.headerSide}>{action}</View>
          </View>
        )}
        {children}
      </ScrollView>
      {footer ? (
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.lg, gap: space.md }}>{footer}</View>
      ) : null}
    </View>
  );
}

/** Icon tile with the NFC glyph beside the app name. */
export function AppHeader({ title }: { title: string }) {
  const t = useTheme();
  return (
    <View style={styles.appHeader}>
      <IconTile icon="nfc" size="lg" />
      <Text style={[type.title, { color: t.ink, flex: 1 }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/* Surfaces --------------------------------------------------------- */

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, boxShadow: t.clayLg }, style]}>{children}</View>;
}

/** Smaller clay panel for a toggle, a meter or a single line of tag data. */
export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.panel, { backgroundColor: t.surface, boxShadow: t.clayMd }, style]}>{children}</View>;
}

/** Pushes what follows to the bottom of the screen, as the design's flexible gaps do. */
export function Spacer() {
  return <View style={{ flex: 1 }} />;
}

/** Quiet group heading above a list: "Recent", "Today". */
export function GroupLabel({ children, right }: { children: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.groupLabelRow}>
      <Text style={[type.group, { color: t.inkMuted, flex: 1 }]} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

/** Section prompt, e.g. "What do you want to write?" */
export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[type.heading, { color: t.ink, flex: 1 }]} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

export function IconTile({ icon, size = 'md' }: { icon: IconName; size?: 'sm' | 'md' | 'lg' }) {
  const t = useTheme();
  const box = size === 'lg' ? 64 : size === 'sm' ? 40 : 52;
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: size === 'lg' ? 22 : size === 'sm' ? 14 : radius.sm,
        backgroundColor: size === 'lg' ? t.surface : t.surfaceTint,
        boxShadow: t.claySm,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Icon name={icon} size={size === 'lg' ? 34 : size === 'sm' ? 20 : 26} strokeWidth={2.4} color={t.violetInk} />
    </View>
  );
}

/* Buttons ---------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';

/**
 * Pill button. `primary` is the brand gradient: use it once per screen, for the action
 * the screen exists for.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconEnd,
  loading = false,
  disabled = false,
  size = 'md',
  flex = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  iconEnd?: IconName;
  /** Share a row equally with sibling buttons. */
  flex?: boolean;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
}) {
  const t = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; shadow: string | null }> = {
    primary: { bg: t.violet500, fg: t.onViolet, shadow: t.clayViolet },
    secondary: { bg: t.surface, fg: t.ink, shadow: t.clayMd },
    danger: { bg: t.dangerSoft, fg: t.danger, shadow: t.clayMd },
    quiet: { bg: 'transparent', fg: t.violetInk, shadow: null },
  };
  const c = palette[variant];
  const inactive = disabled || loading;
  const small = size === 'sm';

  return (
    <ClayPressable
      onPress={onPress}
      disabled={inactive}
      shadow={c.shadow}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.button,
        { height: small ? 46 : 60, paddingHorizontal: small ? 22 : 32, gap: small ? 8 : 12, backgroundColor: c.bg },
        variant === 'primary' ? { experimental_backgroundImage: gradient.button } : null,
        flex ? { flex: 1, paddingHorizontal: space.md } : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={small ? 20 : 26} strokeWidth={2.4} color={c.fg} /> : null}
          <Text style={[small ? styles.buttonLabelSm : styles.buttonLabel, { color: c.fg, flexShrink: 1 }]} numberOfLines={1}>
            {label}
          </Text>
          {iconEnd ? <Icon name={iconEnd} size={20} strokeWidth={2.4} color={c.fg} /> : null}
        </>
      )}
    </ClayPressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 'md',
  accent = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: 'md' | 'sm';
  accent?: boolean;
}) {
  const t = useTheme();
  const small = size === 'sm';
  return (
    <ClayPressable
      onPress={onPress}
      shadow={small ? t.claySm : t.clayMd}
      accessibilityLabel={label}
      hitSlop={small ? 8 : 0}
      style={{
        width: small ? 40 : 56,
        height: small ? 40 : 56,
        borderRadius: small ? 14 : 20,
        backgroundColor: t.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={small ? 20 : 26} strokeWidth={2.2} color={accent ? t.violetInk : t.ink} />
    </ClayPressable>
  );
}

export function CopyButton({ value, label = 'Copy', size = 'sm' }: { value: string; label?: string; size?: 'md' | 'sm' }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      icon={copied ? 'check' : 'copy'}
      label={copied ? 'Copied' : label}
      size={size}
      accent={size === 'sm'}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    />
  );
}

/* Cards, tiles and rows -------------------------------------------- */

/** Large home card. `violet` is the brand gradient and marks the screen's one main action. */
export function FeatureCard({
  tone = 'surface',
  icon,
  title,
  description,
  onPress,
  disabled,
}: {
  tone?: 'violet' | 'surface';
  icon: IconName;
  title: string;
  description?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  const isViolet = tone === 'violet';
  const fg = isViolet ? t.onViolet : t.ink;
  return (
    <ClayPressable
      onPress={onPress}
      disabled={disabled}
      shadow={isViolet ? t.clayViolet : t.clayLg}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      style={[
        styles.feature,
        { backgroundColor: isViolet ? t.violet500 : t.surface },
        isViolet ? { experimental_backgroundImage: gradient.card } : null,
      ]}
    >
      <View style={{ marginBottom: 10 }}>
        {isViolet ? <Icon name={icon} size={52} strokeWidth={2.6} color={fg} /> : <IconTile icon={icon} />}
      </View>
      <Text style={[type.heading, { color: fg }]}>{title}</Text>
      {description ? <Text style={[type.caption, { color: isViolet ? fg : t.inkMuted }]}>{description}</Text> : null}
      <View style={[styles.featureGo, { backgroundColor: isViolet ? '#ffffff' : t.surface, boxShadow: t.claySm }]}>
        <Icon name="chevron" size={18} strokeWidth={2.6} color={isViolet ? t.violet600 : t.violetInk} />
      </View>
    </ClayPressable>
  );
}

export function QuickTile({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <ClayPressable onPress={onPress} disabled={disabled} shadow={t.clayMd} style={[styles.quick, { backgroundColor: t.surface }]}>
      <Icon name={icon} size={34} strokeWidth={2.2} color={t.violetInk} />
      <Text style={[type.bodyStrong, { color: t.ink, lineHeight: 22 }]}>{label}</Text>
    </ClayPressable>
  );
}

export function OptionRow({
  icon,
  title,
  subtitle,
  onPress,
  selected,
  end,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  selected?: boolean;
  /** Replaces the chevron; a string (e.g. a time) is set as quiet text. */
  end?: ReactNode;
}) {
  const t = useTheme();
  return (
    <ClayPressable
      onPress={onPress}
      disabled={!onPress}
      shadow={t.clayMd}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={[styles.row, { backgroundColor: t.surface, borderColor: selected ? t.violet500 : 'transparent', opacity: 1 }]}
    >
      <IconTile icon={icon} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: t.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { color: t.inkMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof end === 'string' ? (
        <Text style={[type.caption, { color: t.inkMuted }]}>{end}</Text>
      ) : (
        end ?? (onPress ? <Icon name="chevron" size={22} strokeWidth={2.4} color={t.ink} /> : null)
      )}
    </ClayPressable>
  );
}

/* Data ------------------------------------------------------------- */

type Tone = 'neutral' | 'violet' | 'success' | 'danger' | 'warning';

function toneColors(t: Theme, tone: Tone) {
  return {
    neutral: { bg: t.surfaceTint, fg: t.ink },
    violet: { bg: t.surfaceTint, fg: t.violetInk },
    success: { bg: t.successSoft, fg: t.success },
    danger: { bg: t.dangerSoft, fg: t.danger },
    warning: { bg: t.warningSoft, fg: t.warning },
  }[tone];
}

export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: IconName; children: string }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      {icon ? <Icon name={icon} size={14} strokeWidth={2.6} color={c.fg} /> : null}
      <Text style={[type.micro, { color: c.fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

export function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(value, max));
  const percent = max > 0 ? Math.round((clamped / max) * 100) : 0;
  return (
    <View style={{ gap: space.sm }} accessible accessibilityLabel={`${label}: ${value} of ${max} bytes`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[type.micro, { color: t.ink, fontSize: 13, lineHeight: 18, letterSpacing: 0 }]}>{label}</Text>
        <Text style={[type.mono, { color: t.inkMuted, fontSize: 13 }]}>
          {value} / {max} bytes
        </Text>
      </View>
      <View style={[styles.meterTrack, { backgroundColor: t.surfaceSunk, boxShadow: t.clayWell }]}>
        <View
          style={{
            width: `${Math.max(percent, 6)}%`,
            height: '100%',
            borderRadius: radius.pill,
            backgroundColor: value > max ? t.danger : t.violet500,
            experimental_backgroundImage: value > max ? undefined : gradient.bar,
            boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.4)',
          }}
        />
      </View>
    </View>
  );
}

export function InfoRow({
  label,
  value,
  monospace = false,
  copyable = false,
  last = false,
  tone,
}: {
  label: string;
  value: string;
  monospace?: boolean;
  copyable?: boolean;
  last?: boolean;
  tone?: 'ok' | 'warn' | 'bad' | 'info';
}) {
  const t = useTheme();
  const color = tone ? { ok: t.success, warn: t.warning, bad: t.danger, info: t.violetInk }[tone] : t.ink;
  return (
    <View style={[styles.infoRow, !last && { borderBottomColor: t.line, borderBottomWidth: 1 }]}>
      <Text style={[type.micro, { color: t.inkMuted }]}>{label}</Text>
      <View style={styles.infoValueWrap}>
        <Text selectable style={[monospace ? type.mono : type.body, { color, flexShrink: 1 }]}>
          {value}
        </Text>
        {copyable ? <CopyButton value={value} /> : null}
      </View>
    </View>
  );
}

/* Status banner ---------------------------------------------------- */

const NOTICE_ICON: Record<'info' | 'success' | 'warning' | 'danger', IconName> = {
  info: 'info',
  success: 'check',
  warning: 'lock',
  danger: 'close',
};

/** Status always travels with an icon and a word, on its own soft ground. */
export function Notice({
  tone,
  title,
  message,
  icon,
  action,
}: {
  tone: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  message?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  const t = useTheme();
  const colors = {
    info: { bg: t.surfaceTint, fg: t.violetInk },
    success: { bg: t.successSoft, fg: t.success },
    warning: { bg: t.warningSoft, fg: t.warning },
    danger: { bg: t.dangerSoft, fg: t.danger },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: colors.bg, boxShadow: t.claySm }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <View style={[styles.noticeIcon, { backgroundColor: t.surface, boxShadow: t.claySm }]}>
        <Icon name={icon ?? NOTICE_ICON[tone]} size={18} strokeWidth={2.8} color={colors.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: t.ink, fontSize: 16, lineHeight: 22 }]}>{title}</Text>
        {message ? (
          <Text selectable style={[type.caption, { color: t.ink }]}>
            {message}
          </Text>
        ) : null}
        {action ? <View style={{ marginTop: space.sm, alignItems: 'flex-start' }}>{action}</View> : null}
      </View>
    </View>
  );
}

/* Form ------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  icon,
  mono: monospace = false,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null; icon?: IconName; mono?: boolean }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[type.caption, { fontFamily: type.micro.fontFamily, color: t.ink }]}>{label}</Text>
      <View
        style={[
          styles.well,
          {
            backgroundColor: t.surfaceSunk,
            boxShadow: t.clayWell,
            borderColor: error ? t.danger : focused ? t.violet500 : t.lineStrong,
            minHeight: input.multiline ? 104 : 58,
            alignItems: input.multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        {icon ? <Icon name={icon} size={22} strokeWidth={2.2} color={t.violetInk} /> : null}
        <TextInput
          placeholderTextColor={t.inkMuted}
          accessibilityLabel={label}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[type.body, styles.input, monospace ? mono : null, { color: t.ink, textAlignVertical: input.multiline ? 'top' : 'center' }]}
        />
      </View>
      {error || hint ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {error ? <Icon name="alert" size={16} strokeWidth={2.4} color={t.danger} /> : null}
          <Text style={[type.caption, { color: error ? t.danger : t.inkMuted, flex: 1 }]}>{error ?? hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Filter chips. The selected one gets the violet outline, not a violet fill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  inset = space.xl,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Side padding of the container it bleeds out of. */
  inset?: number;
}) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -inset, flexGrow: 0 }}
      contentContainerStyle={{ gap: space.sm, paddingHorizontal: inset, paddingVertical: space.sm }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <ClayPressable
            key={option.value}
            onPress={() => onChange(option.value)}
            shadow={t.claySm}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.chip, { backgroundColor: selected ? t.surfaceTint : t.surface, borderColor: selected ? t.violet500 : 'transparent' }]}
          >
            <Text style={[type.label, { color: selected ? t.violetInk : t.ink }]}>{option.label}</Text>
          </ClayPressable>
        );
      })}
    </ScrollView>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: t.ink, fontSize: 16, lineHeight: 22 }]}>{label}</Text>
        {description ? <Text style={[type.caption, { color: t.inkMuted }]}>{description}</Text> : null}
      </View>
      <View
        style={[
          styles.toggleTrack,
          value
            ? { backgroundColor: t.violet500, experimental_backgroundImage: gradient.button, borderColor: t.violet600, boxShadow: t.clayViolet }
            : { backgroundColor: t.surfaceSunk, borderColor: t.lineStrong, boxShadow: t.clayWell },
        ]}
      >
        <View
          style={[styles.toggleKnob, { backgroundColor: value ? '#ffffff' : t.surface, boxShadow: t.claySm, transform: [{ translateX: value ? 24 : 0 }] }]}
        />
      </View>
    </Pressable>
  );
}

/** Small supporting copy under a control or section. */
export function Caption({ children, center = false }: { children: ReactNode; center?: boolean }) {
  const t = useTheme();
  return <Text style={[type.caption, { color: t.inkMuted, textAlign: center ? 'center' : 'left' }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  screenTitle: { flex: 1, textAlign: 'center', fontSize: 24, lineHeight: 30 },
  headerSide: { width: 56, alignItems: 'flex-end' },
  appHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  card: { borderRadius: radius.lg, padding: space.xl, gap: space.lg },
  panel: { borderRadius: radius.md, padding: 18, gap: 18 },
  groupLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 20 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  button: { borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontFamily: type.heading.fontFamily, fontSize: 19, letterSpacing: -0.19 },
  buttonLabelSm: { fontFamily: type.heading.fontFamily, fontSize: 16 },
  feature: { flex: 1, minHeight: 176, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 20, borderRadius: radius.lg, gap: 6 },
  featureGo: { position: 'absolute', right: 16, top: 18, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  quick: { flex: 1, minHeight: 112, padding: space.lg, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 18,
    borderWidth: 2,
    borderRadius: radius.md,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: radius.pill, alignSelf: 'flex-start' },
  meterTrack: { height: 14, borderRadius: radius.pill, padding: 2, overflow: 'hidden' },
  infoRow: { paddingVertical: space.md, gap: 2 },
  infoValueWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: 14, paddingHorizontal: space.lg, borderRadius: radius.md },
  noticeIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  well: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, borderWidth: 1.5, borderRadius: radius.md },
  input: { flex: 1, paddingVertical: space.md, fontFamily: type.bodyStrong.fontFamily },
  chip: { height: 46, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 46 },
  toggleTrack: { width: 60, height: 36, borderRadius: radius.pill, borderWidth: 1.5, padding: 3 },
  toggleKnob: { width: 27, height: 27, borderRadius: 14 },
});
