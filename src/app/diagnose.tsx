import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';

import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Caption, Card, InfoRow, Notice, OptionRow, Screen, SectionLabel } from '@/components/ui';
import type { Verdict } from '@/lib/chips';
import { HOLD_HINT } from '@/lib/copy';
import { diagnoseTag, resetNtag424, testFactoryKeys, type DiagnosisResult, type KeyTestResult, type ResetResult } from '@/lib/diagnose';
import { addHistory } from '@/lib/history';
import { cancelScan, ScanCancelled } from '@/lib/nfc';
import { space, type, useTheme } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';

const VERDICT_TONE: Record<Verdict, 'success' | 'danger' | 'warning' | 'info'> = {
  writable: 'success',
  locked: 'danger',
  password: 'warning',
  key: 'warning',
  unknown: 'info',
};

type Busy = 'scan' | 'keys' | 'reset' | null;

const SHEET_TITLE: Record<Exclude<Busy, null>, string> = {
  scan: 'Ready to check',
  keys: 'Testing factory key',
  reset: 'Resetting card',
};

export default function DiagnoseScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [keyTest, setKeyTest] = useState<KeyTestResult | null>(null);
  const [reset, setReset] = useState<ResetResult | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  const run = async <T,>(kind: Exclude<Busy, null>, errorTitle: string, task: () => Promise<T>, onDone: (value: T) => void) => {
    setError(null);
    setBusy(kind);
    try {
      onDone(await task());
    } catch (e) {
      if (!(e instanceof ScanCancelled)) setError({ title: errorTitle, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const scan = () =>
    run('scan', 'Couldn’t check the tag', diagnoseTag, (r) => {
      setResult(r);
      setKeyTest(null);
      setReset(null);
      addHistory({
        action: 'diagnose',
        ok: true,
        title: `Diagnosed ${r.chip}`,
        subtitle: r.headline,
        uid: r.uid || undefined,
        chip: r.chip,
        details: r.findings.map((f) => ({ label: f.label, value: f.value })),
      });
    });

  const testKeys = () => {
    if (result?.testableKeys) run('keys', 'Couldn’t test the key', () => testFactoryKeys(result.testableKeys!), setKeyTest);
  };

  const confirmReset = () => {
    if (!result) return;
    Alert.alert(
      'Reset this card?',
      'This turns off its secure dynamic link (SUN), deletes the old link, and makes the card writable by anyone, like a new blank tag. You can’t undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () =>
            run('reset', 'Couldn’t reset the card', () => resetNtag424(result.uid), (r) => {
              setReset(r);
              addHistory({ action: 'unsecure', ok: true, title: 'Reset a card', subtitle: r.uid, uid: r.uid || undefined, chip: 'NTAG 424 DNA' });
            }),
        },
      ],
    );
  };

  const ready = availability === 'ready';
  const canReset =
    result?.changeKey !== undefined &&
    !!keyTest?.results.some((r) => r.isFactory && r.keyNo === result.changeKey) &&
    (!keyTest.uid || keyTest.uid === result.uid);

  return (
    <Screen
      title="Diagnose"
      footer={
        <Button
          label={error ? 'Try again' : result ? 'Diagnose another tag' : 'Diagnose a tag'}
          icon="wrench"
          onPress={scan}
          loading={busy === 'scan' && Platform.OS === 'ios'}
          disabled={!ready || busy !== null}
        />
      }
    >
      <NfcStatus availability={availability} />

      {error ? <Notice tone="danger" title={error.title} message={error.message} /> : null}

      {reset ? (
        <Notice
          tone="success"
          title="Card reset"
          message={[
            reset.cleared ? 'The old link is gone and the card is blank.' : 'Permissions are reset. Erase the card to clear the old link.',
            'Anyone can now write it, like a new tag. Its secure dynamic link is off.',
          ].join(' ')}
          action={<Button label="Write a new link" size="sm" variant="secondary" onPress={() => router.push('/write')} />}
        />
      ) : null}

      {result ? (
        <>
          <Notice tone={VERDICT_TONE[result.verdict]} title={result.headline} message={result.explanation} />

          <SectionLabel>Findings</SectionLabel>
          <Card style={{ paddingVertical: space.xs, gap: 0 }}>
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
              canReset={canReset && !reset}
              busy={busy}
              disabled={!ready || busy !== null}
              onTest={testKeys}
              onReset={confirmReset}
            />
          ) : null}

          <SectionLabel>What you can do</SectionLabel>
          <Card style={{ gap: space.sm }}>
            {result.advice.map((line) => (
              <View key={line} style={{ flexDirection: 'row', gap: space.sm }}>
                <Text style={[type.body, { color: t.inkMuted }]}>•</Text>
                <Text style={[type.body, { color: t.ink, flex: 1 }]}>{line}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : !error && ready ? (
        <Caption>
          Reads the chip’s own settings: the exact chip model, permanent lock bits, password protection and, on NTAG 424 DNA cards, which key
          guards writing. It only reads. Nothing on the tag is changed.
        </Caption>
      ) : null}

      <OptionRow icon="layers" title="Supported tags" subtitle="What this phone can read, write and format" onPress={() => router.push('/supported')} />

      <ScanSheet visible={busy !== null} title={busy ? SHEET_TITLE[busy] : ''} message={HOLD_HINT} onCancel={cancelScan} />
    </Screen>
  );
}

function FactoryKeyCard({
  keys,
  uid,
  test,
  canReset,
  busy,
  disabled,
  onTest,
  onReset,
}: {
  keys: number[];
  uid: string;
  test: KeyTestResult | null;
  canReset: boolean;
  busy: Busy;
  disabled: boolean;
  onTest: () => void;
  onReset: () => void;
}) {
  const keyList = keys.map((k) => `key ${k}`).join(' and ');
  const factory = test?.results.filter((r) => r.isFactory) ?? [];
  const otherCard = test && uid && test.uid && test.uid !== uid;

  return (
    <>
      <SectionLabel>Factory key</SectionLabel>
      <Card>
        <Caption>
          Checks whether {keyList} still use NXP’s factory default (all zeros). Each check is a single sign-in attempt, and nothing is written
          to the card.
        </Caption>
        {test ? (
          factory.length ? (
            <Notice
              tone="success"
              title={`${factory.map((r) => `Key ${r.keyNo}`).join(' and ')} still ${factory.length > 1 ? 'use' : 'uses'} the factory key`}
              message={
                canReset
                  ? 'The vendor never changed it, so you can reset this card to a blank, writable tag.'
                  : 'The factory key works, but it isn’t the key that controls this card’s permissions, so it can’t be reset here.'
              }
            />
          ) : (
            <Notice
              tone="danger"
              title="The factory key doesn’t work"
              message={`The card has its own secret ${keyList}. Without it, this card can’t be rewritten or reset.`}
            />
          )
        ) : null}
        {otherCard ? <Notice tone="warning" icon="alert" title="Different card" message={`This result is for card ${test!.uid}.`} /> : null}
        {canReset ? (
          <Button label="Reset card" icon="trash" variant="danger" onPress={onReset} loading={busy === 'reset' && Platform.OS === 'ios'} disabled={disabled} />
        ) : null}
        <Button
          label={test ? 'Test again' : 'Test factory key'}
          variant="secondary"
          onPress={onTest}
          loading={busy === 'keys' && Platform.OS === 'ios'}
          disabled={disabled}
        />
      </Card>
    </>
  );
}
