import { useState } from 'react';
import { Alert, Platform } from 'react-native';

import { PASSWORD_RULE } from '@/components/LockedTag';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Card, Field, Notice, Screen, Toggle } from '@/components/ui';
import { parseTagPassword } from '@/lib/chips';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory } from '@/lib/history';
import { cancelScan } from '@/lib/nfc';
import { removeTagPassword, setTagPassword, type ProtectResult } from '@/lib/protect';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';

export default function TagPasswordScreen() {
  const { availability } = useNfcAvailability();
  const { busy, outcome, setOutcome, run } = useScanAction();
  const [password, setPassword] = useState('');
  const [readProtect, setReadProtect] = useState(false);
  const ready = availability === 'ready';
  const parsed = parseTagPassword(password);

  const need = () => {
    if (parsed) return parsed;
    setOutcome({ tone: 'danger', title: 'Enter a tag password', message: PASSWORD_RULE });
    return null;
  };

  const lock = () => {
    const pwd = need();
    if (!pwd) return;
    Alert.alert(
      'Lock the next tag?',
      `After this, nobody can change ${readProtect ? 'or read ' : ''}the tag without this password. If you forget it, the tag can never be changed again. Keep a copy somewhere safe.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock',
          style: 'destructive',
          onPress: () =>
            run('lock', () => setTagPassword(pwd, readProtect), {
              success: (r: ProtectResult) => ({
                tone: 'success',
                title: 'Tag locked',
                message: r.readProtected
                  ? `This ${r.chip} now needs the password to read or write.`
                  : `This ${r.chip} can still be read by anyone, but needs the password to write or erase.`,
              }),
              failTitle: 'The tag wasn’t locked',
              log: (r, error) =>
                addHistory({
                  action: 'lock',
                  ok: r !== null,
                  title: r ? 'Locked a tag' : 'Couldn’t lock a tag',
                  subtitle: error ?? (r?.readProtected ? 'Password needed to read and write' : 'Password needed to write'),
                  chip: r?.chip,
                }),
            }),
        },
      ],
    );
  };

  const unlock = () => {
    const pwd = need();
    if (!pwd) return;
    run('unlock', () => removeTagPassword(pwd), {
      success: (r: ProtectResult) => ({ tone: 'success', title: 'Password removed', message: `This ${r.chip} is open again: anyone can write to it.` }),
      failTitle: 'The password wasn’t removed',
      log: (r, error) =>
        addHistory({
          action: 'unlock',
          ok: r !== null,
          title: r ? 'Removed a tag’s password' : 'Couldn’t remove a tag’s password',
          subtitle: error ?? 'Anyone can write to it again',
          chip: r?.chip,
        }),
    });
  };

  return (
    <Screen
      title="Tag password"
      footer={
        <>
          <Button label="Lock a tag" icon="lock" onPress={lock} loading={busy === 'lock' && Platform.OS === 'ios'} disabled={!ready || busy !== null} />
          <Button
            label="Remove a tag’s password"
            variant="secondary"
            onPress={unlock}
            loading={busy === 'unlock' && Platform.OS === 'ios'}
            disabled={!ready || busy !== null}
          />
        </>
      }
    >
      <NfcStatus availability={availability} />
      <Field
        label="Password"
        icon="lock"
        placeholder="4 characters"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          setOutcome(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={8}
        error={password.trim() && !parsed ? PASSWORD_RULE : null}
        hint="Exactly 4 characters, or 8 hex digits. Works on NTAG210, 212, 213, 215, 216 and MIFARE Ultralight EV1."
      />
      <Card>
        <Toggle label="Also block reading" description="Other phones won’t see the tag’s contents" value={readProtect} onChange={setReadProtect} />
      </Card>
      <Notice
        tone="warning"
        title="A forgotten password is permanent"
        message="Nobody can recover it, and the tag can never be changed again. This is the chip’s own 32-bit password: it stops casual overwriting, but it isn’t strong encryption."
      />
      {outcome ? <Notice tone={outcome.tone} title={outcome.title} message={outcome.message} /> : null}
      <ScanSheet visible={busy !== null} title={busy === 'unlock' ? 'Ready to unlock' : 'Ready to lock'} message={HOLD_HINT} onCancel={cancelScan} />
    </Screen>
  );
}
