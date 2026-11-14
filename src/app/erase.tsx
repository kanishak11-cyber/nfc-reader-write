import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

import { LockedTagFields, useLockedTag, writerFor } from '@/components/LockedTag';
import { NfcStatus } from '@/components/NfcStatus';
import { ScanSheet } from '@/components/ScanSheet';
import { Button, Notice, Screen } from '@/components/ui';
import { HOLD_HINT } from '@/lib/copy';
import { addHistory } from '@/lib/history';
import { emptyMessage } from '@/lib/ndef';
import { cancelScan } from '@/lib/nfc';
import { useNfcAvailability } from '@/lib/useNfcAvailability';
import { useScanAction } from '@/lib/useScanAction';

export default function EraseScreen() {
  const { availability } = useNfcAvailability();
  const { busy, outcome, setOutcome, run } = useScanAction();
  const [lock, setLock] = useLockedTag();
  const ready = availability === 'ready';
  const failed = outcome?.tone === 'danger';

  const erase = () => {
    const writer = writerFor(lock, null, emptyMessage());
    if ('error' in writer) return setOutcome({ tone: 'danger', title: 'Check the sign-in details', message: writer.error });
    Alert.alert('Erase the next tag?', 'Everything on the next tag you scan is replaced with an empty message. You can’t undo this.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Erase',
        style: 'destructive',
        onPress: () =>
          run('erase', writer.task, {
            success: () => ({ tone: 'success', title: 'Tag erased', message: 'The tag now holds an empty message. Saved to history.' }),
            failTitle: 'Nothing was erased',
            log: (r, error) =>
              addHistory({
                action: 'erase',
                ok: r !== null,
                title: r ? 'Erased a tag' : 'Couldn’t erase a tag',
                subtitle: error ?? 'Replaced with an empty message',
              }),
          }),
      },
    ]);
  };

  return (
    <Screen
      title="Erase Tag"
      footer={
        <Button
          label={failed ? 'Try again' : 'Erase a tag'}
          icon="trash"
          variant="danger"
          onPress={erase}
          loading={busy !== null && Platform.OS === 'ios'}
          disabled={!ready || busy !== null}
        />
      }
    >
      <NfcStatus availability={availability} />
      <Notice
        tone="warning"
        icon="alert"
        title="Erasing is permanent"
        message="The tag’s data is replaced with an empty message and can’t be brought back. The tag itself stays writable."
      />
      <LockedTagFields state={lock} onChange={setLock} />
      {outcome ? (
        <Notice
          tone={outcome.tone}
          title={outcome.title}
          message={failed ? `${outcome.message ?? ''} The tag still holds its old data.`.trim() : outcome.message}
          action={failed ? <Button label="Diagnose this tag" size="sm" variant="secondary" onPress={() => router.push('/diagnose')} /> : undefined}
        />
      ) : null}
      <ScanSheet visible={busy !== null} title="Ready to erase" message={HOLD_HINT} onCancel={cancelScan} />
    </Screen>
  );
}
