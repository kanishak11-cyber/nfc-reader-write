/**
 * Writing tags the phone's own NDEF support won't take. Blank NTAG/Ultralight and
 * ISO 15693 tags are formatted by hand on both platforms, blank DESFire cards on
 * Android. Everything else gets an explanation, including which phone can handle it.
 */
import { Platform } from 'react-native';
import NfcManager, { NfcTech, type TagEvent } from 'react-native-nfc-manager';

import {
  APDU,
  CLASSIC_SAKS,
  DESFIRE,
  desfireNdefFileSize,
  hex,
  ISO15693_FLAGS,
  ndefTlv,
  ndefTlvCapacity,
  parseSystemInfo,
  splitResponse,
  staticLockedPages,
  SW,
  type2BlankFormat,
  type2Layout,
  type5BlankFormat,
  type5Layout,
  type Bytes,
} from './chips';
import type { WriteResult } from './nfc';

/* Transport ------------------------------------------------------- */

/** Raw NFC-A (Type 2) command; null when the chip NAKs or doesn't answer. */
export async function transceiveNfcA(command: Bytes): Promise<Bytes | null> {
  try {
    const response = await NfcManager.nfcAHandler.transceive(command);
    return response.map((b) => b & 0xff);
  } catch {
    return null;
  }
}

/** ISO 15693 request [flags, command, …]; the reply starts with its flags byte. Null when there's no answer. */
async function transceiveNfcV(command: Bytes): Promise<Bytes | null> {
  try {
    const response = await NfcManager.nfcVHandler.transceive(command);
    return response.map((b) => b & 0xff);
  } catch {
    return null;
  }
}

/** ISO 7816 APDU over ISO-DEP; sw is 0 when the card doesn't answer. */
export async function apdu(command: Bytes): Promise<{ data: Bytes; sw: number }> {
  try {
    return splitResponse(await NfcManager.isoDepHandler.transceive(command));
  } catch {
    return { data: [], sw: 0 };
  }
}

/* Telling tags apart ------------------------------------------------ */

type TagKind = 'type2' | 'iso15693' | 'isodep' | 'classic' | 'felica' | 'other';

const hasTech = (tag: TagEvent, name: string) => tag.techTypes?.some((t) => t.endsWith(`.${name}`)) ?? false;

function tagKind(tech: NfcTech | null, tag: TagEvent): TagKind {
  if (Platform.OS === 'ios') {
    // iOS lists DESFire and MIFARE Plus as "mifare" too; writeType2 tells them apart.
    if (tag.tech === 'mifare') return 'type2';
    if (tag.tech === 'IsoDep') return 'isodep';
    if (tag.tech === 'iso15693') return 'iso15693';
    if (tag.tech === 'felica') return 'felica';
    return 'other';
  }
  if (hasTech(tag, 'MifareClassic') || (tag.sak != null && CLASSIC_SAKS.has(tag.sak))) return 'classic';
  if (tech === NfcTech.IsoDep || hasTech(tag, 'IsoDep')) return 'isodep';
  if (tech === NfcTech.NfcA) return 'type2';
  if (tech === NfcTech.NfcV || hasTech(tag, 'NfcV')) return 'iso15693';
  if (hasTech(tag, 'NfcF')) return 'felica';
  return 'other';
}

/* Messages ------------------------------------------------------- */

const REPLACE = 'Use a blank NTAG213, NTAG215 or NTAG216 sticker or card instead.';
const PASSWORD_HINT = 'It may be protected by a password; the Diagnose tab can check.';

