import { Platform } from 'react-native';
import NfcManager, { NdefStatus, NfcError, NfcTech, type NdefRecord, type TagEvent } from 'react-native-nfc-manager';

import { emptyMessage, encodeMessage, messageSize } from './ndef';

export type NfcAvailability = 'checking' | 'ready' | 'disabled' | 'unsupported';

/** Thrown when the user dismisses the scan; callers should stay silent. */
export class ScanCancelled extends Error {
  constructor() {
    super('Scan cancelled');
  }
}

let startPromise: Promise<void> | null = null;

function ensureStarted(): Promise<void> {
  if (!startPromise) {
    startPromise = NfcManager.start().catch((error) => {
      startPromise = null;
      throw error;
    });
  }
  return startPromise;
}

export async function getAvailability(): Promise<NfcAvailability> {
  try {
    if (!(await NfcManager.isSupported())) return 'unsupported';
    await ensureStarted();
    if (Platform.OS === 'android' && !(await NfcManager.isEnabled())) return 'disabled';
    return 'ready';
  } catch {
    return 'unsupported';
  }
}

export function openNfcSettings(): Promise<boolean> {
  return NfcManager.goToNfcSetting();
}

/* ------------------------------------------------------------------ */
/* Session handling                                                    */
/* ------------------------------------------------------------------ */

/**
 * Android connects to the first technology in this list that the tag supports,
 * so Ndef comes first and the rest let us still show UID/tech for blank or
 * proprietary tags. iOS ignores the list and always opens a tag reader session.
 */
const READ_TECHS_ANDROID = [
  NfcTech.Ndef,
  NfcTech.NdefFormatable,
  NfcTech.MifareUltralight,
  NfcTech.MifareClassic,
  NfcTech.IsoDep,
  NfcTech.NfcA,
  NfcTech.NfcB,
  NfcTech.NfcF,
  NfcTech.NfcV,
];

let sessionActive = false;

export async function withSession<T>(
  techs: NfcTech | NfcTech[],
  prompt: string,
  successMessage: string,
  work: (tech: NfcTech | null) => Promise<T>,
): Promise<T> {
  if (sessionActive) throw new Error('A scan is already in progress.');
  sessionActive = true;
  let requested = false;
  try {
    await ensureStarted();
    requested = true;
    const tech = await NfcManager.requestTechnology(techs, { alertMessage: prompt });
    const result = await work(tech);
    if (Platform.OS === 'ios') await NfcManager.setAlertMessageIOS(successMessage);
    return result;
  } catch (error) {
    if (error instanceof NfcError.UserCancel || error instanceof ScanCancelled) throw new ScanCancelled();
    const message = describeError(error);
    if (Platform.OS === 'ios' && requested) {
      // Shows the failure inside the system sheet instead of a silent dismissal.
      await NfcManager.invalidateSessionWithErrorIOS(message).catch(() => {});
    }
    throw new Error(message);
  } finally {
    if (requested) await NfcManager.cancelTechnologyRequest().catch(() => {});
    sessionActive = false;
  }
}

/** Android has no system scan sheet, so the in-app sheet calls this to stop waiting. */
export function cancelScan(): Promise<void> {
  return NfcManager.cancelTechnologyRequest().catch(() => {});
}

function describeError(error: unknown): string {
  if (error instanceof NfcError.Timeout) return 'The scan timed out. Try again.';
  if (error instanceof NfcError.TagConnectionLost) return 'Lost contact with the tag. Hold it still until the scan finishes.';
  if (error instanceof NfcError.TagNotWritable) return 'This tag is read-only.';
  if (error instanceof NfcError.TagSizeTooSmall) return 'This tag doesn’t have enough space for that content.';
  if (error instanceof NfcError.SystemBusy) return 'NFC is busy. Wait a moment and try again.';
  if (error instanceof NfcError.TagUpdateFailure) return 'The tag rejected the write.';
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Something went wrong talking to the tag.';
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export interface ScanResult {
  tag: TagEvent;
  records: NdefRecord[];
  /** Technology the session connected with (Android) or the tag family (iOS). */
  connectedTech: string | null;
  capacity: number | null;
  usedBytes: number;
  writable: boolean | null;
  ndefSupported: boolean;
  scannedAt: number;
}

export function readTag(): Promise<ScanResult> {
  const techs = Platform.OS === 'android' ? READ_TECHS_ANDROID : NfcTech.Ndef;
  return withSession(techs, 'Hold the top of your iPhone near the tag.', 'Tag read', async (tech) => {
    const tag = await NfcManager.getTag();
    if (!tag) throw new Error('No tag was detected.');

    const records = tag.ndefMessage ?? [];
    let capacity: number | null = tag.maxSize ?? null;
    let writable: boolean | null = tag.isWritable ?? null;
    let ndefSupported = records.length > 0 || tag.maxSize != null || tech === NfcTech.Ndef;

    if (Platform.OS === 'ios') {
      try {
        const status = await NfcManager.ndefHandler.getNdefStatus();
        ndefSupported = status.status !== NdefStatus.NotSupported;
        capacity = ndefSupported ? status.capacity : null;
        writable = ndefSupported ? status.status === NdefStatus.ReadWrite : null;
      } catch {
        // Some tags don't answer the status query; keep what we have.
      }
    }

    return {
      tag,
      records,
      connectedTech: tech ?? tag.tech ?? null,
      capacity,
      usedBytes: messageSize(records),
      writable,
      ndefSupported,
      scannedAt: Date.now(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

export interface WriteResult {
  bytes: number;
  capacity: number | null;
  formatted: boolean;
}

export function writeRecords(records: NdefRecord[], successMessage = 'Written to tag'): Promise<WriteResult> {
  const bytes = encodeMessage(records);
  // On Android, NdefFormatable lets us write to factory-blank tags by formatting them.
  const techs = Platform.OS === 'android' ? [NfcTech.Ndef, NfcTech.NdefFormatable] : NfcTech.Ndef;

  return withSession(techs, 'Hold the top of your iPhone near the tag to write.', successMessage, async (tech) => {
    if (tech === NfcTech.NdefFormatable) {
      await NfcManager.ndefFormatableHandlerAndroid.formatNdef(bytes);
      return { bytes: bytes.length, capacity: null, formatted: true };
    }

    const status = await NfcManager.ndefHandler.getNdefStatus().catch(() => null);
    if (status) {
      if (status.status === NdefStatus.NotSupported) throw new Error('This tag doesn’t support NDEF, so it can’t be written.');
      if (status.status === NdefStatus.ReadOnly) throw new Error('This tag is locked (read-only).');
      if (status.capacity > 0 && bytes.length > status.capacity) {
        throw new Error(`Too much data: ${bytes.length} bytes, but this tag holds ${status.capacity}.`);
      }
    }

    try {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
    } catch (error) {
      if (error instanceof NfcError.UserCancel || error instanceof NfcError.TagConnectionLost) throw error;
      // The NDEF layer said "writable" but the chip refused: typical of password- or key-protected tags.
      throw new Error('The tag refused the write. It may be protected by a password or key; the Diagnose tab can check.');
    }
    return { bytes: bytes.length, capacity: status?.capacity ?? null, formatted: false };
  });
}

export function eraseTag(): Promise<WriteResult> {
  return writeRecords(emptyMessage(), 'Tag erased');
}
