import { useState } from 'react';
import type { NdefRecord } from 'react-native-nfc-manager';

import { parseTagPassword } from '@/lib/chips';
import { eraseTag, writeRecords, type WriteResult } from '@/lib/nfc';
import { MIN_PASSPHRASE, writeSecuredCard } from '@/lib/ntag424';
import { writeRecordsWithPassword } from '@/lib/protect';
import { Field, Panel, Segmented, Toggle } from './ui';

export const PASSWORD_RULE = 'Use exactly 4 characters, or 8 hex digits (0–9, A–F).';
export const PASSPHRASE_RULE = `Use at least ${MIN_PASSPHRASE} characters.`;

type LockKind = 'password' | 'card';

export interface LockedTagState {
  locked: boolean;
  kind: LockKind;
  password: string;
  passphrase: string;
}

export function useLockedTag() {
  return useState<LockedTagState>({ locked: false, kind: 'password', password: '', passphrase: '' });
}

/**
 * The write (or erase, when `records` is null) to run for this lock state, or the reason
 * the sign-in details aren't usable yet.
 */
export function writerFor(
  state: LockedTagState,
  records: NdefRecord[] | null,
  emptyRecords: NdefRecord[],
): { task: () => Promise<WriteResult> } | { error: string } {
  const erasing = records === null;
  const message = records ?? emptyRecords;
  if (!state.locked) return { task: erasing ? eraseTag : () => writeRecords(message) };
  if (state.kind === 'password') {
    const password = parseTagPassword(state.password);
    if (!password) return { error: PASSWORD_RULE };
    return { task: () => writeRecordsWithPassword(message, password, erasing ? 'Tag erased' : undefined) };
  }
  if (state.passphrase.length < MIN_PASSPHRASE) return { error: PASSPHRASE_RULE };
  return { task: () => writeSecuredCard(message, state.passphrase, erasing ? 'Card erased' : undefined) };
}

/** "This tag is locked": the password or passphrase to sign in with before writing. */
export function LockedTagFields({ state, onChange }: { state: LockedTagState; onChange: (next: LockedTagState) => void }) {
  return (
    <Panel>
      <Toggle
        label="This tag is locked"
        description="Sign in with its password or passphrase first"
        value={state.locked}
        onChange={(locked) => onChange({ ...state, locked })}
      />
      {state.locked ? (
        <>
          <Segmented
            options={[
              { value: 'password', label: 'Tag password' },
              { value: 'card', label: 'Secure card' },
            ]}
            value={state.kind}
            onChange={(kind) => onChange({ ...state, kind })}
            inset={18}
          />
          {state.kind === 'password' ? (
            <Field
              label="Tag password"
              icon="lock"
              placeholder="4 characters"
              value={state.password}
              onChangeText={(password) => onChange({ ...state, password })}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={8}
              error={state.password.trim() && !parseTagPassword(state.password) ? PASSWORD_RULE : null}
              hint="For NTAG and MIFARE Ultralight EV1 tags."
            />
          ) : (
            <Field
              label="Card passphrase"
              icon="lock"
              placeholder={`At least ${MIN_PASSPHRASE} characters`}
              value={state.passphrase}
              onChangeText={(passphrase) => onChange({ ...state, passphrase })}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              error={state.passphrase && state.passphrase.length < MIN_PASSPHRASE ? PASSPHRASE_RULE : null}
              hint="For NTAG 424 DNA cards secured with this app."
            />
          )}
        </>
      ) : null}
    </Panel>
  );
}
