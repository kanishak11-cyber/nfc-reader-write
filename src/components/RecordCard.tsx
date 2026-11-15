import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DecodedRecord, RecordKind } from '@/lib/ndef';
import { saveToContacts } from '@/lib/saveContact';
import { radius, space, type, useTheme } from '@/lib/theme';

import { Icon, type IconName } from './Icon';
import { Button, CopyButton, IconTile } from './ui';

const KIND_ICON: Partial<Record<RecordKind, IconName>> = {
  text: 'text',
  link: 'link',
  uri: 'link',
  poster: 'link',
  phone: 'phone',
  sms: 'phone',
  email: 'user',
  contact: 'contact',
  wifi: 'wifi',
};

export function recordIcon(kind: string): IconName {
  return KIND_ICON[kind as RecordKind] ?? 'code';
}

/**
 * One record inside the tag card: a small icon tile, the record's type and its value on one
 * line. Tapping the row opens the rest — the full value, its details, what it opens and the
 * raw bytes.
 */
export function RecordCard({ record, index, canSave = true }: { record: DecodedRecord; index: number; canSave?: boolean }) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
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
    <View style={[styles.record, index > 0 && { borderTopColor: t.line, borderTopWidth: 1 }, index === 0 && { paddingTop: 0 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          style={styles.summary}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`Record ${index + 1}, ${record.title}: ${record.value}`}
          accessibilityHint={expanded ? 'Hides the details' : 'Shows the details'}
        >
          <IconTile icon={recordIcon(record.kind)} size="sm" />
          <View style={{ flex: 1 }}>
            <Text style={[type.micro, { color: t.inkMuted }]} numberOfLines={1}>
              {record.title}
            </Text>
            <Text style={[type.label, { color: record.kind === 'empty' ? t.inkMuted : t.ink, lineHeight: 22 }]} numberOfLines={1}>
              {record.value}
            </Text>
          </View>
          <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
            <Icon name="chevron" size={20} strokeWidth={2.4} color={t.inkMuted} />
          </View>
        </Pressable>
        {hasValue ? <CopyButton value={record.value} /> : null}
      </View>

      {record.contact && canSave ? <SaveContactButton record={record} /> : null}

      {expanded ? (
        <View style={{ gap: space.md, paddingTop: space.md }}>
          <Text selectable style={[type.body, { color: record.kind === 'empty' ? t.inkMuted : t.ink }]}>
            {record.value}
          </Text>

          {record.details.length > 0 ? (
            <View style={{ gap: space.xs }}>
              {record.details.map((d, i) => (
                <View key={`${d.label}-${i}`} style={styles.detail}>
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

          <Pressable onPress={() => setShowRaw((r) => !r)} hitSlop={6} accessibilityRole="button">
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
        </View>
      ) : null}
    </View>
  );
}

/** The main action for a contact card: the phone's own New contact form, filled in. */
export function SaveContactButton({ record }: { record: Pick<DecodedRecord, 'contact'> }) {
  const [saved, setSaved] = useState(false);
  const [opening, setOpening] = useState(false);
  if (!record.contact) return null;
  const card = record.contact;

  const save = async () => {
    setOpening(true);
    const created = await saveToContacts(card);
    setOpening(false);
    if (created) setSaved(true);
  };

  return (
    <View style={{ alignItems: 'flex-start', paddingTop: space.sm }}>
      <Button
        label={saved ? 'Saved to contacts' : 'Save to contacts'}
        icon={saved ? 'check' : 'contact'}
        size="sm"
        variant={saved ? 'secondary' : 'primary'}
        loading={opening}
        onPress={save}
      />
    </View>
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
  record: { paddingVertical: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  summary: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  detail: { flexDirection: 'row', gap: space.md },
  raw: { borderRadius: radius.sm, padding: space.md, gap: 4 },
});
