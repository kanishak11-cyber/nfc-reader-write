import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mono, radius, space, type, useTheme } from '@/lib/theme';

import { Icon, type IconName } from './Icon';
import { Button, IconTile } from './ui';

/* Scan pulse ------------------------------------------------------- */

export type PulseState = 'ready' | 'scanning' | 'success' | 'error';

const PULSE_ICON: Record<PulseState, IconName> = { ready: 'nfc', scanning: 'nfc', success: 'check', error: 'close' };

/**
 * The clay disc every scan screen is built around. Scanning sends three violet rings out
 * of a breathing disc; success and error swap the disc to its soft ground with a check or
 * a cross, so the result never rests on colour alone.
 */
export function ScanPulse({ state = 'ready', title, hint }: { state?: PulseState; title?: string; hint?: string }) {
  const t = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const scanning = state === 'scanning';

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!scanning || reduceMotion) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [scanning, reduceMotion, pulse]);

  /** Each ring runs the same 0.85→1.5 scale and fade, a third of the cycle apart. */
  const ring = (offset: number) => {
    const phase = Animated.modulo(Animated.add(pulse, offset), 1);
    return {
      opacity: reduceMotion ? (offset === 0 ? 0.6 : 0) : phase.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
      transform: [{ scale: reduceMotion ? 1.2 : phase.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.5] }) }],
    };
  };
  const breathe = scanning && !reduceMotion ? pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.04, 1] }) : 1;

  const disc = {
    ready: { bg: t.surface, fg: t.violetInk },
    scanning: { bg: t.surface, fg: t.violetInk },
    success: { bg: t.successSoft, fg: t.success },
    error: { bg: t.dangerSoft, fg: t.danger },
  }[state];

  return (
    <View style={styles.pulse} accessibilityLiveRegion="polite">
      <View style={[styles.stage, !scanning && styles.stageResting]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {scanning ? [0, 1 / 3, 2 / 3].map((offset) => <Animated.View key={offset} style={[styles.ring, { borderColor: t.violet300 }, ring(offset)]} />) : null}
        <Animated.View style={[styles.disc, { backgroundColor: disc.bg, boxShadow: t.clayLg, transform: [{ scale: breathe }] }]}>
          <Icon name={PULSE_ICON[state]} size={72} strokeWidth={2.6} color={disc.fg} />
        </Animated.View>
      </View>
      {title ? (
        <Text style={[type.heading, { color: t.ink, textAlign: 'center' }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {hint ? (
        <Text selectable style={[type.caption, { color: t.inkMuted, textAlign: 'center', maxWidth: 300 }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Round clay disc with one icon, e.g. the bin on the erase confirmation. */
export function IconDisc({ icon, tone = 'danger' }: { icon: IconName; tone?: 'danger' | 'violet' }) {
  const t = useTheme();
  const c = tone === 'danger' ? { bg: t.dangerSoft, fg: t.danger } : { bg: t.surface, fg: t.violetInk };
  return (
    <View style={[styles.iconDisc, { backgroundColor: c.bg, boxShadow: t.clayLg }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Icon name={icon} size={60} strokeWidth={2.4} color={c.fg} />
    </View>
  );
}

/** Centred title and copy under a disc or a tile. */
export function Lead({ title, body, note }: { title: string; body?: string; note?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: space.md }}>
      <Text style={[type.heading, { color: t.ink, textAlign: 'center' }]} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={[type.body, { color: t.inkMuted, textAlign: 'center' }]}>{body}</Text> : null}
      {note ? <Text style={[type.caption, { color: t.inkMuted, textAlign: 'center' }]}>{note}</Text> : null}
    </View>
  );
}

/** "Saved to history" under a result: a green check with quiet text. */
export function SavedLine({ children = 'Saved to history' }: { children?: string }) {
  const t = useTheme();
  return (
    <View style={styles.saved}>
      <Icon name="check" size={18} strokeWidth={2.6} color={t.success} />
      <Text style={[type.caption, { color: t.inkMuted }]}>{children}</Text>
    </View>
  );
}

/* Summaries -------------------------------------------------------- */

/** Label-and-value rows on one clay card: what is about to change, before it changes. */
export function SummaryList({ rows }: { rows: { label: string; value: string; tone?: 'danger' }[] }) {
  const t = useTheme();
  return (
    <View style={[styles.summary, { backgroundColor: t.surface, boxShadow: t.clayLg }]}>
      {rows.map((row, i) => (
        <View
          key={row.label}
          style={[styles.summaryRow, i > 0 && { borderTopColor: t.line, borderTopWidth: 1 }]}
          accessible
          accessibilityLabel={`${row.label}: ${row.value}`}
        >
          <Text style={[type.caption, { color: t.inkMuted }]}>{row.label}</Text>
          <Text style={[type.label, { color: row.tone === 'danger' ? t.danger : t.ink, flexShrink: 1, textAlign: 'right' }]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** One tag on a clay panel: chip name, its UID in mono, and a badge or button at the end. */
export function TagLine({ name, uid, end }: { name: string; uid?: string; end?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.tagLine, { backgroundColor: t.surface, boxShadow: t.clayMd }]}>
      <IconTile icon="nfc" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.label, { color: t.ink }]} numberOfLines={1}>
          {name}
        </Text>
        {uid ? (
          <Text selectable style={[type.caption, mono, { color: t.inkMuted }]} numberOfLines={1}>
            {uid}
          </Text>
        ) : null}
      </View>
      {end}
    </View>
  );
}

/* Confirmation sheet ----------------------------------------------- */

/** Bottom sheet for a destructive choice: says what goes, what stays, and offers a way out. */
export function ConfirmSheet({
  visible,
  icon = 'trash',
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  icon?: IconName;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.scrim, { backgroundColor: t.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel" accessibilityRole="button" />
        <View
          style={[styles.sheet, { backgroundColor: t.surface, boxShadow: t.clayLg, paddingBottom: insets.bottom + space.xxxl }]}
          accessibilityViewIsModal
        >
          <View style={[styles.grabber, { backgroundColor: t.line }]} />
          <View style={[styles.sheetIcon, { backgroundColor: t.dangerSoft, boxShadow: t.claySm }]}>
            <Icon name={icon} size={26} strokeWidth={2.4} color={t.danger} />
          </View>
          <Text style={[type.heading, { color: t.ink, textAlign: 'center' }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[type.caption, { color: t.inkMuted, textAlign: 'center', marginBottom: space.sm }]}>{message}</Text>
          <View style={{ alignSelf: 'stretch', gap: space.md }}>
            <Button label={confirmLabel} icon={icon} variant="danger" onPress={onConfirm} />
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* Time ------------------------------------------------------------- */

export const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** The time for today's entries, a short date for older ones. */
export function shortWhen(at: number): string {
  const sameDay = new Date(at).toDateString() === new Date().toDateString();
  return sameDay ? timeOf(at) : new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  pulse: { alignItems: 'center', gap: 6 },
  stage: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stageResting: { height: 200 },
  ring: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 3 },
  disc: { width: 168, height: 168, borderRadius: 84, alignItems: 'center', justifyContent: 'center' },
  iconDisc: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: space.sm },
  saved: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  summary: { borderRadius: radius.lg, paddingVertical: 6, paddingHorizontal: space.xl },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: space.md },
  tagLine: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14, paddingHorizontal: space.lg, borderRadius: radius.md },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 14,
    paddingHorizontal: space.xxl,
    alignItems: 'center',
    gap: space.md,
  },
  grabber: { width: 44, height: 5, borderRadius: radius.pill },
  sheetIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
});
