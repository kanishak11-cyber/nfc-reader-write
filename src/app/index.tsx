import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { shortWhen } from '@/components/flow';
import { Icon } from '@/components/Icon';
import { NfcStatus } from '@/components/NfcStatus';
import { AppHeader, FeatureCard, GroupLabel, QuickTile, Screen } from '@/components/ui';
import { ACTION_ICON, useHistory } from '@/lib/history';
import { radius, space, type, useTheme } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';

export default function HomeScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const recent = useHistory().slice(0, 3);

  return (
    <Screen header={<AppHeader title="NFC Doctor" />} gap={space.lg}>
      <Text style={[type.display, { color: t.ink }]} accessibilityRole="header">
        Your NFC toolkit
      </Text>

      <NfcStatus availability={availability} />

      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          <FeatureCard tone="violet" icon="scan" title="Read Tag" description="Scan and view tag data" onPress={() => router.push('/read')} />
          <FeatureCard icon="pencil" title="Write Tag" description="Put a link or text on a tag" onPress={() => router.push('/write')} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          <QuickTile icon="history" label="History" onPress={() => router.push('/history')} />
          <QuickTile icon="trash" label="Erase" onPress={() => router.push('/erase')} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          <QuickTile icon="lock" label="Protect" onPress={() => router.push('/protect')} />
          <QuickTile icon="wrench" label="Diagnose" onPress={() => router.push('/diagnose')} />
        </View>
      </View>

      {recent.length > 0 ? (
        <View style={{ gap: 10 }}>
          <GroupLabel
            right={
              <Pressable onPress={() => router.push('/history')} hitSlop={12} accessibilityRole="link" accessibilityLabel="See all history">
                <Text style={[type.group, { color: t.violetInk }]}>See all</Text>
              </Pressable>
            }
          >
            Recent
          </GroupLabel>
          <View style={[styles.recent, { backgroundColor: t.surface, boxShadow: t.clayMd }]}>
            {recent.map((entry, i) => (
              <Pressable
                key={entry.id}
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: entry.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${entry.title}, ${shortWhen(entry.at)}`}
                style={({ pressed }) => [styles.recentRow, i > 0 && { borderTopColor: t.line, borderTopWidth: 1 }, pressed && { opacity: 0.6 }]}
              >
                <View style={[styles.recentIcon, { backgroundColor: t.surfaceTint, boxShadow: t.claySm }]}>
                  <Icon name={ACTION_ICON[entry.action]} size={20} strokeWidth={2.4} color={t.violetInk} />
                </View>
                <Text style={[type.label, { color: t.ink, flex: 1 }]} numberOfLines={1}>
                  {entry.title}
                </Text>
                <Text style={[type.caption, { color: t.inkMuted }]}>{shortWhen(entry.at)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  recent: { borderRadius: radius.md, paddingVertical: space.xs, paddingLeft: space.md, paddingRight: space.lg },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 },
  recentIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
