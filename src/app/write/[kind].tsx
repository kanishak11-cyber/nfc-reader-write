import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { LockedTagFields, useLockedTag, writerFor } from '@/components/LockedTag';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Caption, Card, Field, Meter, Notice, Screen, Toggle } from '@/components/ui';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory, rewriteOf } from '@/lib/history';
import { buildRecords, EMPTY_FORM, emptyMessage, encodeMessage, normaliseLink, type WriteForm, type WriteKind } from '@/lib/ndef';
import { cancelScan, type WriteResult } from '@/lib/nfc';
import { space } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';
import { WRITE_KINDS } from '@/lib/writeKinds';

/** Usable NDEF space on the common tag sizes: NTAG213, NTAG215, NTAG216. */
const TAG_SIZES = [137, 492, 868];

function parsePrefill(value: string | undefined): WriteForm {
  if (!value) return EMPTY_FORM;
  try {
    return { ...EMPTY_FORM, ...(JSON.parse(value) as Partial<WriteForm>) };
  } catch {
    return EMPTY_FORM;
  }
}

export default function WriteFormScreen() {
  const params = useLocalSearchParams<{ kind: string; prefill?: string }>();
  const option = WRITE_KINDS.find((k) => k.kind === params.kind) ?? WRITE_KINDS[0];
  const kind: WriteKind = option.kind;

  const { availability } = useNfcAvailability();
  const { busy, outcome, setOutcome, run } = useScanAction();
  const [form, setForm] = useState<WriteForm>(() => parsePrefill(params.prefill));
  const [lock, setLock] = useLockedTag();

  const set = <K extends keyof WriteForm>(key: K) => (value: WriteForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setOutcome(null);
  };

  const built = useMemo(() => buildRecords(kind, form), [kind, form]);
  const size = built.ok ? encodeMessage(built.records).length : null;
  const ready = availability === 'ready';
  const failed = outcome?.tone === 'danger';

  const write = () => {
    if (!built.ok) return setOutcome({ tone: 'danger', title: 'Check the details', message: built.error });
    const writer = writerFor(lock, built.records, emptyMessage());
    if ('error' in writer) return setOutcome({ tone: 'danger', title: 'Check the sign-in details', message: writer.error });
    run('write', writer.task, {
      success: (r: WriteResult) => ({
        tone: 'success',
        title: 'Tag written',
        message: [`${r.bytes} bytes`, r.capacity ? `of ${r.capacity}` : null, r.formatted ? '· blank tag was formatted first' : null, '· saved to history']
          .filter(Boolean)
          .join(' '),
      }),
      failTitle: 'Nothing was written',
      log: (r, error) =>
        addHistory({
          action: 'write',
          ok: r !== null,
          title: r ? `Wrote ${built.summary}` : `Couldn’t write ${built.summary}`,
          subtitle: error ?? summaryOf(kind, form),
          records: [{ kind, title: option.title, value: summaryOf(kind, form) }],
          rewrite: rewriteOf(kind, form),
          details: r ? [{ label: 'Size', value: `${r.bytes} bytes${r.capacity ? ` of ${r.capacity}` : ''}` }] : undefined,
        }),
    });
  };

  return (
    <Screen
      title={option.title}
      footer={
        <>
          <Button
            label={failed ? 'Try again' : 'Write to Tag'}
            icon="nfc"
            onPress={write}
            loading={busy !== null && Platform.OS === 'ios'}
            disabled={!ready || busy !== null}
          />
          <Caption center>Hold your phone near an NFC tag</Caption>
        </>
      }
    >
      <NfcStatus availability={availability} />

      <KindFields kind={kind} form={form} set={set} />

      {size != null ? (
        <Card style={{ gap: space.md }}>
          <Meter label="Estimated size" value={size} max={TAG_SIZES.find((max) => size <= max) ?? TAG_SIZES[2]} />
          {size > TAG_SIZES[0] ? <Caption>Too big for small tags like NTAG213 ({TAG_SIZES[0]} bytes). Use an NTAG215 or NTAG216.</Caption> : null}
        </Card>
      ) : null}

      <LockedTagFields state={lock} onChange={setLock} />

      {outcome ? (
        <Notice
          tone={outcome.tone}
          title={outcome.title}
          message={outcome.message}
          action={failed ? <Button label="Diagnose this tag" size="sm" variant="secondary" onPress={() => router.push('/diagnose')} /> : undefined}
        />
      ) : null}

      <ScanSheet visible={busy !== null} title="Ready to write" message={HOLD_HINT} onCancel={cancelScan} />
    </Screen>
  );
}

/** One line describing what's being written, without the Wi-Fi password. */
function summaryOf(kind: WriteKind, form: WriteForm): string {
  switch (kind) {
    case 'link':
      return normaliseLink(form.link);
    case 'text':
      return form.text.trim();
    case 'phone':
      return form.phone.trim();
    case 'email':
      return form.email.trim();
    case 'wifi':
      return form.ssid;
  }
}

function KindFields({
  kind,
  form,
  set,
}: {
  kind: WriteKind;
  form: WriteForm;
  set: <K extends keyof WriteForm>(key: K) => (value: WriteForm[K]) => void;
}) {
  switch (kind) {
    case 'link': {
      const normalised = normaliseLink(form.link);
      return (
        <Field
          label="Website address"
          icon="link"
          placeholder="example.com"
          value={form.link}
          onChangeText={set('link')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          hint={normalised && normalised !== form.link.trim() ? `Will be written as ${normalised}` : 'Opens in the browser when someone taps the tag'}
        />
      );
    }
    case 'text':
      return (
        <Field
          label="Text"
          placeholder="Anything you like"
          value={form.text}
          onChangeText={set('text')}
          multiline
          hint="Stored as plain UTF-8 text, so other scripts and symbols work."
        />
      );
    case 'phone':
      return (
        <Field
          label="Phone number"
          icon="phone"
          placeholder="+1 555 123 4567"
          value={form.phone}
          onChangeText={set('phone')}
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          hint="Tapping the tag offers to call this number."
        />
      );
    case 'email':
      return (
        <>
          <Field
            label="Email address"
            icon="user"
            placeholder="name@example.com"
            value={form.email}
            onChangeText={set('email')}
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
          <Field label="Subject (optional)" value={form.emailSubject} onChangeText={set('emailSubject')} />
          <Field label="Message (optional)" value={form.emailBody} onChangeText={set('emailBody')} multiline />
        </>
      );
    case 'wifi':
      return (
        <>
          <Field label="Network name (SSID)" icon="wifi" value={form.ssid} onChangeText={set('ssid')} autoCapitalize="none" autoCorrect={false} />
          <Card>
            <Toggle label="Password protected" description="WPA2 network" value={form.wifiSecured} onChange={set('wifiSecured')} />
          </Card>
          {form.wifiSecured ? (
            <Field
              label="Wi-Fi password"
              icon="lock"
              value={form.wifiPassword}
              onChangeText={set('wifiPassword')}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              hint="Written to the tag, but never saved in history."
            />
          ) : null}
          <Notice
            tone="info"
            title="Android only"
            message="Android phones can join the network by tapping the tag. iPhones don’t support Wi-Fi tags."
          />
        </>
      );
  }
}