export const NO_NDEF = {
  smartcard:
    'This is a smart card that doesn’t share an NFC data area with the phone. Bank, transit, ID and access cards are like this, and so are secure tags (NTAG 424 DNA, DESFire) whose issuer restricted access. The Diagnose tab can tell which.',
  classicNeedsNxpPhone: `This is a MIFARE Classic card, and this phone’s NFC chip can’t talk to it. Write it on an Android phone with an NXP NFC chip instead. It will only ever work on phones like that: iPhones and many Android phones can’t read MIFARE Classic. ${REPLACE}`,
  classicKeys: `This MIFARE Classic card uses its issuer’s own sector keys, so no phone can format or write it without them. ${REPLACE}`,
  desfireNeedsAndroid:
    'This is a blank MIFARE DESFire card, and iPhones can’t format DESFire. Write anything to it once with this app on an Android phone, which formats it. After that this iPhone can read and write it too.',
  desfireEv0: `This is an original MIFARE DESFire (EV0), which can’t be formatted here. DESFire EV1 and newer can. ${REPLACE}`,
  felica: `This FeliCa tag isn’t formatted for NDEF, and phones can’t format FeliCa. Use FeliCa Lite-S tags sold as “NDEF formatted”, or format it with a FeliCa reader on a computer. ${REPLACE}`,
  type2Unreadable: `The tag isn’t formatted for NDEF and didn’t answer a standard memory read. It’s either password-protected or a MIFARE Plus card, which phones can’t format. The Diagnose tab can tell which. ${REPLACE}`,
  other: `This tag isn’t formatted for NDEF, and it’s not a type this app can format. The Diagnose tab can identify it. ${REPLACE}`,
};

const tooMuch = (bytes: number, capacity: number) => new Error(`Too much data: ${bytes} bytes, but this tag holds ${capacity}.`);
const lostTouch = () => new Error('The tag stopped responding. Hold it still against the phone and try again.');

/* Entry point ------------------------------------------------------ */

export async function writeWithoutNdef(tech: NfcTech | null, message: Bytes): Promise<WriteResult> {
  const tag: TagEvent = (await NfcManager.getTag({ readNdef: false }).catch(() => null)) ?? {};
  switch (tagKind(tech, tag)) {
    case 'type2':
      return writeType2(message, tag.id ?? '');
    case 'iso15693':
      return writeType5(message);
    case 'isodep':
      // iOS only sees ISO-DEP cards that already have the NFC application, so there's nothing to format.
      if (Platform.OS === 'android' && tech === NfcTech.IsoDep) return writeDesfire(message);
      throw new Error(NO_NDEF.smartcard);
    case 'classic':
      throw new Error(hasTech(tag, 'MifareClassic') ? NO_NDEF.classicKeys : NO_NDEF.classicNeedsNxpPhone);
    case 'felica':
      throw new Error(NO_NDEF.felica);
    default:
      throw new Error(NO_NDEF.other);
  }
}

/* NFC Forum Type 2: NTAG21x / MIFARE Ultralight --------------------- */

/** WRITE one 4-byte page. The chip answers a 4-bit ACK (0xA); some stacks pass back nothing. */
async function writePage(page: number, data: Bytes): Promise<boolean> {
  const response = await transceiveNfcA([0xa2, page, ...data]);
  return response !== null && (response.length === 0 || (response[0] & 0x0f) === 0x0a);
}

