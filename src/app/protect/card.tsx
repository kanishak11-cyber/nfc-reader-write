import { useState } from 'react';
import { Alert, Platform } from 'react-native';

import { PASSPHRASE_RULE } from '@/components/LockedTag';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Field, Notice, Screen } from '@/components/ui';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory } from '@/lib/history';
import { cancelScan } from '@/lib/nfc';
import { MIN_PASSPHRASE, secureCard, unsecureCard, type SecureResult } from '@/lib/ntag424';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';

export default function SecureCardScreen() {
  const { availability } = useNfcAvailability();
  const { busy, outcome, setOutcome, run } = useScanAction();
  const [passphrase, setPassphrase] = useState('');
  const ready = availability === 'ready';
  const valid = passphrase.length >= MIN_PASSPHRASE;

  const need = () => {
    if (valid) return true;
    setOutcome({ tone: 'danger', title: 'Enter a passphrase', message: PASSPHRASE_RULE });
    return false;
  };

  const secure = () => {
    if (!need()) return;
    Alert.alert(
      'Secure the next card?',
      'After this, the card can only be rewritten with this passphrase. If you forget it, the card can never be changed again, by anyone. Keep a copy somewhere safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Secure',
          style: 'destructive',
          onPress: () =>
            run('secure', () => secureCard(passphrase), {
              success: (r: SecureResult) => ({
                tone: 'success',
                title: 'Card secured',
                message: `Anyone can still read card ${r.uid}, but writing needs your passphrase. Its AES key, if you ever need it for other tools: ${r.key}`,
              }),
              failTitle: 'The card wasn’t secured',
              log: (r, error) =>
                addHistory({
                  action: 'secure',
                  ok: r !== null,
                  title: r ? 'Secured a card' : 'Couldn’t secure a card',
                  subtitle: error ?? r?.uid ?? '',
                  uid: r?.uid,
                  chip: 'NTAG 424 DNA',
                }),
            }),
        },
      ],
    );
  };

  const unsecure = () => {
    if (!need()) return;
    run('unsecure', () => unsecureCard(passphrase), {
      success: (r: SecureResult) => ({ tone: 'success', title: 'Lock removed', message: `Card ${r.uid} is back to its factory key: anyone can write to it.` }),
      failTitle: 'The lock wasn’t removed',
      log: (r, error) =>
        addHistory({
          action: 'unsecure',
          ok: r !== null,
          title: r ? 'Removed a card’s lock' : 'Couldn’t remove a card’s lock',
          subtitle: error ?? r?.uid ?? '',
          uid: r?.uid,
          chip: 'NTAG 424 DNA',
        }),
    });
  };

  return (
    <Screen
      title="Secure card"
      footer={
        <>
          <Button label="Secure a card" icon="lock" onPress={secure} loading={busy === 'secure' && Platform.OS === 'ios'} disabled={!ready || busy !== null} />
          <Button
            label="Remove a card’s lock"
            variant="secondary"
            onPress={unsecure}
            loading={busy === 'unsecure' && Platform.OS === 'ios'}
            disabled={!ready || busy !== null}
          />
        </>
      }
    >
      <NfcStatus availability={availability} />
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
        hint="For NTAG 424 DNA cards. Turned into an AES-128 key that is unique to each card and never stored. A longer passphrase is harder to guess."
      />
      <Notice
        tone="warning"
        title="A forgotten passphrase is permanent"
        message="Nobody can recover it, and the card can never be rewritten. Only blank or reset cards can be secured."
      />
      {outcome ? <Notice tone={outcome.tone} title={outcome.title} message={outcome.message} /> : null}
      <ScanSheet visible={busy !== null} title={busy === 'unsecure' ? 'Ready to remove the lock' : 'Ready to secure'} message={HOLD_HINT} onCancel={cancelScan} />
    </Screen>
  );
}
