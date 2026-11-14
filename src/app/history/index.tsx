import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { Caption, Card, IconButton, OptionRow, Screen, SectionLabel, Segmented } from '@/components/ui';
import { ACTION_ICON, clearHistory, dayLabel, matchesFilter, useHistory, type HistoryEntry, type HistoryFilter } from '@/lib/history';
import { space } from '@/lib/theme';

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'read', label: 'Read' },
  { value: 'written', label: 'Written' },
  { value: 'protected', label: 'Protected' },
];

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function HistoryScreen() {
  const entries = useHistory();
  const [filter, setFilter] = useState<HistoryFilter>('all');

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

  const confirmClear = () =>
    Alert.alert('Clear all history?', 'Every entry is deleted from this phone. Your tags aren’t changed. You can’t undo this.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearHistory },
    ]);

  return (
    <Screen title="History" action={entries.length > 0 ? <IconButton icon="trash" label="Clear history" onPress={confirmClear} /> : undefined}>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />

      {days.length === 0 ? (
        <Card>
          <Caption center>{entries.length === 0 ? 'Nothing yet. Tags you read and write show up here.' : 'Nothing matches this filter.'}</Caption>
        </Card>
      ) : (
        days.map((day) => (
          <View key={day.label} style={{ gap: space.md }}>
            <SectionLabel>{day.label}</SectionLabel>
            {day.entries.map((entry) => (
              <OptionRow
                key={entry.id}
                icon={ACTION_ICON[entry.action]}
                title={entry.title}
                subtitle={`${timeOf(entry.at)} · ${entry.subtitle}`}
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: entry.id } })}
              />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