/** Reads back `expected` starting at `page`; READ returns four pages at a time. */
async function verifyPages(page: number, expected: Bytes): Promise<boolean> {
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

/**
 * Writes an NDEF message straight into NTAG/Ultralight memory: the NDEF TLV from page 4
 * and, on a factory-blank chip, the capability container in page 3, which is written last
 * so an interrupted write leaves the tag blank rather than half-formatted.
 */
export async function writeType2(message: Bytes, uid: string): Promise<WriteResult> {
  const header = await transceiveNfcA([0x30, 0x00]);
  if (!header || header.length < 16) {
    // A DESFire or MIFARE Plus card (iOS reports them as "mifare") answers GetVersion with AF, vendor, type.
    const version = await transceiveNfcA([0x60]);
    if (version && version[0] === 0xaf && version[1] === 0x04 && version[2] === 0x01) throw new Error(NO_NDEF.desfireNeedsAndroid);
    throw new Error(NO_NDEF.type2Unreadable);
  }

  const layout = type2Layout(header);
  if (layout.state === 'readOnly') throw new Error('This tag is locked (read-only).');
  if (layout.state === 'foreign') {
    throw new Error(
      `This tag’s setup area holds non-NDEF data (${hex(layout.cc)}), like a game figure or a proprietary tag. That area can only be written once, so it can’t be formatted. ${REPLACE}`,
    );
  }

  let dataArea: number;
  let cc: Bytes | null = null;
  if (layout.state === 'formatted') {
    dataArea = layout.dataArea;
  } else {
    let version: Bytes | null = null;
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

  const tlv = ndefTlv(message, dataArea);
  const capacity = ndefTlvCapacity(dataArea);
  if (!tlv) throw tooMuch(message.length, capacity);

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

/* NFC Forum Type 5: ISO 15693 (ICODE…) ------------------------------ */

const ok15693 = (response: Bytes | null): response is Bytes => response !== null && response.length > 0 && (response[0] & 0x01) === 0;

async function readBlock(block: number, blockSize: number): Promise<Bytes | null> {
  const response = await transceiveNfcV([ISO15693_FLAGS, 0x20, block]);
  return ok15693(response) && response.length > blockSize ? response.slice(1, 1 + blockSize) : null;
}

/** WRITE SINGLE BLOCK; TI Tag-it chips only accept writes with the option flag (0x40) set. */
async function writeBlock(block: number, data: Bytes): Promise<boolean> {
  if (ok15693(await transceiveNfcV([ISO15693_FLAGS, 0x21, block, ...data]))) return true;
  return ok15693(await transceiveNfcV([ISO15693_FLAGS | 0x40, 0x21, block, ...data]));
}

/** Get Multiple Block Security Status: true when any of blocks 0…count-1 is locked. Unknown counts as unlocked. */
async function anyBlockLocked(count: number): Promise<boolean> {
  const response = await transceiveNfcV([ISO15693_FLAGS, 0x2c, 0x00, count - 1]);
  if (!ok15693(response)) return false;
  return response.slice(1, 1 + count).some((status) => status & 0x01);
}

/**
 * Writes an NDEF message into ISO 15693 memory: the capability container and NDEF TLV
 * from block 0, data blocks first and block 0 last, each read back. Refuses tags whose
 * block 0 holds anything but zeros or an NDEF container.
 */
async function writeType5(message: Bytes): Promise<WriteResult> {
  const info = parseSystemInfo(await transceiveNfcV([ISO15693_FLAGS, 0x2b]));
  if (!info || ![4, 8, 16, 32].includes(info.blockSize)) {
    throw new Error(`This ISO 15693 tag didn’t report its memory layout, so it can’t be formatted safely. ${REPLACE}`);
  }
  const { blockSize } = info;
  const blockCount = Math.min(info.blockCount, 256); // single-byte block numbers

  const block0 = await readBlock(0, blockSize);
  if (!block0) throw new Error(`The tag didn’t answer a memory read. ${PASSWORD_HINT}`);

  const layout = type5Layout(block0, blockSize * blockCount);
  if (layout.state === 'readOnly') throw new Error('This tag is locked (read-only).');
  if (layout.state === 'foreign') {
    throw new Error(
      `This tag already holds other data (it starts ${hex(layout.cc)}), like a library, shipping or ticket label. Formatting it would erase that, so it’s left alone. ${REPLACE}`,
    );
  }

  const { cc, dataArea } = layout.state === 'blank' ? type5BlankFormat(blockSize, blockCount) : { cc: block0.slice(0, 4), dataArea: layout.dataArea };
  const tlv = ndefTlv(message, dataArea);
  const capacity = ndefTlvCapacity(dataArea);
  if (!tlv) throw tooMuch(message.length, capacity);

  const image = [...cc, ...tlv];
  while (image.length % blockSize) image.push(0x00);
  const blocks = image.length / blockSize;
  if (await anyBlockLocked(blocks)) throw new Error('This tag is locked (read-only).');

  const writeAndCheck = async (block: number) => {
    const data = image.slice(block * blockSize, (block + 1) * blockSize);
    if (!(await writeBlock(block, data))) throw new Error(`The tag refused the write. ${PASSWORD_HINT}`);
    const back = await readBlock(block, blockSize);
    if (!back || data.some((b, i) => back[i] !== b)) throw new Error('The tag didn’t keep the data. Hold it still and try again.');
  };
  for (let block = 1; block < blocks; block++) await writeAndCheck(block);
  await writeAndCheck(0);

  return { bytes: message.length, capacity, formatted: layout.state === 'blank' };
}

/* MIFARE DESFire EV1+ (Android) ------------------------------------- */

const swHex = (sw: number) => hex([sw >> 8, sw & 0xff]);

/**
 * Adds an NFC Forum Type 4 application to a DESFire EV1 or newer, with the same commands
 * Android's NFC stack uses, then writes the message with standard ISO commands. Each step
 * accepts "already exists", so a format that was interrupted finishes on the next tap.
 */
async function writeDesfire(message: Bytes): Promise<WriteResult> {
  await apdu(DESFIRE.selectPicc);
  const hardware = await apdu(APDU.getVersion);
  const software = hardware.sw === SW.MORE ? await apdu(APDU.additionalFrame) : null;
  if (!software || software.sw !== SW.MORE) throw new Error(NO_NDEF.smartcard);
  await apdu(APDU.additionalFrame); // third frame (UID, batch) ends the exchange

  const plannedSize = desfireNdefFileSize(hardware.data, software.data);
  if (plannedSize === null) throw new Error(hardware.data[1] === 0x01 && software.data[3] === 0x00 ? NO_NDEF.desfireEv0 : NO_NDEF.smartcard);

  const step = (sw: number, what: string, allowDuplicate = true) => {
    if (sw === SW.DESFIRE_OK || (allowDuplicate && sw === SW.DUPLICATE)) return;
    if (sw === SW.AUTH_ERROR || sw === SW.PERMISSION_DENIED) {
      throw new Error(`This DESFire card’s issuer locked it with a master key, so a new NFC data area can’t be added. ${REPLACE}`);
    }
    if (sw === SW.OUT_OF_MEMORY) throw new Error(`This DESFire card is full, so there’s no room for an NFC data area. ${REPLACE}`);
    if (sw === 0) throw lostTouch();
    throw new Error(`The card refused to ${what} (status ${swHex(sw)}).`);
  };

  step((await apdu(DESFIRE.createNdefApp)).sw, 'create its NFC application');
  step((await apdu(DESFIRE.selectNdefApp)).sw, 'open its NFC application', false);

  const ccFile = (await apdu(DESFIRE.createCcFile)).sw;
  step(ccFile, 'create its NFC setup file');

  let size = plannedSize;
  let ndefFile = (await apdu(DESFIRE.createNdefFile(size))).sw;
  if (ndefFile === SW.OUT_OF_MEMORY) {
    size = plannedSize / 2;
    ndefFile = (await apdu(DESFIRE.createNdefFile(size))).sw;
  }
  step(ndefFile, 'create its NFC data file');
  if (ndefFile === SW.DUPLICATE) {
    // Left by an earlier attempt: use the size it actually has.
    const settings = await apdu(APDU.getNdefFileSettings);
    if (settings.sw !== SW.DESFIRE_OK || settings.data.length < 7) throw new Error(NO_NDEF.smartcard);
    size = settings.data[4] | (settings.data[5] << 8) | (settings.data[6] << 16);
  }

  // Never overwrite a capability container that's already there.
  const existing = ccFile === SW.DUPLICATE ? await apdu(DESFIRE.readCc) : null;
  if (!existing || existing.sw !== SW.DESFIRE_OK || existing.data[0] !== 0x00 || existing.data[1] !== 0x0f) {
    step((await apdu(DESFIRE.writeCc(size))).sw, 'save its NFC setup', false);
  }

  return writeType4Ndef(message, size, true);
}

/** Standard Type 4 NDEF update: select the NDEF file, write the message after NLEN, then NLEN last. */
async function writeType4Ndef(message: Bytes, fileSize: number, formatted: boolean): Promise<WriteResult> {
  const capacity = Math.min(fileSize, 0xffff) - 2;
  if (message.length > capacity) throw tooMuch(message.length, capacity);
  if ((await apdu(APDU.selectNdefApp)).sw !== SW.OK || (await apdu(APDU.selectNdefFile)).sw !== SW.OK) {
    throw new Error('The card’s NFC data area didn’t open. Write again to finish.');
  }
  const update = async (offset: number, data: Bytes) => {
    const { sw } = await apdu([0x00, 0xd6, offset >> 8, offset & 0xff, data.length, ...data]);
    if (sw === 0) throw lostTouch();
    if (sw !== SW.OK) throw new Error(`The card refused the write (status ${swHex(sw)}).`);
  };
  // 52 bytes per command: the MLc the capability container declares.
  for (let i = 0; i < message.length; i += 52) await update(2 + i, message.slice(i, i + 52));
  await update(0, [message.length >> 8, message.length & 0xff]);
  return { bytes: message.length, capacity, formatted };
}
