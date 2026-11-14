import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Card, Field, Notice, Screen, Segmented, Toggle } from '@/components/ui';
import { buildRecords, EMPTY_FORM, encodeMessage, normaliseLink, type WriteForm, type WriteKind } from '@/lib/ndef';
import { cancelScan, eraseTag, ScanCancelled, writeRecords, type WriteResult } from '@/lib/nfc';
import { space, useTheme } from '@/lib/theme';
import { useNfcAvailability } from '@/lib/useNfcAvailability';

const KINDS: { value: WriteKind; label: string }[] = [
  { value: 'link', label: 'Link' },
  { value: 'text', label: 'Text' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'wifi', label: 'Wi-Fi' },
];

/** Usable NDEF space on an NTAG213, the most common small sticker tag. */
const SMALL_TAG_BYTES = 137;

type Busy = 'write' | 'erase' | null;

export default function WriteScreen() {
  const t = useTheme();
  const { availability } = useNfcAvailability();
  const [kind, setKind] = useState<WriteKind>('link');
  const [form, setForm] = useState<WriteForm>(EMPTY_FORM);
  const [busy, setBusy] = useState<Busy>(null);
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'danger'; title: string; message?: string; diagnose?: boolean } | null>(null);

  const set = <K extends keyof WriteForm>(key: K) => (value: WriteForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setOutcome(null);
  };

  const built = useMemo(() => buildRecords(kind, form), [kind, form]);
  const size = built.ok ? encodeMessage(built.records).length : null;
  const ready = availability === 'ready';

  const run = async (action: Exclude<Busy, null>, task: () => Promise<WriteResult>, title: string) => {
    setOutcome(null);
    setBusy(action);
    try {
      const result = await task();
      setOutcome({
        tone: 'success',
        title,
        message: [
          `${result.bytes} bytes written`,
          result.capacity ? `of ${result.capacity} available` : null,
          result.formatted ? '(blank tag was formatted first)' : null,
        ]
          .filter(Boolean)
          .join(' '),
      });
    } catch (e) {
      if (e instanceof ScanCancelled) return;
      setOutcome({
        tone: 'danger',
        title: action === 'erase' ? 'Couldn’t erase the tag' : 'Couldn’t write the tag',
        message: e instanceof Error ? e.message : String(e),
        diagnose: true,
      });
    } finally {
      setBusy(null);
    }
  };

  const write = () => {
    if (!built.ok) {
      setOutcome({ tone: 'danger', title: 'Check the details', message: built.error });
      return;
    }
    run('write', () => writeRecords(built.records), `Wrote the ${built.summary} to the tag`);
  };

  const erase = () => {
    Alert.alert('Erase a tag?', 'Everything on the next tag you scan will be replaced with an empty message.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: () => run('erase', eraseTag, 'Tag erased') },
    ]);
  };

  return (
    <Screen title="Write" subtitle="Choose what to store, then hold a tag to your phone.">
      <NfcStatus availability={availability} />

      <Segmented
        options={KINDS}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setOutcome(null);
        }}
      />

      <Card style={{ gap: space.lg }}>
        <KindFields kind={kind} form={form} set={set} />
        {size != null ? (
          <View style={{ gap: 2 }}>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              Size on tag: <Text style={{ color: t.text, fontWeight: '600' }}>{size} bytes</Text>
            </Text>
            {size > SMALL_TAG_BYTES ? (
              <Text style={{ color: t.warning, fontSize: 13, lineHeight: 18 }}>
                Too big for small tags like NTAG213 ({SMALL_TAG_BYTES} bytes). Use an NTAG215 or NTAG216.
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      {outcome ? (
        <Notice
          tone={outcome.tone}
          title={outcome.title}
          message={outcome.message}
          action={
            outcome.diagnose ? (
              <Button label="Diagnose this tag" size="sm" variant="secondary" onPress={() => router.navigate('/diagnose')} />
            ) : undefined
          }
        />
      ) : null}

      <Button label="Write to tag" size="lg" onPress={write} loading={busy === 'write'} disabled={!ready || busy !== null} />
      <Button label="Erase a tag" variant="danger" onPress={erase} loading={busy === 'erase'} disabled={!ready || busy !== null} />

      <ScanSheet
        visible={busy !== null}
        title={busy === 'erase' ? 'Ready to erase' : 'Ready to write'}
        message="Hold the tag against the back of your phone, and keep it there until the write finishes."
        onCancel={cancelScan}
      />
    </Screen>
  );
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
          label="Web address"
          placeholder="example.com"
          value={form.link}
          onChangeText={set('link')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          hint={
            normalised && normalised !== form.link.trim()
              ? `Will be written as ${normalised}`
              : 'Phones open the link automatically when they tap the tag.'
          }
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
          hint="Stored as plain UTF-8 text, so emoji and other scripts work."
        />
      );
    case 'phone':
      return (
        <Field
          label="Phone number"
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
          <Field
            label="Network name (SSID)"
            value={form.ssid}
            onChangeText={set('ssid')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Toggle label="Password protected (WPA2)" value={form.wifiSecured} onChange={set('wifiSecured')} />
          {form.wifiSecured ? (
            <Field
              label="Password"
              value={form.wifiPassword}
              onChangeText={set('wifiPassword')}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
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
