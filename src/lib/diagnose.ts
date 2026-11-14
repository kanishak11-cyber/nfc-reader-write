import { getRandomBytes } from 'expo-crypto';
import { Platform } from 'react-native';
import NfcManager, { NfcTech, type TagEvent } from 'react-native-nfc-manager';

import {
  analyzeClassic,
  analyzeGeneric,
  analyzeType2,
  analyzeType4,
  APDU,
  authPart2Payload,
  authPart2Verify,
  FACTORY_KEY,
  identifyType2,
  splitResponse,
  SW,
  type2ConfigPage,
  type Bytes,
  type Diagnosis,
} from './chips';
import { formatUid } from './ndef';
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
  ios: [NfcTech.MifareIOS, NfcTech.IsoDep, NfcTech.Iso15693IOS],
  default: [NfcTech.IsoDep, NfcTech.NfcA, NfcTech.NfcV, NfcTech.NfcB, NfcTech.NfcF],
});

const CLASSIC_SAKS = new Set([0x08, 0x09, 0x18, 0x19, 0x28, 0x38, 0x88]);

const PROMPT = 'Hold the top of your iPhone near the tag and keep it still.';

/* Transport ------------------------------------------------------- */

/** Raw NFC-A (Type 2) command; resolves null when the chip NAKs or doesn't answer. */
async function nfcA(command: Bytes): Promise<Bytes | null> {
  try {
    const response = await NfcManager.nfcAHandler.transceive(command);
    return response.map((b) => b & 0xff);
  } catch {
    return null;
  }
}

async function apdu(command: Bytes): Promise<{ data: Bytes; sw: number }> {
  try {
    return splitResponse(await NfcManager.isoDepHandler.transceive(command));
  } catch {
    return { data: [], sw: 0 };
  }
}

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
          formattable: tag.techTypes?.some((t) => t.endsWith('NdefFormatable')) ?? false,
          ndefWritable: tag.isWritable ?? null,
        });
        break;
      case 'nfcv':
        diagnosis = analyzeGeneric('ISO 15693 (NFC-V) tag', tag.isWritable ?? null);
        break;
      default:
        diagnosis = analyzeGeneric(tech ? `${tech} tag` : 'Unknown tag', tag.isWritable ?? null);
    }

    return { ...diagnosis, uid: formatUid(tag.id), scannedAt: Date.now() };
  });
}

function classify(tech: NfcTech | null, tag: TagEvent): 'type2' | 'type4' | 'classic' | 'nfcv' | 'other' {
  if (Platform.OS === 'ios') {
    if (tag.tech === 'IsoDep') return 'type4';
    if (tag.tech === 'mifare') return 'type2';
    if (tag.tech === 'iso15693') return 'nfcv';
    return 'other';
  }
  if (tech === NfcTech.IsoDep) return 'type4';
  if (tech === NfcTech.NfcV) return 'nfcv';
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
  if (!header) return analyzeType2({ header: null, version: null, config: null, configBlocked: false });

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
      const first = await apdu(APDU.authenticateEv2First(keyNo));
      if (first.sw !== SW.MORE || first.data.length !== 16) {
        results.push({ keyNo, isFactory: false });
        continue;
      }
      const rndA = Array.from(getRandomBytes(16));
      const second = await apdu(APDU.authenticatePart2(authPart2Payload(FACTORY_KEY, first.data, rndA)));
      results.push({ keyNo, isFactory: second.sw === SW.DESFIRE_OK && authPart2Verify(FACTORY_KEY, second.data, rndA) });
    }
    return { uid: formatUid(tag.id), results };
  });
}
