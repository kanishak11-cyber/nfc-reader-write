import { useMemo, useState } from 'react';
import { Platform, Text } from 'react-native';

import { NfcStatus } from '@/components/NfcStatus';
import { RecordCard } from '@/components/RecordCard';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Card, InfoRow, Notice, Screen, SectionLabel } from '@/components/ui';
import { decodeRecord, formatUid, toHex } from '@/lib/ndef';
import { cancelScan, readTag, ScanCancelled, type ScanResult } from '@/lib/nfc';
import { space, useTheme } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';

const IOS_TECH_NAMES: Record<string, string> = {
  mifare: 'MIFARE / NFC-A',
  IsoDep: 'ISO 7816 (ISO-DEP)',
  iso15693: 'ISO 15693 (NFC-V)',
  felica: 'FeliCa',
};

export default function ReadScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const records = useMemo(() => (result ? result.records.map(decodeRecord) : []), [result]);

  const scan = async () => {
    setError(null);
    setScanning(true);
    try {
      setResult(await readTag());
    } catch (e) {
      if (!(e instanceof ScanCancelled)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const ready = availability === 'ready';

  return (
    <Screen title="Read" subtitle="Scan a tag to see its ID, its storage and the data on it.">
      <NfcStatus availability={availability} />

      <Button
        label={result ? 'Scan another tag' : 'Scan a tag'}
        size="lg"
        onPress={scan}
        loading={scanning && Platform.OS === 'ios'}
        disabled={!ready || scanning}
      />

      {error ? <Notice tone="danger" title="Couldn’t read the tag" message={error} /> : null}

      {result ? (
        <>
          <SectionLabel right={<Text style={{ color: t.textSubtle, fontSize: 12 }}>{timeOf(result.scannedAt)}</Text>}>
            Tag
          </SectionLabel>
          <TagSummary result={result} />

          <SectionLabel>{records.length === 1 ? '1 record' : `${records.length} records`}</SectionLabel>
          {records.length > 0 ? (
            records.map((record, i) => <RecordCard key={`${result.scannedAt}-${i}`} record={record} index={i} />)
          ) : (
            <Notice
              tone="info"
              title={result.ndefSupported ? 'No data on this tag' : 'No readable NDEF data'}
              message={
                result.ndefSupported
                  ? 'The tag is blank. Use the Write tab to put something on it.'
                  : 'This tag doesn’t use the NDEF format, so only its ID and technology can be shown.'
              }
            />
          )}
        </>
      ) : !error && ready ? (
        <Card>
          <Text style={{ color: t.textMuted, fontSize: 15, lineHeight: 22 }}>
            {Platform.OS === 'ios'
              ? 'Tap “Scan a tag”, then hold the top edge of your iPhone against the tag until it vibrates.'
              : 'Tap “Scan a tag”, then hold the tag against the back of your phone, near the camera, until it vibrates.'}
          </Text>
        </Card>
      ) : null}

      <ScanSheet
        visible={scanning}
        title="Ready to scan"
        message="Hold an NFC tag against the back of your phone."
        onCancel={cancelScan}
      />
    </Screen>
  );
}

function TagSummary({ result }: { result: ScanResult }) {
  const { tag } = result;
  const rows: { label: string; value: string; monospace?: boolean; copyable?: boolean }[] = [];

  const uid = formatUid(tag.id ?? tag.idm);
  if (uid) rows.push({ label: tag.idm ? 'IDm' : 'Serial number (UID)', value: uid, monospace: true, copyable: true });

  const type = tag.type ?? (tag.tech ? IOS_TECH_NAMES[tag.tech] ?? tag.tech : null);
  if (type) rows.push({ label: 'Type', value: type });

  if (tag.techTypes?.length) {
    rows.push({ label: 'Technologies', value: tag.techTypes.map((x) => x.split('.').pop()).join(', ') });
  }

  if (tag.atqa?.length || tag.sak != null) {
    const parts = [];
    // Android reports ATQA least-significant byte first; show it the way tag tools do (0x0044).
    if (tag.atqa?.length) parts.push(`ATQA 0x${toHex([...tag.atqa].reverse(), '')}`);
    if (tag.sak != null) parts.push(`SAK 0x${toHex([tag.sak])}`);
    rows.push({ label: 'NFC-A', value: parts.join(' · '), monospace: true });
  }

  if (result.ndefSupported) {
    rows.push({
      label: 'Storage',
      value: result.capacity ? `${result.usedBytes} of ${result.capacity} bytes used` : `${result.usedBytes} bytes of NDEF data`,
    });
  }

  if (result.writable != null) {
    rows.push({ label: 'Writable', value: result.writable ? 'Yes' : 'No, the tag is locked' });
  }

  return (
    <Card style={{ paddingVertical: space.xs }}>
      {rows.map((row, i) => (
        <InfoRow key={row.label} {...row} last={i === rows.length - 1} />
      ))}
      {rows.length === 0 ? <InfoRow label="Tag" value="No details available" last /> : null}
    </Card>
  );
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}
