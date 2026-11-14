import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { NfcStatus } from '@/components/NfcStatus';
import { RecordCard } from '@/components/RecordCard';
import { ScanSheet } from '@/components/ScanSheet';
import { Badge, Button, Caption, Card, CopyButton, IconTile, InfoRow, Meter, Notice, Screen, SectionLabel } from '@/components/ui';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory, dayLabel, lastSeen, rewriteFromRecord, toHistoryRecords, type HistoryEntry } from '@/lib/history';
import { decodeRecord, formatUid, toHex } from '@/lib/ndef';
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

  return (
    <Screen
      title={result ? 'Tag details' : 'Read Tag'}
      footer={
        result && !failed ? (
          <>
            <Button
              label="Write to this tag"
              icon="pencil"
              onPress={() =>
                rewrite
                  ? router.push({ pathname: '/write/[kind]', params: { kind: rewrite.kind, prefill: JSON.stringify(rewrite.form) } })
                  : router.push('/write')
              }
            />
            <Button label="Scan another tag" variant="secondary" onPress={scan} disabled={!ready || busy !== null} />
          </>
        ) : (
          <Button
            label={failed ? 'Try again' : 'Scan a tag'}
            icon="nfc"
            onPress={scan}
            loading={busy !== null && Platform.OS === 'ios'}
            disabled={!ready || busy !== null}
          />
        )
      }
    >
      <NfcStatus availability={availability} />

      {outcome ? (
        <Notice
          tone={outcome.tone}
          title={outcome.title}
          message={outcome.message}
          action={failed ? <Button label="Diagnose this tag" size="sm" variant="secondary" onPress={() => router.push('/diagnose')} /> : undefined}
        />
      ) : null}

      {result && !failed ? (
        <>
          <TagCard result={result} />
          {seen ? <Caption>Seen before: {dayLabel(seen.at).toLowerCase()}, {seen.title.toLowerCase()}.</Caption> : null}

          <SectionLabel>{records.length === 1 ? '1 record' : `${records.length} records`}</SectionLabel>
          {records.length > 0 ? (
            records.map((record, i) => <RecordCard key={`${result.scannedAt}-${i}`} record={record} index={i} />)
          ) : (
            <Notice
              tone="info"
              title={result.ndefSupported ? 'No data on this tag' : 'No readable NDEF data'}
              message={
                result.ndefSupported
                  ? 'The tag is blank. Write something to it.'
                  : 'This tag isn’t NDEF formatted, so only its ID and technology can be shown. Writing to it formats it first when this phone can.'
              }
            />
          )}
          <TagDetails result={result} />
        </>
      ) : !outcome && ready ? (
        <Caption center>{HOLD_HINT}</Caption>
      ) : null}

      <ScanSheet visible={busy !== null} title="Ready to scan" message={HOLD_HINT} onCancel={cancelScan} />
    </Screen>
  );
}

function TagCard({ result }: { result: ScanResult }) {
  const t = useTheme();
  const uid = formatUid(result.tag.id ?? result.tag.idm);
  return (
    <Card style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconTile icon="nfc" />
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: t.ink, fontFamily: type.heading.fontFamily, fontSize: 19 }]} numberOfLines={1}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderRadius: radius.sm, backgroundColor: t.surfaceSunk, boxShadow: t.clayWell }}>
          <Text style={[type.micro, { color: t.inkMuted }]}>{result.tag.idm ? 'IDm' : 'UID'}</Text>
          <Text selectable style={[type.mono, { color: t.ink, flex: 1 }]}>
            {uid}
          </Text>
          <CopyButton value={uid} label="Copy UID" />
        </View>
      ) : null}
      {result.ndefSupported && result.capacity ? <Meter label="Memory" value={result.usedBytes} max={result.capacity} /> : null}
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
      <SectionLabel>Technical details</SectionLabel>
      <Card style={{ paddingVertical: space.xs, gap: 0 }}>
        {rows.map((row, i) => (
          <InfoRow key={row.label} {...row} last={i === rows.length - 1} />
        ))}
      </Card>
    </>
  );
}
