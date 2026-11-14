import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, type, useTheme } from '@/lib/theme';

import { Icon } from './Icon';
import { Button } from './ui';

/**
 * Full-screen "hold near tag" state: three violet rings expand from a breathing clay disc.
 * iOS shows its own system scan sheet on top of everything, so this only renders on
 * Android, where the app has to say a scan is waiting and offer a way to cancel.
 */
export function ScanSheet({
  visible,
  title,
  message,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [pulse] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!visible || reduceMotion) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [visible, reduceMotion, pulse]);

  if (Platform.OS === 'ios') return null;

  /** Each ring runs the same 0.85→1.5 scale and fade, a third of the cycle apart. */
  const ring = (offset: number) => {
    const phase = Animated.modulo(Animated.add(pulse, offset), 1);
    return {
      opacity: reduceMotion ? (offset === 0 ? 0.6 : 0) : phase.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
      transform: [{ scale: reduceMotion ? 1.2 : phase.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.5] }) }],
    };
  };
  const breathe = reduceMotion ? 1 : pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.04, 1] });

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View
        style={[styles.screen, { backgroundColor: t.bg, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.lg }]}
        accessibilityViewIsModal
      >
        <View style={styles.center} accessibilityLiveRegion="polite">
          <View style={styles.stage} importantForAccessibility="no-hide-descendants">
            {[0, 1 / 3, 2 / 3].map((offset) => (
              <Animated.View key={offset} style={[styles.ring, { borderColor: t.violet300 }, ring(offset)]} />
            ))}
            <Animated.View style={[styles.disc, { backgroundColor: t.surface, boxShadow: t.clayLg, transform: [{ scale: breathe }] }]}>
              <Icon name="nfc" size={72} strokeWidth={2.6} color={t.violetInk} />
            </Animated.View>
          </View>
          <Text style={[type.heading, { color: t.ink, textAlign: 'center' }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[type.caption, { color: t.inkMuted, textAlign: 'center', maxWidth: 260 }]}>{message}</Text>
        </View>
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  stage: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  ring: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 3 },
  disc: { width: 168, height: 168, borderRadius: 84, alignItems: 'center', justifyContent: 'center' },
});
