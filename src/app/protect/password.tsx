import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { SavedLine, ScanPulse, SummaryList, TagLine } from '@/components/flow';
import { PASSWORD_RULE } from '@/components/LockedTag';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Badge, Button, Caption, Field, goHome, Notice, Panel, Screen, SectionLabel, Spacer, Toggle } from '@/components/ui';
import { parseTagPassword } from '@/lib/chips';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory } from '@/lib/history';
import { cancelScan } from '@/lib/nfc';
import { removeTagPassword, setTagPassword, type ProtectResult } from '@/lib/protect';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';

type Action = 'lock' | 'unlock';

export default function TagPasswordScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const removing = mode === 'remove';

  const { availability } = useNfcAvailability();
  const { busy, outcome, setOutcome, run } = useScanAction();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [readProtect, setReadProtect] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [savedIt, setSavedIt] = useState(false);
  /** The last scan, which decides between the steps, the done screen and the failed screen. */
  const [scan, setScan] = useState<{ action: Action; result: ProtectResult | null; error: string | null } | null>(null);
  const ready = availability === 'ready';
  const parsed = parseTagPassword(password);

  const need = () => {
    if (parsed) return parsed;
    setOutcome({ tone: 'danger', title: 'Enter a tag password', message: PASSWORD_RULE });
    return null;
  };

  const review = () => {
    if (!need()) return;
    if (again !== password) return setOutcome({ tone: 'danger', title: 'The passwords don’t match', message: 'Type the same password in both boxes.' });
    setOutcome(null);
    setSavedIt(false);
    setStep('confirm');
  };

  const lock = () => {
    const pwd = need();
    if (!pwd) return;
    setScan(null);
    run('lock', () => setTagPassword(pwd, readProtect), {
      success: (r: ProtectResult) => ({
        tone: 'success',
        title: 'Tag locked',
        message: r.readProtected
          ? `This ${r.chip} now needs the password to read or write.`
          : `This ${r.chip} can still be read by anyone, but needs the password to write or erase.`,
      }),
      failTitle: 'The tag wasn’t locked',
      log: (r, error) => {
        setScan({ action: 'lock', result: r, error });
        addHistory({
          action: 'lock',
          ok: r !== null,
          title: r ? 'Locked a tag' : 'Couldn’t lock a tag',
          subtitle: error ?? (r?.readProtected ? 'Password needed to read and write' : 'Password needed to write'),
          chip: r?.chip,
        });
      },
    });
  };

  const unlock = () => {
    const pwd = need();
    if (!pwd) return;
    setScan(null);
    run('unlock', () => removeTagPassword(pwd), {
      success: (r: ProtectResult) => ({ tone: 'success', title: 'Password removed', message: `This ${r.chip} is open again: anyone can write to it.` }),
      failTitle: 'The password wasn’t removed',
      log: (r, error) => {
        setScan({ action: 'unlock', result: r, error });
        addHistory({
          action: 'unlock',
          ok: r !== null,
          title: r ? 'Removed a tag’s password' : 'Couldn’t remove a tag’s password',
          subtitle: error ?? 'Anyone can write to it again',
          chip: r?.chip,
        });
      },
    });
  };

  const sheet = (
    <ScanSheet
      visible={busy !== null}
      heading="Protect"
      title={busy === 'unlock' ? 'Ready to unlock' : 'Ready to lock'}
      message={HOLD_HINT}
      notice={
        busy === 'unlock' ? (
          <Notice tone="info" title="Removing the password" message="Anyone will be able to write to the tag again." />
        ) : (
          <Notice tone="warning" title="Setting a password" message="Writing will need it from now on." />
        )
      }
      onCancel={cancelScan}
    />
  );

  if (scan?.result) {
    const locked = scan.action === 'lock';
    return (
      <Screen title="Protect" gap={16} footer={<Button label="Done" variant="secondary" onPress={goHome} />}>
        <Spacer />
        <ScanPulse
          state="success"
          title={locked ? 'Tag locked' : 'Password removed'}
          hint={
            !locked
              ? 'The tag is open again: anyone can write to it.'
              : scan.result.readProtected
                ? 'Reading and writing now need your password.'
                : 'Writing now needs your password. Anyone can still read it.'
          }
        />
        <SavedLine>Saved to history · the password was not</SavedLine>
        <Spacer />
        <TagLine
          name={scan.result.chip}
          end={
            locked ? (
              <Badge tone="warning" icon="lock">
                Password
              </Badge>
            ) : (
              <Badge tone="success" icon="check">
                Open
              </Badge>
            )
          }
        />
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
              onPress={scan.action === 'lock' ? lock : unlock}
              loading={busy !== null && Platform.OS === 'ios'}
              disabled={!ready || busy !== null}
            />
            <Button label="See supported tags" variant="quiet" onPress={() => router.push('/supported')} />
          </>
        }
      >
        <NfcStatus availability={availability} />
        <Spacer />
        <ScanPulse state="error" title={scan.action === 'lock' ? 'The tag wasn’t locked' : 'The password wasn’t removed'} hint={scan.error} />
        <Spacer />
        <Notice tone="danger" title="Saved to history as failed" message="Passwords work on NTAG21x and MIFARE Ultralight EV1 tags." />
        {sheet}
      </Screen>
    );
  }

  if (removing) {
    return (
      <Screen
        title="Remove password"
        footer={
          <>
            <Button label="Remove password" icon="nfc" onPress={unlock} loading={busy === 'unlock' && Platform.OS === 'ios'} disabled={!ready || busy !== null} />
            <Caption center>Then hold your phone near the tag</Caption>
          </>
        }
      >
        <NfcStatus availability={availability} />
        <Field
          label="Password"
          icon="lock"
          mono
          placeholder="4 characters"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setOutcome(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          maxLength={8}
          error={password.trim() && !parsed ? PASSWORD_RULE : null}
          hint="The password this tag was locked with: 4 characters, or 8 hex digits."
        />
        {outcome?.tone === 'danger' ? <Notice tone="danger" title={outcome.title} message={outcome.message} /> : null}
        <Spacer />
        <Notice tone="info" title="The tag opens up again" message="Once the password is removed, anyone can write to or erase the tag." />
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
              label="Lock tag"
              icon="lock"
              variant="danger"
              onPress={lock}
              loading={busy === 'lock' && Platform.OS === 'ios'}
              disabled={!savedIt || !ready || busy !== null}
            />
            <Caption center>Then hold your phone near the tag</Caption>
          </>
        }
      >
        <NfcStatus availability={availability} />
        <SectionLabel>Lock the next tag you hold?</SectionLabel>
        <SummaryList
          rows={[
            { label: 'Protection', value: readProtect ? 'Password to read and write' : 'Password to write' },
            { label: 'Reading', value: readProtect ? 'Needs the password' : 'Open to anyone' },
            { label: 'Password', value: 'Not saved anywhere' },
          ]}
        />
        <Notice
          tone="warning"
          title="Only you can unlock it"
          message="Without the password, nobody can rewrite or erase this tag. It’s the chip’s own 32-bit password: it stops casual overwriting, but it isn’t strong encryption."
        />
        <Panel>
          <Toggle label="I’ve saved the password" description="Required before you can lock the tag" value={savedIt} onChange={setSavedIt} />
        </Panel>
        {outcome?.tone === 'danger' ? <Notice tone="danger" title={outcome.title} message={outcome.message} /> : null}
        {sheet}
      </Screen>
    );
  }

  return (
    <Screen title="Tag password" footer={<Button label="Continue" iconEnd="chevron" onPress={review} />}>
      <NfcStatus availability={availability} />
      <Field
        label="Password"
        icon="lock"
        mono
        placeholder="4 characters"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          setOutcome(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        maxLength={8}
        error={password.trim() && !parsed ? PASSWORD_RULE : null}
        hint="4 characters, or 8 hex digits. Write it down before you go on."
      />
      <Field
        label="Type it again"
        icon="lock"
        mono
        value={again}
        onChangeText={(value) => {
          setAgain(value);
          setOutcome(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        maxLength={8}
        error={again && again !== password ? 'Doesn’t match the password above.' : null}
      />
      <Panel>
        <Toggle label="Protect reading too" description="Off: anyone can read, only writing needs it" value={readProtect} onChange={setReadProtect} />
      </Panel>
      {outcome?.tone === 'danger' ? <Notice tone="danger" title={outcome.title} message={outcome.message} /> : null}
      {sheet}
    </Screen>
  );
}
