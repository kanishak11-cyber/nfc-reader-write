import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DecodedRecord } from '@/lib/ndef';
import { mono, radius, space, useTheme } from '@/lib/theme';

import { Button, Card, CopyButton } from './ui';

export function RecordCard({ record, index }: { record: DecodedRecord; index: number }) {
  const t = useTheme();
  const [showRaw, setShowRaw] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const open = async () => {
    if (!record.url) return;
    try {
      await Linking.openURL(record.url);
    } catch {
      Alert.alert('Can’t open', `No app on this device can open:\n${record.url}`);
    }
  };

  const hasValue = record.kind !== 'empty' && record.value.length > 0;

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: t.accentSoft }]}>
          <Text style={[styles.badgeText, { color: t.accent }]}>{record.title}</Text>
        </View>
        <Text style={[styles.index, { color: t.textSubtle }]}>Record {index + 1}</Text>
      </View>

      <Text selectable style={[styles.value, { color: record.kind === 'empty' ? t.textMuted : t.text }]}>
        {record.value}
      </Text>

      {record.details.length > 0 ? (
        <View style={{ gap: space.xs }}>
          {record.details.map((d) => (
            <View key={d.label} style={styles.detail}>
              <Text style={[styles.detailLabel, { color: t.textMuted }]}>{d.label}</Text>
              {d.secret && !revealed[d.label] ? (
                <Pressable onPress={() => setRevealed((r) => ({ ...r, [d.label]: true }))} hitSlop={8}>
                  <Text style={[styles.detailValue, { color: t.accent }]}>Show</Text>
                </Pressable>
              ) : (
                <Text selectable style={[styles.detailValue, { color: t.text }]}>
                  {d.value}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {record.children && record.children.length > 0 ? (
        <View style={[styles.children, { borderColor: t.border }]}>
          {record.children.map((child, i) => (
            <Text key={i} style={[styles.child, { color: t.textMuted }]}>
              {child.title}: <Text style={{ color: t.text }}>{child.value}</Text>
            </Text>
          ))}
        </View>
      ) : null}

      {(record.url || hasValue) && (
        <View style={styles.actions}>
          {record.url ? <Button label={openLabel(record)} size="sm" onPress={open} /> : null}
          {hasValue ? <CopyButton value={record.value} /> : null}
        </View>
      )}

      <Pressable onPress={() => setShowRaw((s) => !s)} hitSlop={6} accessibilityRole="button">
        <Text style={[styles.rawToggle, { color: t.textMuted }]}>{showRaw ? 'Hide raw data' : 'Show raw data'}</Text>
      </Pressable>

      {showRaw ? (
        <View style={[styles.raw, { backgroundColor: t.surfaceMuted }]}>
          <RawLine label="TNF" value={record.raw.tnf} />
          <RawLine label="Type" value={record.raw.type || '—'} />
          {record.raw.id ? <RawLine label="ID" value={record.raw.id} /> : null}
          <RawLine label="Payload" value={`${record.raw.size} bytes`} />
          {record.raw.size > 0 ? (
            <Text selectable style={[styles.hex, mono, { color: t.text }]}>
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
    <Text style={[styles.rawLine, { color: t.textMuted }]}>
      {label}: <Text style={[mono, { color: t.text }]}>{value}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.sm, maxWidth: '75%' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  index: { fontSize: 13 },
  value: { fontSize: 18, lineHeight: 25, fontWeight: '500' },
  detail: { flexDirection: 'row', gap: space.md },
  detailLabel: { fontSize: 14, width: 96 },
  detailValue: { fontSize: 14, flex: 1 },
  children: { borderLeftWidth: 2, paddingLeft: space.md, gap: 2 },
  child: { fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  rawToggle: { fontSize: 13, fontWeight: '600' },
  raw: { borderRadius: radius.sm, padding: space.md, gap: 4 },
  rawLine: { fontSize: 13 },
  hex: { fontSize: 12, lineHeight: 18, marginTop: 4 },
});
