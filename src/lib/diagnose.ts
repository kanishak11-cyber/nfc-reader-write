import { getRandomBytes } from 'expo-crypto';
import { Platform } from 'react-native';
import NfcManager, { NdefStatus, NfcTech, type TagEvent } from 'react-native-nfc-manager';

import {
  analyzeClassic,
  analyzeGeneric,
  analyzeNdefTag,
  analyzeType2,
  analyzeType4,
  APDU,
  authPart2Payload,
  CLASSIC_SAKS,
  authPart2Result,
  decryptRndB,
  deriveSessionKeys,
  FACTORY_KEY,
  felicaChipName,
  fullModeCommand,
  hex,
  identifyType2,
  iso15693ChipName,
  NDEF_FILE_FACTORY_SETTINGS,
  responseMacValid,
  SW,
  type2ConfigPage,
  type Bytes,
  type Diagnosis,
  type NdefState,
  type SecureSession,
} from './chips';
import { formatUid } from './ndef';
import { apdu, transceiveNfcA as nfcA } from './format';
import { withSession } from './nfc';

export type { Diagnosis } from './chips';

export interface DiagnosisResult extends Diagnosis {
  uid: string;
  scannedAt: number;
}

/**
 * IsoDep comes first on Android so smart cards (NTAG 424 DNA, DESFire) connect over
 * ISO-DEP; Type 2 and MIFARE Classic fall through to NfcA. iOS opens a tag-reader
 * session that reports the family itself.
 */
const TECHS = Platform.select({
  ios: [NfcTech.MifareIOS, NfcTech.IsoDep, NfcTech.Iso15693IOS, NfcTech.FelicaIOS],
  default: [NfcTech.IsoDep, NfcTech.NfcA, NfcTech.NfcV, NfcTech.NfcB, NfcTech.NfcF],
});

const PROMPT = 'Hold the top of your iPhone near the tag and keep it still.';

/* Diagnose -------------------------------------------------------- */

export function diagnoseTag(): Promise<DiagnosisResult> {
  return withSession(TECHS, PROMPT, 'Check complete', async (tech) => {
    // readNdef:false keeps iOS from doing NDEF I/O before our raw commands.
    const tag: TagEvent = (await NfcManager.getTag({ readNdef: false })) ?? {};
    const family = classify(tech, tag);

    let diagnosis: Diagnosis;
    switch (family) {
      case 'type4':
        diagnosis = await diagnoseType4();
        break;
      case 'type2':
        diagnosis = await diagnoseType2();
        break;
      case 'classic':
        diagnosis = analyzeClassic({
          // Only phones with an NXP NFC chip list MifareClassic; others can't talk to these cards at all.
          phoneSupported: tag.techTypes?.some((t) => t.endsWith('MifareClassic')) ?? false,
          formattable: tag.techTypes?.some((t) => t.endsWith('NdefFormatable')) ?? false,
          ndefWritable: tag.isWritable ?? null,
        });
        break;
      case 'nfcv':
        diagnosis = analyzeNdefTag('iso15693', iso15693ChipName(tag.id), ...(await ndefState()));
        break;
      case 'felica':
        diagnosis = analyzeNdefTag('felica', felicaChipName(tag.systemCode), ...(await ndefState()));
        break;
      default:
        diagnosis = analyzeGeneric(tech ? `${tech} tag` : 'Unknown tag', tag.isWritable ?? null);
    }

    return { ...diagnosis, uid: formatUid(tag.id ?? tag.idm), scannedAt: Date.now() };
  });
}

/** What the phone's NDEF layer says about the tag, and its capacity. */
async function ndefState(): Promise<[NdefState, number | null]> {
  const status = await NfcManager.ndefHandler.getNdefStatus().catch(() => null);
  if (!status) return [null, null];
  if (status.status === NdefStatus.NotSupported) return ['none', null];
  return [status.status === NdefStatus.ReadWrite ? 'writable' : 'readOnly', status.capacity || null];
}

