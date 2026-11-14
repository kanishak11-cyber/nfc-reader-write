import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Card, InfoRow, Notice, Screen, SectionLabel } from '@/components/ui';
import type { Verdict } from '@/lib/chips';
import { diagnoseTag, testFactoryKeys, type DiagnosisResult, type KeyTestResult } from '@/lib/diagnose';
import { cancelScan, ScanCancelled } from '@/lib/nfc';
import { space, useTheme } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';

const VERDICT_TONE: Record<Verdict, 'success' | 'danger' | 'warning' | 'info'> = {
  writable: 'success',
  locked: 'danger',
  password: 'warning',
  key: 'warning',
  unknown: 'info',
};

type Busy = 'scan' | 'keys' | null;

export default function DiagnoseScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [keyTest, setKeyTest] = useState<KeyTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async <T,>(kind: Exclude<Busy, null>, task: () => Promise<T>, onDone: (value: T) => void) => {
    setError(null);
    setBusy(kind);
    try {
      onDone(await task());
    } catch (e) {
      if (!(e instanceof ScanCancelled)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const scan = () =>
    run('scan', diagnoseTag, (r) => {
      setResult(r);
      setKeyTest(null);
    });

  const testKeys = () => {
    if (result?.testableKeys) run('keys', () => testFactoryKeys(result.testableKeys!), setKeyTest);
  };

  const ready = availability === 'ready';

  return (
    <Screen title="Diagnose" subtitle="Find out why a tag can’t be written or erased.">
      <NfcStatus availability={availability} />

      <Button
        label={result ? 'Diagnose another tag' : 'Diagnose a tag'}
        size="lg"
        onPress={scan}
        loading={busy === 'scan' && Platform.OS === 'ios'}
        disabled={!ready || busy !== null}
      />

      {error ? <Notice tone="danger" title="Couldn’t check the tag" message={error} /> : null}

      {result ? (
        <>
          <Notice tone={VERDICT_TONE[result.verdict]} title={result.headline} message={result.explanation} />

          <SectionLabel
            right={<Text style={{ color: t.textSubtle, fontSize: 12 }}>{new Date(result.scannedAt).toLocaleTimeString()}</Text>}
          >
            Findings
          </SectionLabel>
          <Card style={{ paddingVertical: space.xs }}>
            {result.uid ? <InfoRow label="Serial number (UID)" value={result.uid} monospace copyable /> : null}
            {result.findings.map((f, i) => (
              <InfoRow key={f.label} label={f.label} value={f.value} tone={f.tone} last={i === result.findings.length - 1} />
            ))}
          </Card>

          {result.testableKeys ? (
            <FactoryKeyCard
              keys={result.testableKeys}
              uid={result.uid}
              test={keyTest}
              busy={busy === 'keys'}
              disabled={!ready || busy !== null}
              onTest={testKeys}
            />
          ) : null}

          <SectionLabel>What you can do</SectionLabel>
          <Card style={{ gap: space.sm }}>
            {result.advice.map((line) => (
              <View key={line} style={{ flexDirection: 'row', gap: space.sm }}>
                <Text style={{ color: t.textMuted, fontSize: 15, lineHeight: 22 }}>•</Text>
                <Text style={{ color: t.text, fontSize: 15, lineHeight: 22, flex: 1 }}>{line}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : !error && ready ? (
        <Card>
          <Text style={{ color: t.textMuted, fontSize: 15, lineHeight: 22 }}>
            Reads the chip’s own settings: the exact chip model, permanent lock bits, password protection, and, on NTAG 424
            DNA cards, which key guards writing. It only reads. Nothing on the tag is changed.
          </Text>
        </Card>
      ) : null}

      <ScanSheet
        visible={busy !== null}
        title={busy === 'keys' ? 'Testing factory key' : 'Ready to check'}
        message="Hold the tag against the back of your phone and keep it still until the check finishes."
        onCancel={cancelScan}
      />
    </Screen>
  );
}

function FactoryKeyCard({
  keys,
  uid,
  test,
  busy,
  disabled,
  onTest,
}: {
  keys: number[];
  uid: string;
  test: KeyTestResult | null;
  busy: boolean;
  disabled: boolean;
  onTest: () => void;
}) {
  const t = useTheme();
  const keyList = keys.map((k) => `key ${k}`).join(' and ');
  const factory = test?.results.filter((r) => r.isFactory) ?? [];
  const otherCard = test && uid && test.uid && test.uid !== uid;

  return (
    <>
      <SectionLabel>Factory key</SectionLabel>
      <Card>
        <Text style={{ color: t.textMuted, fontSize: 15, lineHeight: 22 }}>
          Checks whether {keyList} still use NXP’s factory default (all zeros). Each check is a single sign-in attempt, and
          nothing is written to the card.
        </Text>
        {test ? (
          factory.length ? (
            <Notice
              tone="success"
              title={`${factory.map((r) => `Key ${r.keyNo}`).join(' and ')} still ${factory.length > 1 ? 'use' : 'uses'} the factory key`}
              message="The vendor never changed it, so this card can be reset and rewritten with the factory key. Resetting NTAG 424 DNA cards isn’t built into this version of the app yet."
            />
          ) : (
            <Notice
              tone="danger"
              title="The factory key doesn’t work"
              message={`The vendor set their own secret ${keyList}. Without it, this card can’t be rewritten or reset by anyone.`}
            />
          )
        ) : null}
        {otherCard ? (
          <Text style={{ color: t.warning, fontSize: 13 }}>Note: this result is for a different card ({test!.uid}).</Text>
        ) : null}
        <Button
          label={test ? 'Test again' : 'Test factory key'}
          variant="secondary"
          onPress={onTest}
          loading={busy && Platform.OS === 'ios'}
          disabled={disabled}
        />
      </Card>
    </>
  );
}
