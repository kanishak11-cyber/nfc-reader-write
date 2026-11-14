import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, useTheme } from '@/lib/theme';

import { Button } from './ui';

/**
 * iOS shows its own system "Ready to Scan" sheet, so this only renders on Android,
 * where the app has to tell the user a scan is waiting and offer a way to cancel.
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

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [visible, pulse]);

  if (Platform.OS === 'ios') return null;

  const ring = (delay: number) => ({
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5 - delay, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1 + delay, 2 + delay] }) }],
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: t.overlay }]}>
        <View
          style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + space.lg }]}
          accessibilityViewIsModal
        >
          <View style={styles.pulseWrap} importantForAccessibility="no-hide-descendants">
            <Animated.View style={[styles.ring, { borderColor: t.accent }, ring(0)]} />
            <Animated.View style={[styles.ring, { borderColor: t.accent }, ring(0.3)]} />
            <View style={[styles.core, { backgroundColor: t.accentSoft }]}>
              <Text style={[styles.coreText, { color: t.accent }]}>NFC</Text>
            </View>
          </View>
          <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.message, { color: t.textMuted }]}>{message}</Text>
          <View style={{ alignSelf: 'stretch', marginTop: space.md }}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    gap: space.sm,
  },
  pulseWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  ring: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 2 },
  core: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  coreText: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