export function classify(tech: NfcTech | null, tag: TagEvent): 'type2' | 'type4' | 'classic' | 'nfcv' | 'felica' | 'other' {
  if (Platform.OS === 'ios') {
    if (tag.tech === 'IsoDep') return 'type4';
    if (tag.tech === 'mifare') return 'type2';
    if (tag.tech === 'iso15693') return 'nfcv';
    if (tag.tech === 'felica') return 'felica';
    return 'other';
  }
  if (tech === NfcTech.IsoDep) return 'type4';
  if (tech === NfcTech.NfcV) return 'nfcv';
  if (tech === NfcTech.NfcF) return 'felica';
  if (tech === NfcTech.NfcA) {
    const isClassic =
      tag.techTypes?.some((t) => t.endsWith('MifareClassic')) || (tag.sak != null && CLASSIC_SAKS.has(tag.sak));
    return isClassic ? 'classic' : 'type2';
  }
  return 'other';
}

/**
 * Order matters: a NAK halts a Type 2 chip until it's re-selected, so the commands that
 * may be refused (GET_VERSION on old chips, protected config pages) go last.
 */
async function diagnoseType2(): Promise<Diagnosis> {
  const header = await nfcA([0x30, 0x00]);
  if (!header) {
    // iOS reports DESFire and MIFARE Plus as "mifare" too. Their GetVersion reply is AF + hardware info.
    const native = await nfcA([0x60]);
    if (native && native[0] === 0xaf && native.length >= 8) {
      return analyzeType4({ ndefApp: false, cc: null, version: native.slice(1, 8), fileSettings: null, fileSettingsSw: null });
    }
    return analyzeType2({ header: null, version: null, config: null, configBlocked: false });
  }

  const version = await nfcA([0x60]);
  const chip = identifyType2(version);
  const page = chip ? type2ConfigPage(chip) : null;

  let config: Bytes | null = null;
  let configBlocked = false;
  if (page !== null) {
    config = await nfcA([0x30, page]);
    configBlocked = config === null;
  }
  return analyzeType2({ header, version: version && version.length >= 8 ? version : null, config, configBlocked });
}

async function diagnoseType4(): Promise<Diagnosis> {
  const select = await apdu(APDU.selectNdefApp);
  const ndefApp = select.sw === SW.OK;

  let cc: Bytes | null = null;
  if (ndefApp && (await apdu(APDU.selectCcFile)).sw === SW.OK) {
    const read = await apdu(APDU.readCc);
    if (read.sw === SW.OK) cc = read.data;
  }

  // Native GetVersion answers in three frames; drain them so the chip is ready for the next command.
  let version: Bytes | null = null;
  const v1 = await apdu(APDU.getVersion);
  if (v1.sw === SW.MORE) {
    version = v1.data;
    const v2 = await apdu(APDU.additionalFrame);
    if (v2.sw === SW.MORE) await apdu(APDU.additionalFrame);
  }

  let fileSettings: Bytes | null = null;
  let fileSettingsSw: number | null = null;
  if (ndefApp && version?.[1] === 0x04) {
    // GetVersion runs at card level; re-select the NDEF application before asking about its files.
    await apdu(APDU.selectNdefApp);
    const fs = await apdu(APDU.getNdefFileSettings);
    fileSettingsSw = fs.sw;
    if (fs.sw === SW.DESFIRE_OK) fileSettings = fs.data;
  }

  return analyzeType4({ ndefApp, cc, version, fileSettings, fileSettingsSw });
}

/* Factory key test (NTAG 424 DNA) ---------------------------------- */

export interface KeyTestResult {
  uid: string;
  results: { keyNo: number; isFactory: boolean }[];
}

/**
 * Tries NXP's factory default key (16 zero bytes) once per key number with
 * AuthenticateEV2First. A wrong key only costs one entry in the chip's failed-attempt
 * counter; nothing is written.
 */
export function testFactoryKeys(keyNos: number[]): Promise<KeyTestResult> {
  return withSession(TECHS, PROMPT, 'Check complete', async (tech) => {
    const tag: TagEvent = (await NfcManager.getTag({ readNdef: false })) ?? {};
    if (classify(tech, tag) !== 'type4') throw new Error('That isn’t an NTAG 424 DNA card. Hold the same card you diagnosed.');
    if ((await apdu(APDU.selectNdefApp)).sw !== SW.OK) throw new Error('Couldn’t open the card’s NDEF application.');

    const results: KeyTestResult['results'] = [];
    for (const keyNo of keyNos) {
      results.push({ keyNo, isFactory: (await authenticateEv2(keyNo)) !== null });
    }
    return { uid: formatUid(tag.id), results };
  });
}

