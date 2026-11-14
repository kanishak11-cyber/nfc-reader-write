import * as Clipboard from 'expo-clipboard';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mono, radius, space, useTheme } from '@/lib/theme';

/* Screen ----------------------------------------------------------- */

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      // iOS insets the content for the status bar and tab bar itself; Android needs it done by hand.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: (Platform.OS === 'ios' ? 0 : insets.top) + space.lg,
        paddingBottom: space.xxl + (Platform.OS === 'ios' ? 0 : insets.bottom),
        paddingHorizontal: space.lg,
        gap: space.lg,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      <View style={{ gap: space.xs, marginBottom: space.xs }}>
        <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: t.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

/* Card ------------------------------------------------------------- */

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>
  );
}

export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabel, { color: t.textMuted }]}>{children.toUpperCase()}</Text>
      {right}
    </View>
  );
}

/* Button ----------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  size = 'md',
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg' | 'sm';
}) {
  const t = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: t.accent, fg: t.accentText, border: t.accent },
    secondary: { bg: t.surface, fg: t.text, border: t.border },
    danger: { bg: t.surface, fg: t.danger, border: t.border },
    ghost: { bg: 'transparent', fg: t.accent, border: 'transparent' },
  };
  const c = palette[variant];
  const inactive = disabled || loading;
  const height = size === 'lg' ? 56 : size === 'sm' ? 36 : 48;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          height,
          backgroundColor: c.bg,
          borderColor: c.border,
          paddingHorizontal: size === 'sm' ? space.md : space.lg,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <Text style={[styles.buttonLabel, { color: c.fg, fontSize: size === 'lg' ? 17 : size === 'sm' ? 14 : 16 }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/* Copy button ------------------------------------------------------ */

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${label} to clipboard`}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Text style={[styles.link, { color: copied ? t.success : t.accent }]}>{copied ? 'Copied' : label}</Text>
    </Pressable>
  );
}

/* Rows ------------------------------------------------------------- */

export function InfoRow({
  label,
  value,
  monospace = false,
  copyable = false,
  last = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
  copyable?: boolean;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[styles.infoRow, !last && { borderBottomColor: t.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.infoLabel, { color: t.textMuted }]}>{label}</Text>
      <View style={styles.infoValueWrap}>
        <Text selectable style={[styles.infoValue, { color: t.text }, monospace && mono]}>
          {value}
        </Text>
        {copyable ? <CopyButton value={value} /> : null}
      </View>
    </View>
  );
}

/* Notice ----------------------------------------------------------- */

export function Notice({
  tone,
  title,
  message,
  action,
}: {
  tone: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  const colors = {
    info: { bg: t.accentSoft, fg: t.accent },
    success: { bg: t.successSoft, fg: t.success },
    warning: { bg: t.warningSoft, fg: t.warning },
    danger: { bg: t.dangerSoft, fg: t.danger },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: colors.bg }]} accessibilityRole="alert">
      <Text style={[styles.noticeTitle, { color: colors.fg }]}>{title}</Text>
      {message ? <Text style={[styles.noticeMessage, { color: t.text }]}>{message}</Text> : null}
      {action}
    </View>
  );
}

/* Form ------------------------------------------------------------- */

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs + 2 }}>
      <Text style={[styles.fieldLabel, { color: t.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.textSubtle}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: t.text,
            backgroundColor: t.surfaceMuted,
            borderColor: focused ? t.accent : t.border,
            minHeight: input.multiline ? 104 : 48,
            textAlignVertical: input.multiline ? 'top' : 'center',
          },
        ]}
      />
      {hint ? <Text style={[styles.hint, { color: t.textSubtle }]}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? t.accent : t.surface,
                borderColor: selected ? t.accent : t.border,
              },
            ]}
          >
            <Text style={[styles.chipLabel, { color: selected ? t.accentText : t.text }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.fieldLabel, { color: t.text, flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: t.accent, false: t.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  button: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontWeight: '600' },
  link: { fontSize: 14, fontWeight: '600' },
  infoRow: { paddingVertical: space.sm + 2, gap: 2 },
  infoLabel: { fontSize: 13 },
  infoValueWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  infoValue: { fontSize: 16, flexShrink: 1 },
  notice: { borderRadius: radius.md, padding: space.lg, gap: space.sm },
  noticeTitle: { fontSize: 15, fontWeight: '700' },
  noticeMessage: { fontSize: 14, lineHeight: 20 },
  fieldLabel: { fontSize: 15, fontWeight: '600' },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.md,
    fontSize: 16,
  },
  hint: { fontSize: 13, lineHeight: 18 },
  chip: {
    height: 38,
    paddingHorizontal: space.lg,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 15, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
