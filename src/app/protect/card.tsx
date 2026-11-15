import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { SavedLine, ScanPulse, SummaryList, TagLine } from '@/components/flow';
import { PASSPHRASE_RULE } from '@/components/LockedTag';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Badge, Button, Caption, CopyButton, Field, goHome, Notice, Panel, Screen, SectionLabel, Spacer, Toggle } from '@/components/ui';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory } from '@/lib/history';
import { cancelScan } from '@/lib/nfc';
import { MIN_PASSPHRASE, secureCard, unsecureCard, type SecureResult } from '@/lib/ntag424';
import { type, useTheme } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';

type Action = 'secure' | 'unsecure';

export default function SecureCardScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const { busy, outcome, setOutcome, run } = useScanAction();
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [savedIt, setSavedIt] = useState(false);
  /** The last scan, which decides between the steps, the done screen and the failed screen. */
  const [scan, setScan] = useState<{ action: Action; result: SecureResult | null; error: string | null } | null>(null);
  const ready = availability === 'ready';
  const valid = passphrase.length >= MIN_PASSPHRASE;

  const need = () => {
    if (valid) return true;
    setOutcome({ tone: 'danger', title: 'Enter a passphrase', message: PASSPHRASE_RULE });
    return false;
  };

  const review = () => {
    if (!need()) return;
    if (again !== passphrase) return setOutcome({ tone: 'danger', title: 'The passphrases don’t match', message: 'Type the same passphrase in both boxes.' });
    setOutcome(null);
    setSavedIt(false);
    setStep('confirm');
  };

  const secure = () => {
    if (!need()) return;
    setScan(null);
    run('secure', () => secureCard(passphrase), {
      success: (r: SecureResult) => ({
        tone: 'success',
        title: 'Card secured',
        message: `Anyone can still read card ${r.uid}, but writing needs your passphrase. Its AES key, if you ever need it for other tools: ${r.key}`,
      }),
      failTitle: 'The card wasn’t secured',
      log: (r, error) => {
        setScan({ action: 'secure', result: r, error });
        addHistory({
          action: 'secure',
          ok: r !== null,
          title: r ? 'Secured a card' : 'Couldn’t secure a card',
          subtitle: error ?? r?.uid ?? '',
          uid: r?.uid,
          chip: 'NTAG 424 DNA',
        });
      },
    });
  };

  const unsecure = () => {
    if (!need()) return;
    setScan(null);
    run('unsecure', () => unsecureCard(passphrase), {
      success: (r: SecureResult) => ({ tone: 'success', title: 'Lock removed', message: `Card ${r.uid} is back to its factory key: anyone can write to it.` }),
      failTitle: 'The lock wasn’t removed',
      log: (r, error) => {
        setScan({ action: 'unsecure', result: r, error });
        addHistory({
          action: 'unsecure',
          ok: r !== null,
          title: r ? 'Removed a card’s lock' : 'Couldn’t remove a card’s lock',
          subtitle: error ?? r?.uid ?? '',
          uid: r?.uid,
          chip: 'NTAG 424 DNA',
        });
      },
    });
  };

  const sheet = (
    <ScanSheet
      visible={busy !== null}
      heading="Protect"
      title={busy === 'unsecure' ? 'Ready to remove the lock' : 'Ready to secure'}
      message={HOLD_HINT}
      notice={
        busy === 'unsecure' ? (
          <Notice tone="info" title="Removing the lock" message="The card goes back to its factory key." />
        ) : (
          <Notice tone="warning" title="Setting your key" message="Writing will need your passphrase from now on." />
        )
      }
      onCancel={cancelScan}
    />
  );

  if (scan?.result) {
    const secured = scan.action === 'secure';
    return (
      <Screen title="Protect" gap={16} footer={<Button label="Done" variant="secondary" onPress={goHome} />}>
        <Spacer />
        <ScanPulse
          state="success"
          title={secured ? 'Card secured' : 'Lock removed'}
          hint={secured ? 'Writing now needs your passphrase. Anyone can still read it.' : 'The card is back to its factory key: anyone can write to it.'}
        />
        <SavedLine>Saved to history · the passphrase was not</SavedLine>
        <Spacer />
        <TagLine
          name="NTAG 424 DNA"
          uid={scan.result.uid}
          end={
            secured ? (
              <Badge tone="warning" icon="lock">
                Key
              </Badge>
            ) : (
              <Badge tone="success" icon="check">
                Open
              </Badge>
            )
          }
        />
        {secured && scan.result.key ? (
          <Notice
            tone="info"
            title="This card’s AES key"
            message={`${scan.result.key}\nOnly needed for other tools. Copy it now: it isn’t shown again.`}
            action={<CopyButton value={scan.result.key} label="Copy AES key" />}
          />
        ) : null}
        {sheet}
      </Screen>
    );
  }

  if (scan?.error) {
    return (
      <Screen
        title="Protect"
        onBack={() => setScan(null)}
        footer={
          <>
            <Button
              label="Try again"
              icon="nfc"
              onPress={scan.action === 'secure' ? secure : unsecure}
              loading={busy !== null && Platform.OS === 'ios'}
              disabled={!ready || busy !== null}
            />
            <Button label="See supported tags" variant="quiet" onPress={() => router.push('/supported')} />
          </>
        }
      >
        <NfcStatus availability={availability} />
        <Spacer />
        <ScanPulse state="error" title={scan.action === 'secure' ? 'The card wasn’t secured' : 'The lock wasn’t removed'} hint={scan.error} />
        <Spacer />
        <Notice tone="danger" title="Saved to history as failed" message="Only blank or reset NTAG 424 DNA cards can be secured." />
        {sheet}
      </Screen>
    );
  }

  if (step === 'confirm') {
    return (
      <Screen
        title="Confirm"
        onBack={() => setStep('form')}
        footer={
          <>
            <Button
              label="Secure card"
              icon="lock"
              variant="danger"
              onPress={secure}
              loading={busy === 'secure' && Platform.OS === 'ios'}
              disabled={!savedIt || !ready || busy !== null}
            />
            <Caption center>Then hold your phone near the card</Caption>
          </>
        }
      >
        <NfcStatus availability={availability} />
        <SectionLabel>Secure the next card you hold?</SectionLabel>
        <SummaryList
          rows={[
            { label: 'Protection', value: 'Your own AES key' },
            { label: 'Reading', value: 'Open to anyone' },
            { label: 'Writing', value: 'Needs your passphrase' },
            { label: 'Passphrase', value: 'Not saved anywhere' },
          ]}
        />
        <Notice tone="warning" title="Only you can unlock it" message="Without the passphrase, nobody can rewrite this card, ever." />
        <Panel>
          <Toggle label="I’ve saved the passphrase" description="Required before you can secure the card" value={savedIt} onChange={setSavedIt} />
        </Panel>
        {outcome?.tone === 'danger' ? <Notice tone="danger" title={outcome.title} message={outcome.message} /> : null}
        {sheet}
      </Screen>
    );
  }

  return (
    <Screen
      title="Secure card"
      footer={
        <>
          <Button label="Continue" iconEnd="chevron" onPress={review} />
          <Button
            label="Remove a card’s lock"
            variant="quiet"
            onPress={unsecure}
            loading={busy === 'unsecure' && Platform.OS === 'ios'}
            disabled={!ready || busy !== null}
          />
        </>
      }
    >
      <NfcStatus availability={availability} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Badge tone="neutral">NTAG 424 DNA</Badge>
        <Text style={[type.caption, { color: t.inkMuted, flex: 1 }]}>Replaces the factory key 0</Text>
      </View>
      <Field
        label="Passphrase"
        icon="lock"
        placeholder={`At least ${MIN_PASSPHRASE} characters`}
        value={passphrase}
        onChangeText={(value) => {
          setPassphrase(value);
          setOutcome(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        error={passphrase && !valid ? PASSPHRASE_RULE : null}
        hint={`Makes the card’s AES key, unique to each card and never stored. At least ${MIN_PASSPHRASE} characters.`}
      />
      <Field
        label="Type it again"
        icon="lock"
        value={again}
        onChangeText={(value) => {
          setAgain(value);
          setOutcome(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        error={again && again !== passphrase ? 'Doesn’t match the passphrase above.' : null}
        hint="Not needed to remove a card’s lock."
      />
      {outcome?.tone === 'danger' ? <Notice tone="danger" title={outcome.title} message={outcome.message} /> : null}
      <Notice
        tone="warning"
        title="A lost passphrase is permanent"
        message="The card can never be changed again without it. Only blank or reset cards can be secured."
      />
      {sheet}
    </Screen>
  );
}
