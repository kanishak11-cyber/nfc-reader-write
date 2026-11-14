import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Text, View } from 'react-native';

import { recordIcon } from '@/components/RecordCard';
import { Badge, Button, Caption, Card, CopyButton, IconTile, InfoRow, Screen, SectionLabel } from '@/components/ui';
import { ACTION_ICON, deleteHistory, useHistory } from '@/lib/history';
import { space, type, useTheme } from '@/lib/theme';

export default function HistoryEntryScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useHistory().find((e) => e.id === id);

  if (!entry) {
    return (
      <Screen title="History">
        <Card>
          <Caption center>This entry was deleted.</Caption>
        </Card>
      </Screen>
    );
  }

  const rewrite = entry.rewrite;
  const remove = () =>
    Alert.alert('Delete this entry?', 'It’s removed from history on this phone. The tag isn’t changed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          router.back();
          deleteHistory(entry.id);
        },
      },
    ]);

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Can’t open', `No app on this phone can open:\n${url}`);
    }
  };

  return (
    <Screen
      title="Entry"
      footer={
        <>
          {rewrite ? (
            <Button
              label="Write this again"
              icon="nfc"
              onPress={() => router.push({ pathname: '/write/[kind]', params: { kind: rewrite.kind, prefill: JSON.stringify(rewrite.form) } })}
            />
          ) : null}
          <Button label="Delete entry" icon="trash" variant="danger" onPress={remove} />
        </>
      }
    >
      <Card style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile icon={ACTION_ICON[entry.action]} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: t.ink, fontFamily: type.heading.fontFamily, fontSize: 19 }]}>{entry.title}</Text>
            <Text style={[type.caption, { color: t.inkMuted }]}>
              {new Date(entry.at).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Text>
          </View>
          {entry.ok ? (
            <Badge tone="success" icon="check">
              Done
            </Badge>
          ) : (
            <Badge tone="danger" icon="close">
              Failed
            </Badge>
          )}
        </View>
        {!entry.ok ? <Text style={[type.caption, { color: t.ink }]}>{entry.subtitle}</Text> : null}
      </Card>

      {entry.uid || entry.chip ? (
        <Card style={{ paddingVertical: space.xs, gap: 0 }}>
          {entry.chip ? <InfoRow label="Tag" value={entry.chip} last={!entry.uid} /> : null}
          {entry.uid ? <InfoRow label="Serial number (UID)" value={entry.uid} monospace copyable last /> : null}
        </Card>
      ) : null}

      {entry.records && entry.records.length > 0 ? (
        <>
          <SectionLabel>{entry.action === 'read' ? 'On the tag' : 'Content'}</SectionLabel>
          {entry.records.map((record, i) => (
            <Card key={i}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <IconTile icon={recordIcon(record.kind)} size="sm" />
                <Text style={[type.micro, { color: t.inkMuted, flex: 1 }]}>{record.title}</Text>
                {record.value ? <CopyButton value={record.value} /> : null}
              </View>
              <Text selectable style={[type.body, { color: t.ink }]}>
                {record.value}
              </Text>
              {record.url ? (
                <View style={{ alignItems: 'flex-start' }}>
                  <Button label="Open" size="sm" variant="secondary" onPress={() => open(record.url!)} />
                </View>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      {entry.details && entry.details.length > 0 ? (
        <>
          <SectionLabel>Details</SectionLabel>
          <Card style={{ paddingVertical: space.xs, gap: 0 }}>
            {entry.details.map((d, i) => (
              <InfoRow key={d.label} label={d.label} value={d.value} last={i === entry.details!.length - 1} />
            ))}
          </Card>
        </>
      ) : null}

      {rewrite?.kind === 'wifi' ? <Caption>Wi-Fi passwords aren’t saved in history, so you’ll enter it again before writing.</Caption> : null}
    </Screen>
  );
}
