import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DecodedRecord, RecordKind } from '@/lib/ndef';
import { radius, space, type, useTheme } from '@/lib/theme';

import type { IconName } from './Icon';
import { Button, Card, CopyButton, IconTile } from './ui';

const KIND_ICON: Partial<Record<RecordKind, IconName>> = {
  text: 'text',
  link: 'link',
  uri: 'link',
  poster: 'link',
  phone: 'phone',
  sms: 'phone',
  email: 'user',
  contact: 'user',
  wifi: 'wifi',
};

export function recordIcon(kind: string): IconName {
  return KIND_ICON[kind as RecordKind] ?? 'code';
}

export function RecordCard({ record, index }: { record: DecodedRecord; index: number }) {
  const t = useTheme();
  const [showRaw, setShowRaw] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const open = async () => {
    if (!record.url) return;
    try {
      await Linking.openURL(record.url);
    } catch {
      Alert.alert('Can’t open', `No app on this phone can open:\n${record.url}`);
    }
  };

  const hasValue = record.kind !== 'empty' && record.value.length > 0;

  return (
    <Card>
      <View style={styles.header}>
        <IconTile icon={recordIcon(record.kind)} />
        <View style={{ flex: 1 }}>
          <Text style={[type.micro, { color: t.inkMuted }]}>Record {index + 1}</Text>
          <Text style={[type.bodyStrong, { color: t.ink }]} numberOfLines={1}>
            {record.title}
          </Text>
        </View>
        {hasValue ? <CopyButton value={record.value} /> : null}
      </View>

      <Text selectable style={[type.body, { color: record.kind === 'empty' ? t.inkMuted : t.ink }]}>
        {record.value}
      </Text>

      {record.details.length > 0 ? (
        <View style={{ gap: space.xs }}>
          {record.details.map((d) => (
            <View key={d.label} style={styles.detail}>
              <Text style={[type.caption, { color: t.inkMuted, width: 96 }]}>{d.label}</Text>
              {d.secret && !revealed[d.label] ? (
                <Pressable onPress={() => setRevealed((r) => ({ ...r, [d.label]: true }))} hitSlop={8} accessibilityRole="button">
                  <Text style={[type.caption, { color: t.violetInk, fontFamily: type.micro.fontFamily }]}>Show</Text>
                </Pressable>
              ) : (
                <Text selectable style={[type.caption, { color: t.ink, flex: 1 }]}>
                  {d.value}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {record.children && record.children.length > 0 ? (
        <View style={{ gap: 2 }}>
          {record.children.map((child, i) => (
            <Text key={i} style={[type.caption, { color: t.inkMuted }]}>
              {child.title}: <Text style={{ color: t.ink }}>{child.value}</Text>
            </Text>
          ))}
        </View>
      ) : null}

      {record.url ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button label={openLabel(record)} size="sm" variant="secondary" onPress={open} />
        </View>
      ) : null}

      <Pressable onPress={() => setShowRaw((s) => !s)} hitSlop={6} accessibilityRole="button">
        <Text style={[type.caption, { color: t.violetInk, fontFamily: type.micro.fontFamily }]}>{showRaw ? 'Hide raw data' : 'Show raw data'}</Text>
      </Pressable>

      {showRaw ? (
        <View style={[styles.raw, { backgroundColor: t.surfaceSunk, boxShadow: t.clayWell }]}>
          <RawLine label="TNF" value={record.raw.tnf} />
          <RawLine label="Type" value={record.raw.type || '—'} />
          {record.raw.id ? <RawLine label="ID" value={record.raw.id} /> : null}
          <RawLine label="Payload" value={`${record.raw.size} bytes`} />
          {record.raw.size > 0 ? (
            <Text selectable style={[type.mono, { color: t.ink, fontSize: 12, lineHeight: 18, marginTop: 4 }]}>
              {record.raw.payloadHex}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function RawLine({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <Text style={[type.caption, { color: t.inkMuted }]}>
      {label}: <Text style={[type.mono, { color: t.ink }]}>{value}</Text>
    </Text>
  );
}

function openLabel(record: DecodedRecord): string {
  switch (record.kind) {
    case 'phone':
      return 'Call';
    case 'email':
      return 'Compose email';
    case 'sms':
      return 'Send message';
    case 'location':
      return 'Open in Maps';
    default:
      return 'Open link';
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  detail: { flexDirection: 'row', gap: space.md },
  raw: { borderRadius: radius.sm, padding: space.md, gap: 4 },
});
