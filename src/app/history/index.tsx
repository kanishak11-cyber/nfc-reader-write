import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ConfirmSheet, Lead, timeOf } from '@/components/flow';
import { Button, GroupLabel, IconButton, IconTile, OptionRow, Screen, Segmented, Spacer } from '@/components/ui';
import { ACTION_ICON, clearHistory, dayLabel, matchesFilter, useHistory, type HistoryEntry, type HistoryFilter } from '@/lib/history';
import { space } from '@/lib/theme';

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'read', label: 'Read' },
  { value: 'written', label: 'Written' },
  { value: 'protected', label: 'Protected' },
];

export default function HistoryScreen() {
  const entries = useHistory();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [clearing, setClearing] = useState(false);

  const days = useMemo(() => {
    const groups: { label: string; entries: HistoryEntry[] }[] = [];
    for (const entry of entries.filter((e) => matchesFilter(e, filter))) {
      const label = dayLabel(entry.at);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.entries.push(entry);
      else groups.push({ label, entries: [entry] });
    }
    return groups;
  }, [entries, filter]);

  if (entries.length === 0) {
    return (
      <Screen title="History" footer={<Button label="Read a tag" icon="scan" onPress={() => router.push('/read')} />}>
        <Spacer />
        <View style={{ alignItems: 'center', gap: space.xxl }}>
          <IconTile icon="history" size="lg" />
          <Lead
            title="Nothing yet"
            body="Tags you read and write show up here."
            note="History stays on this phone. Passwords and keys are never saved."
          />
        </View>
        <Spacer />
      </Screen>
    );
  }

  return (
    <Screen title="History" gap={space.lg} action={<IconButton icon="trash" label="Clear history" onPress={() => setClearing(true)} />}>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />

      {days.length === 0 ? (
        <>
          <Spacer />
          <Lead title="Nothing here" body="No entries match this filter." />
          <Spacer />
        </>
      ) : (
        days.map((day) => (
          <View key={day.label} style={{ gap: space.md }}>
            <GroupLabel>{day.label}</GroupLabel>
            {day.entries.map((entry) => (
              <OptionRow
                key={entry.id}
                icon={ACTION_ICON[entry.action]}
                title={entry.title}
                subtitle={entry.subtitle}
                end={timeOf(entry.at)}
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: entry.id } })}
              />
            ))}
          </View>
        ))
      )}

      <ConfirmSheet
        visible={clearing}
        title="Clear history?"
        message={`This removes ${entries.length === 1 ? 'the only entry' : `all ${entries.length} entries`} from this phone and can’t be undone. Your tags don’t change.`}
        confirmLabel="Clear history"
        onConfirm={() => {
          setClearing(false);
          clearHistory();
        }}
        onCancel={() => setClearing(false)}
      />
    </Screen>
  );
}
