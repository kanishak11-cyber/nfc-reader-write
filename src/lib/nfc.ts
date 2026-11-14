import { Platform } from 'react-native';
import NfcManager, { NdefStatus, NfcError, NfcTech, type NdefRecord, type TagEvent } from 'react-native-nfc-manager';

import { CLASSIC_SAKS, hex, staticLockedPages, type2BlankFormat, type2Layout, type2MessageCapacity, type2NdefTlv } from './chips';
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

/**
 * Android prefers its own NDEF support (Ndef, then NdefFormatable for blank tags). NfcA
 * catches the tags it won't handle, so blank NTAG/Ultralight chips can be formatted by
 * hand and anything else gets a specific explanation.
 */
const WRITE_TECHS_ANDROID = [NfcTech.Ndef, NfcTech.NdefFormatable, NfcTech.NfcA];

export function writeRecords(records: NdefRecord[], successMessage = 'Written to tag'): Promise<WriteResult> {
  const bytes = encodeMessage(records);
  const techs = Platform.OS === 'android' ? WRITE_TECHS_ANDROID : NfcTech.Ndef;

  return withSession(techs, 'Hold the top of your iPhone near the tag to write.', successMessage, async (tech) => {
    if (tech === NfcTech.NdefFormatable) {
      await NfcManager.ndefFormatableHandlerAndroid.formatNdef(bytes);
      return { bytes: bytes.length, capacity: null, formatted: true };
    }
    if (Platform.OS === 'android' && tech !== NfcTech.Ndef) return writeWithoutNdef(tech, bytes);

    const status = await NfcManager.ndefHandler.getNdefStatus().catch(() => null);
    if (status) {
      // iPhones report factory-blank chips as unsupported because they can't format them.
      if (status.status === NdefStatus.NotSupported) return writeWithoutNdef(tech, bytes);
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

/* ------------------------------------------------------------------ */
/* Tags the phone won't write as NDEF                                  */
/* ------------------------------------------------------------------ */

type TagKind = 'type2' | 'classic' | 'smartcard' | 'nfcv' | 'felica' | 'other';

function tagKind(tech: NfcTech | null, tag: TagEvent): TagKind {
  if (Platform.OS === 'ios') {
    // iOS lists DESFire and MIFARE Plus as "mifare" too; they fail the Type 2 READ later.
    if (tag.tech === 'mifare') return 'type2';
    if (tag.tech === 'IsoDep') return 'smartcard';
    if (tag.tech === 'iso15693') return 'nfcv';
    if (tag.tech === 'felica') return 'felica';
    return 'other';
  }
  const has = (name: string) => tag.techTypes?.some((t) => t.endsWith(`.${name}`)) ?? false;
  if (has('MifareClassic') || (tag.sak != null && CLASSIC_SAKS.has(tag.sak))) return 'classic';
  if (has('IsoDep')) return 'smartcard';
  if (tech === NfcTech.NfcA) return 'type2';
  if (has('NfcV')) return 'nfcv';
  if (has('NfcF')) return 'felica';
  return 'other';
}

const REPLACE = 'Use a blank NTAG213, NTAG215 or NTAG216 sticker or card instead.';

const NOT_NDEF_MESSAGES: Record<Exclude<TagKind, 'type2'>, string> = {
  // Android only: iPhones don't detect MIFARE Classic at all.
  classic: `This is a MIFARE Classic card, and this phone can’t format it. Only phones with an NXP NFC chip can, and only while the card still uses its factory keys. ${REPLACE}`,
  smartcard:
    'This is a smart card that doesn’t share an NFC data area with the phone. Bank, transit, ID and access cards are like this, and so are secure tags (NTAG 424 DNA, DESFire) whose issuer restricted access. The Diagnose tab can tell which.',
  nfcv: `This ISO 15693 (NFC-V) tag isn’t formatted for NDEF, and this app can’t format NFC-V tags yet. ${REPLACE}`,
  felica: `This FeliCa tag isn’t formatted for NDEF, and phones can’t format FeliCa tags. ${REPLACE}`,
  other: `This tag isn’t formatted for NDEF, and it’s not a type this app can format. The Diagnose tab can identify it. ${REPLACE}`,
};

async function writeWithoutNdef(tech: NfcTech | null, message: number[]): Promise<WriteResult> {
  const tag: TagEvent = (await NfcManager.getTag({ readNdef: false }).catch(() => null)) ?? {};
  const kind = tagKind(tech, tag);
  if (kind !== 'type2') throw new Error(NOT_NDEF_MESSAGES[kind]);
  return writeType2(message, tag.id ?? '');
}

/** Raw NFC-A (Type 2) command; null when the chip NAKs or doesn't answer. */
export async function transceiveNfcA(command: number[]): Promise<number[] | null> {
  try {
    const response = await NfcManager.nfcAHandler.transceive(command);
    return response.map((b) => b & 0xff);
  } catch {
    return null;
  }
}

/** WRITE one 4-byte page. The chip answers a 4-bit ACK (0xA); some stacks pass back nothing. */
async function writePage(page: number, data: number[]): Promise<boolean> {
  const response = await transceiveNfcA([0xa2, page, ...data]);
  return response !== null && (response.length === 0 || (response[0] & 0x0f) === 0x0a);
}

/** Reads back `expected` starting at `page`; READ returns four pages at a time. */
async function verifyPages(page: number, expected: number[]): Promise<boolean> {
  for (let offset = 0; offset < expected.length; offset += 16) {
    const read = await transceiveNfcA([0x30, page + offset / 4]);
    const want = expected.slice(offset, offset + 16);
    if (!read || want.some((b, i) => read[i] !== b)) return false;
  }
  return true;
}

/**
 * UIDs of older Ultralight chips (no GET_VERSION). They drop off after refusing it, so the
 * next tap skips it and formats them with the 48 bytes every Type 2 tag has.
 */
const legacyType2 = new Set<string>();

const PASSWORD_HINT = 'It may be protected by a password; the Diagnose tab can check.';

/**
 * Writes an NDEF message straight into NTAG/Ultralight memory: the NDEF TLV from page 4
 * and, on a factory-blank chip, the capability container in page 3, which is written last
 * so an interrupted write leaves the tag blank rather than half-formatted.
 */
async function writeType2(message: number[], uid: string): Promise<WriteResult> {
  const header = await transceiveNfcA([0x30, 0x00]);
  if (!header || header.length < 16) {
    throw new Error(
      `The tag isn’t formatted for NDEF and didn’t answer a standard memory read. It’s either password-protected or a MIFARE DESFire/Plus card, which can’t be formatted here. The Diagnose tab can tell which. ${REPLACE}`,
    );
  }

  const layout = type2Layout(header);
  if (layout.state === 'readOnly') throw new Error('This tag is locked (read-only).');
  if (layout.state === 'foreign') {
    throw new Error(
      `This tag’s setup area holds non-NDEF data (${hex(layout.cc)}), like a game figure or a proprietary tag. That area can only be written once, so it can’t be formatted. ${REPLACE}`,
    );
  }

  let dataArea: number;
  let cc: number[] | null = null;
  if (layout.state === 'formatted') {
    dataArea = layout.dataArea;
  } else {
    let version: number[] | null = null;
    if (!legacyType2.has(uid)) {
      version = await transceiveNfcA([0x60]);
      if (!version || version.length < 8) {
        version = null;
        // A refused command halts the chip on most phones; check it still answers.
        if ((await transceiveNfcA([0x30, 0x00]))?.length !== 16) {
          legacyType2.add(uid);
          throw new Error('This is an older MIFARE Ultralight. Move it away from the phone, then write again to finish formatting it.');
        }
      }
    }
    ({ cc, dataArea } = type2BlankFormat(version));
  }

  const tlv = type2NdefTlv(message, dataArea);
  const capacity = type2MessageCapacity(dataArea);
  if (!tlv) throw new Error(`Too much data: ${message.length} bytes, but this tag holds ${capacity}.`);

  const locked = staticLockedPages(header);
  const lastPage = 3 + tlv.length / 4;
  if ((cc && locked.has(3)) || [...locked].some((page) => page >= 4 && page <= lastPage)) {
    throw new Error('This tag is locked (read-only).');
  }

  for (let i = 0; i < tlv.length; i += 4) {
    if (!(await writePage(4 + i / 4, tlv.slice(i, i + 4)))) throw new Error(`The tag refused the write. ${PASSWORD_HINT}`);
  }
  if (!(await verifyPages(4, tlv))) throw new Error('The tag didn’t keep the data. Hold it still and try again.');

  if (cc) {
    if (!(await writePage(3, cc))) throw new Error(`The tag refused to be formatted. ${PASSWORD_HINT}`);
    const check = await transceiveNfcA([0x30, 0x00]);
    if (!check || cc.some((b, i) => check[12 + i] !== b)) throw new Error('The tag didn’t keep its format. Hold it still and try again.');
  }

  return { bytes: message.length, capacity, formatted: cc !== null };
}
