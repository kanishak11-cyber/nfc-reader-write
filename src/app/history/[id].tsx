import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { ConfirmSheet, Lead, timeOf } from '@/components/flow';
import { recordIcon } from '@/components/RecordCard';
import { Badge, Button, Caption, Card, CopyButton, GroupLabel, IconTile, InfoRow, Screen, Spacer } from '@/components/ui';
import { ACTION_ICON, dayLabel, deleteHistory, useHistory, type HistoryAction } from '@/lib/history';
import { radius, space, type, useTheme } from '@/lib/theme';

const ACTION_LABEL: Record<HistoryAction, string> = {
  read: 'Read',
  write: 'Written',
  erase: 'Erased',
  lock: 'Locked',
  unlock: 'Unlocked',
  secure: 'Secured',
  unsecure: 'Unlocked',
  diagnose: 'Diagnosed',
};

export default function HistoryEntryScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useHistory().find((e) => e.id === id);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!entry) {
    return (
      <Screen title="Entry details">
        <Spacer />
        <Lead title="This entry was deleted" body="It’s no longer in history on this phone." />
        <Spacer />
      </Screen>
    );
  }

  const rewrite = entry.rewrite;
  const records = entry.records ?? [];
  const link = records.find((r) => r.url)?.url;
  const copyText = records.length > 0 ? records.map((r) => r.value).join('\n') : (entry.uid ?? entry.subtitle);

  const copy = async () => {
    await Clipboard.setStringAsync(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Can’t open', `No app on this phone can open:\n${url}`);
    }
  };

  return (
    <Screen
      title="Entry details"
      gap={14}
      footer={
        <>
          {rewrite ? (
            <Button
              label="Write this again"
              icon="pencil"
              onPress={() => router.push({ pathname: '/write/[kind]', params: { kind: rewrite.kind, prefill: JSON.stringify(rewrite.form) } })}
            />
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button label={copied ? 'Copied' : 'Copy'} icon={copied ? 'check' : 'copy'} size="sm" variant="secondary" flex onPress={copy} />
            {link ? <Button label="Open link" icon="link" size="sm" variant="secondary" flex onPress={() => open(link)} /> : null}
          </View>
          <Button label="Delete entry" icon="trash" size="sm" variant="danger" onPress={() => setDeleting(true)} />
        </>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Badge tone="violet" icon={ACTION_ICON[entry.action]}>
          {ACTION_LABEL[entry.action]}
        </Badge>
        <Text style={[type.caption, { color: t.inkMuted, flex: 1 }]}>
          {dayLabel(entry.at)}, {timeOf(entry.at)} · on this phone
        </Text>
      </View>

      <Card style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile icon={ACTION_ICON[entry.action]} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyStrong, { color: t.ink, fontFamily: type.heading.fontFamily, fontSize: 19 }]}>{entry.title}</Text>
            {entry.chip ? <Text style={[type.caption, { color: t.inkMuted }]}>{entry.chip}</Text> : null}
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

        {!entry.ok ? (
          <Text selectable style={[type.caption, { color: t.ink }]}>
            {entry.subtitle}
          </Text>
        ) : null}

        {entry.uid ? (
          <View style={[styles.uid, { backgroundColor: t.surfaceSunk, boxShadow: t.clayWell }]}>
            <Text style={[type.micro, { color: t.inkMuted }]}>UID</Text>
            <Text selectable style={[type.mono, { color: t.ink, flex: 1 }]}>
              {entry.uid}
            </Text>
            <CopyButton value={entry.uid} label="Copy UID" />
          </View>
        ) : null}

        {records.length > 0 ? (
          <View accessibilityLabel={entry.action === 'read' ? 'On the tag' : 'Content'}>
            {records.map((record, i) => (
              <View key={i} style={[styles.record, i > 0 && { borderTopColor: t.line, borderTopWidth: 1 }, i === 0 && { paddingTop: 0 }]}>
                <IconTile icon={recordIcon(record.kind)} size="sm" />
                <View style={{ flex: 1 }}>
                  <Text style={[type.micro, { color: t.inkMuted }]}>{record.title}</Text>
                  <Text selectable style={[type.label, { color: t.ink, lineHeight: 22 }]}>
                    {record.value}
                  </Text>
                </View>
                {record.value ? <CopyButton value={record.value} /> : null}
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {entry.details && entry.details.length > 0 ? (
        <>
          <GroupLabel>Details</GroupLabel>
          <Card style={{ paddingVertical: space.xs, gap: 0 }}>
            {entry.details.map((d, i) => (
              <InfoRow key={d.label} label={d.label} value={d.value} last={i === entry.details!.length - 1} />
            ))}
          </Card>
        </>
      ) : null}

      {rewrite?.kind === 'wifi' ? <Caption>Wi-Fi passwords aren’t saved in history, so you’ll enter it again before writing.</Caption> : null}

      <ConfirmSheet
        visible={deleting}
        title="Delete this entry?"
        message="It’s removed from history on this phone. The tag isn’t changed."
        confirmLabel="Delete entry"
        onConfirm={() => {
          setDeleting(false);
          router.back();
          deleteHistory(entry.id);
        }}
        onCancel={() => setDeleting(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  uid: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderRadius: radius.sm },
  record: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 },
});
