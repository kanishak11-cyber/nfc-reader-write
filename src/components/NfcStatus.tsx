import { Platform } from 'react-native';

import { openNfcSettings, type NfcAvailability } from '@/lib/nfc';

import { Button, Notice } from './ui';

/** Explains why scanning isn't possible; renders nothing when NFC is ready. */
export function NfcStatus({ availability }: { availability: NfcAvailability }) {
  if (availability === 'unsupported') {
    return (
      <Notice
        tone="warning"
        title="NFC isn’t available"
        message={
          Platform.OS === 'ios'
            ? 'This device can’t scan NFC tags. Use an iPhone 7 or newer. The Simulator has no NFC.'
            : 'This device has no NFC hardware, or you’re running in an emulator.'
        }
      />
    );
  }
  if (availability === 'disabled') {
    return (
      <Notice
        tone="warning"
        title="NFC is turned off"
        message="Turn on NFC in Settings to read and write tags."
        action={<Button label="Open NFC settings" size="sm" variant="secondary" onPress={() => openNfcSettings()} />}
      />
    );
  }
  return null;
}
