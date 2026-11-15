import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { ScanPulse } from '@/components/flow';
import { Icon } from '@/components/Icon';
import { NfcStatus } from '@/components/NfcStatus';
import { RecordCard } from '@/components/RecordCard';
import { ScanSheet } from '@/components/ScanSheet';
import { Badge, Button, Card, CopyButton, goHome, GroupLabel, IconTile, InfoRow, Meter, Notice, Screen, Spacer } from '@/components/ui';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory, dayLabel, lastSeen, rewriteFromRecord, toHistoryRecords, type HistoryEntry } from '@/lib/history';
import { decodeRecord, formatUid, toHex, type DecodedRecord } from '@/lib/ndef';
import { cancelScan, readTag, type ScanResult } from '@/lib/nfc';
import { radius, space, type, useTheme } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';

const IOS_TECH_NAMES: Record<string, string> = {
  mifare: 'MIFARE / NFC-A',
  IsoDep: 'ISO 7816 (ISO-DEP)',
  iso15693: 'ISO 15693 (NFC-V)',
  felica: 'FeliCa',
};

const tagType = (result: ScanResult) => result.tag.type ?? (result.tag.tech ? IOS_TECH_NAMES[result.tag.tech] ?? result.tag.tech : null) ?? 'NFC tag';

