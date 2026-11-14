import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { SavedLine, ScanPulse, SummaryList, TagLine } from '@/components/flow';
import { Icon, type IconName } from '@/components/Icon';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Caption, Card, CopyButton, goHome, GroupLabel, Notice, Panel, Screen, SectionLabel, Spacer } from '@/components/ui';
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
  scan: 'Ready to diagnose',
  keys: 'Testing factory key',
  reset: 'Resetting card',
};

const FINDING_ICON: Record<'ok' | 'warn' | 'bad' | 'info', IconName> = { ok: 'check', warn: 'lock', bad: 'close', info: 'info' };

export default function DiagnoseScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [keyTest, setKeyTest] = useState<KeyTestResult | null>(null);
  const [reset, setReset] = useState<ResetResult | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  /** Which step of the flow is on screen once a tag has been diagnosed. */
  const [view, setView] = useState<'findings' | 'key' | 'reset' | 'done'>('findings');

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
      setView('findings');
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
    if (result?.testableKeys)
      run('keys', 'Couldn’t test the key', () => testFactoryKeys(result.testableKeys!), (r) => {
        setKeyTest(r);
        setView('key');
      });
  };

  // The reset step is its own confirmation screen, so the button there goes straight to the card.
  const resetCard = () => {
    if (!result) return;
    run('reset', 'Couldn’t reset the card', () => resetNtag424(result.uid), (r) => {
      setReset(r);
      setView('done');
      addHistory({ action: 'unsecure', ok: true, title: 'Reset a card', subtitle: r.uid, uid: r.uid || undefined, chip: 'NTAG 424 DNA' });
    });
  };

  const ready = availability === 'ready';
  const idle = !ready || busy !== null;
  const canReset =
    result?.changeKey !== undefined &&
    !!keyTest?.results.some((r) => r.isFactory && r.keyNo === result.changeKey) &&
    (!keyTest.uid || keyTest.uid === result.uid);

  const sheet = (
    <ScanSheet
      visible={busy !== null}
      heading="Diagnose"
      title={busy ? SHEET_TITLE[busy] : ''}
      message={HOLD_HINT}
      notice={
        busy === 'reset' ? (
          <Notice tone="warning" icon="alert" title="Resetting this card" message="The old link is erased and SUN is turned off." />
        ) : (
          <Notice tone="info" title="Diagnosing only reads" message="It checks the chip’s own settings and never writes to the tag." />
        )
      }
      onCancel={cancelScan}
    />
  );
  const problem = error ? <Notice tone="danger" title={error.title} message={error.message} /> : null;

  /* Nothing diagnosed yet: the scan screen, or why the scan failed. */
  if (!result) {
    return (
      <Screen
        title="Diagnose"
        footer={
          <>
            <Button
              label={error ? 'Try again' : 'Diagnose a tag'}
              icon="wrench"
              onPress={scan}
              loading={busy === 'scan' && Platform.OS === 'ios'}
              disabled={idle}
            />
            <Button label="Supported tags" variant="quiet" onPress={() => router.push('/supported')} />
          </>
        }
      >
        <NfcStatus availability={availability} />
        <Spacer />
        {error ? (
          <ScanPulse state="error" title={error.title} hint={error.message} />
        ) : (
          <ScanPulse
            state={busy !== null ? 'scanning' : 'ready'}
            title="Ready to diagnose"
            hint="Hold the top of your phone against the tag you can’t write or erase"
          />
        )}
        <Spacer />
        <Notice tone="info" title="Diagnosing only reads" message="It checks the chip’s own settings and never writes to the tag." />
        {sheet}
      </Screen>
    );
  }

  /* The card was reset. */
  if (view === 'done' && reset) {
    return (
      <Screen
        title="Reset card"
        onBack={() => setView('findings')}
        gap={16}
        footer={
          <>
            <Button label="Write a new link" icon="pencil" onPress={() => router.push('/write')} />
            <Button label="Done" variant="quiet" onPress={goHome} />
          </>
        }
      >
        <Spacer />
        <ScanPulse
          state="success"
          title="Card reset"
          hint={reset.cleared ? 'The old link is gone and the card is blank.' : 'Permissions are reset. Erase the card to clear the old link.'}
        />
        <SavedLine />
        <Spacer />
        <Notice tone="success" title="It works like a new tag" message="Anyone can now write it. Its secure dynamic link is off." />
        {sheet}
      </Screen>
    );
  }

  /* Confirm the reset. */
  if (view === 'reset') {
    return (
      <Screen
        title="Reset card"
        onBack={() => setView('key')}
        footer={
          <>
            <Button label="Reset card" icon="nfc" variant="danger" onPress={resetCard} loading={busy === 'reset' && Platform.OS === 'ios'} disabled={idle || !canReset} />
            <Caption center>Then hold your phone near the card</Caption>
          </>
        }
      >
        <NfcStatus availability={availability} />
        {problem}
        <SectionLabel>Reset this card to factory settings?</SectionLabel>
        <SummaryList
          rows={[
            { label: 'SUN dynamic link', value: 'Off' },
            { label: 'Read and write', value: 'Anyone' },
            { label: 'Permission changes', value: 'Key 0' },
            { label: 'Old link', value: 'Erased', tone: 'danger' },
            { label: 'Keys', value: 'Unchanged' },
          ]}
        />
        <Notice tone="warning" icon="alert" title="The old link is gone for good" message="Anyone who taps this card afterwards finds a blank tag." />
        {sheet}
      </Screen>
    );
  }

  /* Result of the factory key test. */
  if (view === 'key' && keyTest && result.testableKeys) {
    const keyList = result.testableKeys.map((k) => `key ${k}`).join(' and ');
    const factory = keyTest.results.filter((r) => r.isFactory);
    const otherCard = result.uid && keyTest.uid && keyTest.uid !== result.uid;
    return (
      <Screen
        title="Factory key"
        onBack={() => setView('findings')}
        footer={
          canReset ? (
            <>
              <Button label="Reset card" iconEnd="chevron" onPress={() => setView('reset')} disabled={busy !== null} />
              <Button label="Leave it as it is" variant="quiet" onPress={() => setView('findings')} />
            </>
          ) : (
            <>
              <Button label="Back to findings" variant="secondary" onPress={() => setView('findings')} />
              <Button label="Test again" variant="quiet" onPress={testKeys} loading={busy === 'keys' && Platform.OS === 'ios'} disabled={idle} />
            </>
          )
        }
      >
        <NfcStatus availability={availability} />
        {problem}
        <Spacer />
        {factory.length ? (
          <ScanPulse
            state="success"
            title={factory.length === result.testableKeys.length ? 'Factory key still works' : `${factory.map((r) => `Key ${r.keyNo}`).join(' and ')} still uses the factory key`}
            hint={
              canReset
                ? 'The vendor left NXP’s default key on this card. Nothing was written.'
                : 'The factory key works, but it isn’t the key that controls this card’s permissions, so it can’t be reset here.'
            }
          />
        ) : (
          <ScanPulse
            state="error"
            title="The factory key doesn’t work"
            hint={`The card has its own secret ${keyList}. Without it, this card can’t be rewritten or reset.`}
          />
        )}
        <Spacer />
        {otherCard ? <Notice tone="warning" icon="alert" title="Different card" message={`This result is for card ${keyTest.uid}.`} /> : null}
        {canReset ? (
          <Notice
            tone="info"
            title="You can reset this card"
            message="Reset turns SUN off and clears the old link, so the card works like a new blank tag. Keys stay the same."
          />
        ) : null}
        {sheet}
      </Screen>
    );
  }

  /* Findings. */
  const testable = !!result.testableKeys && !reset;
  return (
    <Screen
      title="Findings"
      gap={14}
      footer={
        testable ? (
          <>
            <Button
              label={keyTest ? 'Test factory key again' : 'Test factory key'}
              icon="nfc"
              onPress={testKeys}
              loading={busy === 'keys' && Platform.OS === 'ios'}
              disabled={idle}
            />
            <Caption center>Checks if NXP’s default key is still set. Reads only.</Caption>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button label="Diagnose another" icon="wrench" size="sm" variant="secondary" flex onPress={scan} disabled={idle} />
              <Button label="Supported tags" icon="layers" size="sm" variant="secondary" flex onPress={() => router.push('/supported')} />
            </View>
          </>
        ) : (
          <>
            <Button label="Diagnose another tag" icon="wrench" onPress={scan} loading={busy === 'scan' && Platform.OS === 'ios'} disabled={idle} />
            <Button label="Supported tags" variant="quiet" onPress={() => router.push('/supported')} />
          </>
        )
      }
    >
      <NfcStatus availability={availability} />
      {problem}

      <Notice tone={VERDICT_TONE[result.verdict]} title={result.headline} message={result.explanation} />

      <TagLine name={result.chip} uid={result.uid || undefined} end={result.uid ? <CopyButton value={result.uid} label="Copy UID" /> : undefined} />

      <Card style={{ paddingVertical: space.lg, gap: 0 }}>
        {result.findings.map((f, i) => {
          const tone = f.tone ?? 'info';
          const c = {
            ok: { bg: t.successSoft, fg: t.success },
            warn: { bg: t.warningSoft, fg: t.warning },
            bad: { bg: t.dangerSoft, fg: t.danger },
            info: { bg: t.surfaceTint, fg: t.violetInk },
          }[tone];
          return (
            <View
              key={f.label}
              style={[styles.finding, i > 0 && { borderTopColor: t.line, borderTopWidth: 1 }, i === 0 && { paddingTop: 0 }, i === result.findings.length - 1 && { paddingBottom: 0 }]}
              accessible
              accessibilityLabel={`${f.label}: ${f.value}`}
            >
              <View style={[styles.findingIcon, { backgroundColor: c.bg }]}>
                <Icon name={FINDING_ICON[tone]} size={18} strokeWidth={2.6} color={c.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text selectable style={[type.label, { color: t.ink, lineHeight: 22 }]}>
                  {f.value}
                </Text>
                <Text style={[type.caption, { color: t.inkMuted }]}>{f.label}</Text>
              </View>
            </View>
          );
        })}
      </Card>

      <GroupLabel>What you can do</GroupLabel>
      <Panel style={{ gap: space.sm }}>
        {result.advice.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: space.sm }}>
            <Text style={[type.body, { color: t.inkMuted }]}>•</Text>
            <Text style={[type.body, { color: t.ink, flex: 1 }]}>{line}</Text>
          </View>
        ))}
      </Panel>

      {sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  finding: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: 10 },
  findingIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
