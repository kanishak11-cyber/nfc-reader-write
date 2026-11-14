import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { IconDisc, Lead, SavedLine, ScanPulse } from '@/components/flow';
import { LockedTagFields, useLockedTag, writerFor } from '@/components/LockedTag';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Caption, goHome, Meter, Notice, Panel, Screen, Spacer } from '@/components/ui';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory } from '@/lib/history';
import { emptyMessage } from '@/lib/ndef';
import { cancelScan, type WriteResult } from '@/lib/nfc';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';

export default function EraseScreen() {
  const { availability } = useNfcAvailability();
  const { busy, outcome, setOutcome, run } = useScanAction();
  const [lock, setLock] = useLockedTag();
  /** The last scan, which decides between the confirmation, the erased screen and the failed screen. */
  const [scan, setScan] = useState<{ result: WriteResult | null; error: string | null } | null>(null);
  const ready = availability === 'ready';

  // This screen is the confirmation: the button says what happens and the banner says it can't be undone.
  const erase = () => {
    const writer = writerFor(lock, null, emptyMessage());
    if ('error' in writer) return setOutcome({ tone: 'danger', title: 'Check the sign-in details', message: writer.error });
    setScan(null);
    run('erase', writer.task, {
      success: () => ({ tone: 'success', title: 'Tag erased', message: 'The tag now holds an empty message. Saved to history.' }),
      failTitle: 'Nothing was erased',
      log: (r, error) => {
        setScan({ result: r, error });
        addHistory({
          action: 'erase',
          ok: r !== null,
          title: r ? 'Erased a tag' : 'Couldn’t erase a tag',
          subtitle: error ?? 'Replaced with an empty message',
        });
      },
    });
  };

  const startOver = () => {
    setScan(null);
    setOutcome(null);
  };

  const sheet = (
    <ScanSheet
      visible={busy !== null}
      heading="Erase Tag"
      title="Ready to erase"
      message={HOLD_HINT}
      notice={<Notice tone="warning" icon="alert" title="Erasing the next tag" message="All records are replaced with an empty message." />}
      onCancel={cancelScan}
    />
  );

  if (scan?.result) {
    return (
      <Screen
        title="Erase Tag"
        gap={16}
        footer={
          <>
            <Button label="Write to this tag" icon="pencil" onPress={() => router.push('/write')} />
            <Button label="Done" variant="quiet" onPress={goHome} />
          </>
        }
      >
        <Spacer />
        <ScanPulse state="success" title="Tag erased" hint="The tag is blank and ready to write" />
        <SavedLine />
        <Spacer />
        {scan.result.capacity ? (
          <Panel>
            <Meter label="Memory" value={scan.result.bytes} max={scan.result.capacity} />
          </Panel>
        ) : null}
        {sheet}
      </Screen>
    );
  }

  if (scan?.error) {
    return (
      <Screen
        title="Erase Tag"
        onBack={startOver}
        footer={
          <>
            <Button label="Diagnose this tag" icon="wrench" onPress={() => router.push('/diagnose')} />
            <Button label="Try again" variant="quiet" onPress={startOver} />
          </>
        }
      >
        <Spacer />
        <ScanPulse state="error" title="Couldn’t erase the tag" hint={scan.error} />
        <Spacer />
        <Notice tone="danger" title="Nothing was erased" message="The tag still holds its old data." />
        {sheet}
      </Screen>
    );
  }

  return (
    <Screen
      title="Erase Tag"
      footer={
        <>
          <Button
            label="Erase tag"
            icon="trash"
            variant="danger"
            onPress={erase}
            loading={busy !== null && Platform.OS === 'ios'}
            disabled={!ready || busy !== null}
          />
          <Caption center>Then hold your phone near the tag</Caption>
        </>
      }
    >
      <NfcStatus availability={availability} />
      <Spacer />
      <IconDisc icon="trash" />
      <Lead title="Erase the next tag you hold?" body="Every record on it is replaced with an empty message. The tag stays writable." />
      <Spacer />
      <LockedTagFields state={lock} onChange={setLock} />
      {outcome?.tone === 'danger' ? <Notice tone="danger" title={outcome.title} message={outcome.message} /> : null}
      <Notice tone="warning" icon="alert" title="Erasing can’t be undone" message="Read the tag first if you might need what’s on it." />
      {sheet}
    </Screen>
  );
}