export default function ReadScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const { busy, outcome, run } = useScanAction();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [seen, setSeen] = useState<HistoryEntry | undefined>();
  const [saved, setSaved] = useState<HistoryEntry | null>(null);
  const started = useRef(false);

  const records = useMemo(() => (result ? result.records.map(decodeRecord) : []), [result]);
  const ready = availability === 'ready';

  const scan = async () => {
    const scanned = await run('read', readTag, {
      success: (r) => ({ tone: 'success', title: 'Tag read', message: `${r.records.length === 1 ? '1 record' : `${r.records.length} records`} · just now` }),
      failTitle: 'Couldn’t read the tag',
    });
    if (!scanned) return;
    const uid = formatUid(scanned.tag.id ?? scanned.tag.idm);
    const decoded = toHistoryRecords(scanned.records.map(decodeRecord));
    setSeen(lastSeen(uid, Date.now()));
    setResult(scanned);
    setSaved(
      addHistory({
        action: 'read',
        ok: true,
        title: `Read ${tagType(scanned)}`,
        subtitle: decoded[0]?.value ?? uid ?? 'Blank tag',
        uid: uid || undefined,
        chip: tagType(scanned),
        records: decoded,
        rewrite: rewriteFromRecord(decoded[0]),
      }),
    );
  };

  // Read starts scanning straight from Home.
  useEffect(() => {
    if (ready && !started.current) {
      started.current = true;
      scan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const failed = outcome?.tone === 'danger';
  const rewrite = saved?.rewrite;
  const sheet = (
    <ScanSheet
      visible={busy !== null}
      heading="Read Tag"
      title="Ready to scan"
      message={HOLD_HINT}
      notice={<Notice tone="info" title="Reading only" message="Nothing on the tag changes while you read it." />}
      onCancel={cancelScan}
    />
  );
  const scanButton = (label: string) => (
    <Button label={label} icon="nfc" onPress={scan} loading={busy !== null && Platform.OS === 'ios'} disabled={!ready || busy !== null} />
  );

  if (failed && outcome) {
    return (
      <Screen
        title="Read Tag"
        footer={
          <>
            {scanButton('Try again')}
            <Button label="Back to Home" variant="quiet" onPress={goHome} />
          </>
        }
      >
        <NfcStatus availability={availability} />
        <Spacer />
        <ScanPulse state="error" title={outcome.title} hint={outcome.message} />
        <Spacer />
        <Notice
          tone="danger"
          title="Nothing was read"
          message="Thick phone cases and metal surfaces can block NFC."
          action={<Button label="Diagnose this tag" size="sm" variant="secondary" onPress={() => router.push('/diagnose')} />}
        />
        {sheet}
      </Screen>
    );
  }

  if (!result) {
    return (
      <Screen title="Read Tag" footer={scanButton('Scan a tag')}>
        <NfcStatus availability={availability} />
        <Spacer />
        <ScanPulse state={busy !== null ? 'scanning' : 'ready'} title="Ready to scan" hint={HOLD_HINT} />
        <Spacer />
        <Notice tone="info" title="Reading only" message="Nothing on the tag changes while you read it." />
        {sheet}
      </Screen>
    );
  }

  const uid = formatUid(result.tag.id ?? result.tag.idm);
  const copyAll = [tagType(result), uid ? `UID ${uid}` : null, ...records.map((r) => `${r.title}: ${r.value}`)].filter(Boolean).join('\n');

  return (
    <Screen
      title="Tag details"
      gap={14}
      action={<CopyButton value={copyAll} label="Copy all" size="md" />}
      footer={
        <>
          <Button
            label="Write to this tag"
            icon="nfc"
            onPress={() =>
              rewrite
                ? router.push({ pathname: '/write/[kind]', params: { kind: rewrite.kind, prefill: JSON.stringify(rewrite.form) } })
                : router.push('/write')
            }
          />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button label="Scan another" icon="scan" size="sm" variant="secondary" flex onPress={scan} disabled={!ready || busy !== null} />
            <Button label="Diagnose" icon="wrench" size="sm" variant="secondary" flex onPress={() => router.push('/diagnose')} />
          </View>
        </>
      }
    >
      <NfcStatus availability={availability} />

      {outcome ? <Notice tone={outcome.tone} title={outcome.title} message={outcome.message} /> : null}

      {seen ? (
        <View style={[styles.seen, { backgroundColor: t.surfaceTint }]}>
          <Icon name="history" size={20} strokeWidth={2.4} color={t.violetInk} />
          <Text style={[type.caption, { color: t.ink, flex: 1 }]}>
            <Text style={{ fontFamily: type.group.fontFamily }}>Seen before</Text> · {dayLabel(seen.at).toLowerCase()}, {seen.title.toLowerCase()}
          </Text>
        </View>
      ) : null}

      <TagCard result={result} records={records} />

      {records.length === 0 ? (
        <Notice
          tone="info"
          title={result.ndefSupported ? 'No data on this tag' : 'No readable NDEF data'}
          message={
            result.ndefSupported
              ? 'The tag is blank. Write something to it.'
              : 'This tag isn’t NDEF formatted, so only its ID and technology can be shown. Writing to it formats it first when this phone can.'
          }
        />
      ) : null}

      <TagDetails result={result} />
      {sheet}
    </Screen>
  );
}

function TagCard({ result, records }: { result: ScanResult; records: DecodedRecord[] }) {
  const t = useTheme();
  const uid = formatUid(result.tag.id ?? result.tag.idm);
  return (
    <Card style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconTile icon="nfc" />
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: t.ink, fontFamily: type.heading.fontFamily, fontSize: 19 }]} numberOfLines={2}>
            {tagType(result)}
          </Text>
          <Text style={[type.caption, { color: t.inkMuted }]} numberOfLines={1}>
            {result.ndefSupported ? 'NDEF formatted' : 'Not NDEF formatted'}
          </Text>
        </View>
        {result.writable == null ? null : result.writable ? (
          <Badge tone="success" icon="check">
            Writable
          </Badge>
        ) : (
          <Badge tone="warning" icon="lock">
            Locked
          </Badge>
        )}
      </View>
      {uid ? (
        <View style={[styles.uid, { backgroundColor: t.surfaceSunk, boxShadow: t.clayWell }]}>
          <Text style={[type.micro, { color: t.inkMuted }]}>{result.tag.idm ? 'IDm' : 'UID'}</Text>
          <Text selectable style={[type.mono, { color: t.ink, flex: 1 }]}>
            {uid}
          </Text>
          <CopyButton value={uid} label="Copy UID" />
        </View>
      ) : null}
      {result.ndefSupported && result.capacity ? <Meter label="Memory" value={result.usedBytes} max={result.capacity} /> : null}
      {records.length > 0 ? (
        <View accessibilityLabel={records.length === 1 ? '1 record' : `${records.length} records`}>
          {records.map((record, i) => (
            <RecordCard key={`${result.scannedAt}-${i}`} record={record} index={i} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function TagDetails({ result }: { result: ScanResult }) {
  const { tag } = result;
  const rows: { label: string; value: string; monospace?: boolean }[] = [];
  if (tag.techTypes?.length) rows.push({ label: 'Technologies', value: tag.techTypes.map((x) => x.split('.').pop()).join(', ') });
  if (tag.atqa?.length || tag.sak != null) {
    const parts = [];
    // Android reports ATQA least-significant byte first; show it the way tag tools do (0x0044).
    if (tag.atqa?.length) parts.push(`ATQA 0x${toHex([...tag.atqa].reverse(), '')}`);
    if (tag.sak != null) parts.push(`SAK 0x${toHex([tag.sak])}`);
    rows.push({ label: 'NFC-A', value: parts.join(' · '), monospace: true });
  }
  if (result.ndefSupported && !result.capacity) rows.push({ label: 'Storage', value: `${result.usedBytes} bytes of NDEF data` });
  if (rows.length === 0) return null;
  return (
    <>
      <GroupLabel>Technical details</GroupLabel>
      <Card style={{ paddingVertical: space.xs, gap: 0 }}>
        {rows.map((row, i) => (
          <InfoRow key={row.label} {...row} last={i === rows.length - 1} />
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  seen: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: space.lg, borderRadius: radius.md },
  uid: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderRadius: radius.sm },
});
