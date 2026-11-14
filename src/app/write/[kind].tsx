import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { LockedTagFields, useLockedTag, writerFor } from '@/components/LockedTag';
import { SavedLine, ScanPulse } from '@/components/flow';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Caption, Field, goHome, Meter, Notice, Panel, Screen, Spacer, Toggle } from '@/components/ui';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory, rewriteOf } from '@/lib/history';
import { buildRecords, EMPTY_FORM, emptyMessage, encodeMessage, normaliseLink, type WriteForm, type WriteKind } from '@/lib/ndef';
import { cancelScan, type WriteResult } from '@/lib/nfc';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';
import { WRITE_KINDS } from '@/lib/writeKinds';

/** What the tag does once it holds each kind of content. */
const WRITTEN_TITLE: Record<WriteKind, string> = {
  link: 'The tag now opens your link',
  text: 'The tag now shows your text',
  phone: 'The tag now calls your number',
  email: 'The tag now starts your email',
  wifi: 'The tag now joins your network',
};

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
  /** The last scan, which decides between the form, the written screen and the failed screen. */
  const [scan, setScan] = useState<{ result: WriteResult | null; error: string | null } | null>(null);

  const set = <K extends keyof WriteForm>(key: K) => (value: WriteForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setOutcome(null);
  };

  const built = useMemo(() => buildRecords(kind, form), [kind, form]);
  const size = built.ok ? encodeMessage(built.records).length : null;
  const ready = availability === 'ready';
  const failed = outcome?.tone === 'danger';
  const written = scan?.result ?? null;
  const summary = summaryOf(kind, form);

  const write = () => {
    setScan(null);
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
      log: (r, error) => {
        setScan({ result: r, error });
        addHistory({
          action: 'write',
          ok: r !== null,
          title: r ? `Wrote ${built.summary}` : `Couldn’t write ${built.summary}`,
          subtitle: error ?? summaryOf(kind, form),
          records: [{ kind, title: option.title, value: summaryOf(kind, form) }],
          rewrite: rewriteOf(kind, form),
          details: r ? [{ label: 'Size', value: `${r.bytes} bytes${r.capacity ? ` of ${r.capacity}` : ''}` }] : undefined,
        });
      },
    });
  };

  const backToForm = () => {
    setScan(null);
    setOutcome(null);
  };

  const sheet = (
    <ScanSheet
      visible={busy !== null}
      heading="Write Tag"
      title="Ready to write"
      message={HOLD_HINT}
      notice={<Notice tone="info" title={`Writing ${built.ok ? built.summary : option.title}${size != null ? ` · ${size} bytes` : ''}`} message={summary || undefined} />}
      onCancel={cancelScan}
    />
  );

  if (written) {
    return (
      <Screen
        title="Write Tag"
        onBack={backToForm}
        gap={16}
        footer={
          <>
            <Button label="Done" variant="secondary" onPress={goHome} />
            <Button label="Write another tag" variant="quiet" onPress={backToForm} />
          </>
        }
      >
        <Spacer />
        <ScanPulse
          state="success"
          title="Tag written"
          hint={[
            written.capacity ? `${written.bytes} of ${written.capacity} bytes used` : `${written.bytes} bytes written`,
            written.formatted ? 'blank tag was formatted first' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <SavedLine />
        <Spacer />
        <Notice tone="success" title={WRITTEN_TITLE[kind]} message={summary || undefined} />
        {sheet}
      </Screen>
    );
  }

  if (scan?.error) {
    return (
      <Screen
        title="Write Tag"
        onBack={backToForm}
        footer={
          <>
            <Button label="Try again" icon="nfc" onPress={write} loading={busy !== null && Platform.OS === 'ios'} disabled={!ready || busy !== null} />
            <Button label="Back to editing" variant="quiet" onPress={backToForm} />
          </>
        }
      >
        <NfcStatus availability={availability} />
        <Spacer />
        <ScanPulse state="error" title="Couldn’t write the tag" hint={scan.error} />
        <Spacer />
        <Notice
          tone="danger"
          title="Nothing was written"
          message="Saved to history as failed."
          action={<Button label="Diagnose this tag" size="sm" variant="secondary" onPress={() => router.push('/diagnose')} />}
        />
        {sheet}
      </Screen>
    );
  }

  return (
    <Screen
      title={option.title}
      footer={
        <>
          <Button
            label="Write to Tag"
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

      <LockedTagFields state={lock} onChange={setLock} />

      {size != null ? (
        <View style={{ gap: 8 }}>
          <Meter label="Size on tag" value={size} max={TAG_SIZES.find((max) => size <= max) ?? TAG_SIZES[2]} />
          <Caption>
            {size > TAG_SIZES[0]
              ? `Too big for small tags like NTAG213 (${TAG_SIZES[0]} bytes). Use an NTAG215 or NTAG216.`
              : 'Checked against your tag before anything is written. Blank tags are formatted first.'}
          </Caption>
        </View>
      ) : null}

      {failed && outcome ? <Notice tone="danger" title={outcome.title} message={outcome.message} /> : null}

      {sheet}
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
          <Panel>
            <Toggle label="Password protected" description="WPA2 network" value={form.wifiSecured} onChange={set('wifiSecured')} />
          </Panel>
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
