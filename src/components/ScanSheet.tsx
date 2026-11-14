import type { ReactNode } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, type, useTheme } from '@/lib/theme';

import { ScanPulse } from './flow';
import { Button } from './ui';

/**
 * Full-screen "hold near tag" state: the screen title with no way back, the scan pulse,
 * one line on what this scan will do, and Cancel. iOS shows its own system scan sheet on
 * top of everything, so this only renders on Android, where the app has to say a scan is
 * waiting and offer a way to cancel.
 */
export function ScanSheet({
  visible,
  heading,
  title,
  message,
  notice,
  onCancel,
}: {
  visible: boolean;
  /** The screen title, repeated so the scan state reads as part of the same flow. */
  heading?: string;
  title: string;
  message: string;
  /** A status banner saying what the scan does. */
  notice?: ReactNode;
  onCancel: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'ios') return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View
        style={[styles.screen, { backgroundColor: t.bg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }]}
        accessibilityViewIsModal
      >
        {heading ? (
          <View style={styles.header}>
            <Text style={[type.title, styles.heading, { color: t.ink }]} accessibilityRole="header" numberOfLines={1}>
              {heading}
            </Text>
          </View>
        ) : null}
        <View style={styles.center}>
          <ScanPulse state={visible ? 'scanning' : 'ready'} title={title} hint={message} />
        </View>
        {notice}
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.xl, gap: space.xl },
  header: { height: 56, justifyContent: 'center' },
  heading: { textAlign: 'center', fontSize: 24, lineHeight: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