/** AuthenticateEV2First. Returns a secure session, or null if the card rejected the key. */
export async function authenticateEv2(keyNo: number, key: Bytes = FACTORY_KEY): Promise<SecureSession | null> {
  const first = await apdu(APDU.authenticateEv2First(keyNo));
  if (first.sw !== SW.MORE || first.data.length !== 16) return null;
  const rndB = decryptRndB(key, first.data);
  const rndA = Array.from(getRandomBytes(16));
  const second = await apdu(APDU.authenticatePart2(authPart2Payload(key, rndB, rndA)));
  if (second.sw !== SW.DESFIRE_OK) return null;
  const { ok, ti } = authPart2Result(key, second.data, rndA);
  if (!ok) return null;
  return { ...deriveSessionKeys(key, rndA, rndB), ti, ctr: 0 };
}

/* Reset (NTAG 424 DNA with a factory change key) -------------------- */

export interface ResetResult {
  uid: string;
  /** The old link was overwritten with an empty NDEF message. */
  cleared: boolean;
  /** The card's response MAC checked out (it applied the change either way when the status was OK). */
  verified: boolean;
}

/** UPDATE BINARY at offset 0: NLEN = 3, then an empty NDEF record (D0 00 00). */
const ISO_WRITE_EMPTY_NDEF = [0x00, 0xd6, 0x00, 0x00, 0x05, 0x00, 0x03, 0xd0, 0x00, 0x00];

/**
 * Restores the NDEF file of an NTAG 424 DNA card to factory settings: plain
 * communication, SUN/SDM off, read & write by anyone, permissions changeable with
 * key 0. Needs the key that guards "change" to still be the factory key. Then
 * overwrites the old link with an empty NDEF message. Keys are not changed.
 */
export function resetNtag424(expectedUid: string): Promise<ResetResult> {
  return withSession(TECHS, PROMPT, 'Card reset', async (tech) => {
    const tag: TagEvent = (await NfcManager.getTag({ readNdef: false })) ?? {};
    const uid = formatUid(tag.id);
    if (classify(tech, tag) !== 'type4') throw new Error('That isn’t an NTAG 424 DNA card.');
    if (expectedUid && uid && uid !== expectedUid) {
      throw new Error(`That’s a different card (${uid}). Diagnose it first, then reset it.`);
    }
    if ((await apdu(APDU.selectNdefApp)).sw !== SW.OK) throw new Error('Couldn’t open the card’s NDEF application.');

    // Re-read the permissions to find which key may change them.
    const settings = await apdu(APDU.getNdefFileSettings);
    let changeKey = 0;
    if (settings.sw === SW.DESFIRE_OK && settings.data.length >= 4) {
      changeKey = settings.data[2] & 0x0f;
      if (changeKey === 0xf) throw new Error('This card’s permissions are locked forever, so it can’t be reset.');
      if (changeKey === 0xe) throw new Error('This card allows free permission changes, which this reset doesn’t handle.');
    }

    const session = await authenticateEv2(changeKey);
    if (!session) throw new Error(`Key ${changeKey} isn’t the factory key, so this card can’t be reset.`);

    const change = await apdu(fullModeCommand(session, 0x5f, [0x02], NDEF_FILE_FACTORY_SETTINGS));
    session.ctr += 1;
    if (change.sw !== SW.DESFIRE_OK) {
      throw new Error(`The card refused the reset (status ${hex([change.sw >> 8, change.sw & 0xff])}). Nothing was changed.`);
    }
    const verified = responseMacValid(session, 0x00, change.data);

    // Writing is free now, so plain ISO commands can clear the old link.
    let cleared = false;
    if ((await apdu(APDU.selectNdefFile)).sw === SW.OK) {
      cleared = (await apdu(ISO_WRITE_EMPTY_NDEF)).sw === SW.OK;
    }
    return { uid, cleared, verified };
  });
}
