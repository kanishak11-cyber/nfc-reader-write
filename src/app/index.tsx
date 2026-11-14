import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { NfcStatus } from '@/components/NfcStatus';
import { AppHeader, FeatureCard, OptionRow, QuickTile, Screen, SectionLabel } from '@/components/ui';
import { ACTION_ICON, useHistory } from '@/lib/history';
import { space, type, useTheme } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';

export default function HomeScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const recent = useHistory().slice(0, 3);

  return (
    <Screen header={<AppHeader title="NFC Read Write" />}>
      <View style={{ gap: space.sm, alignItems: 'center' }}>
        <Text style={[type.display, { color: t.ink, textAlign: 'center' }]} accessibilityRole="header">
          NFC Reader & Writer
        </Text>
        <Text style={[type.body, { color: t.inkMuted, textAlign: 'center' }]}>Read, write and manage NFC tags</Text>
      </View>

      <NfcStatus availability={availability} />

      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          <FeatureCard tone="violet" icon="scan" title="Read Tag" description="Scan and view tag data" onPress={() => router.push('/read')} />
          <FeatureCard icon="pencil" title="Write Tag" description="Add or update data on a tag" onPress={() => router.push('/write')} />
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
        <View style={{ gap: space.md }}>
          <SectionLabel>Recent</SectionLabel>
          {recent.map((entry) => (
            <OptionRow
              key={entry.id}
              icon={ACTION_ICON[entry.action]}
              title={entry.title}
              subtitle={entry.subtitle}
              onPress={() => router.push({ pathname: '/history/[id]', params: { id: entry.id } })}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
