/**
 * Securing NTAG 424 DNA cards without a server: the card's key 0 is replaced by an
 * AES-128 key derived from a passphrase and the card's UID, and the NDEF file is set to
 * "anyone reads, only key 0 writes". Nothing is stored; the key is rebuilt from the
 * passphrase each time. SUN/SDM stays off, since it needs a server to mean anything.
 */
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import NfcManager, { NfcTech, type NdefRecord, type TagEvent } from 'react-native-nfc-manager';

import {
  APDU,
  cardKey,
  changeKey0Data,
  FACTORY_KEY,
  fullModeCommand,
  hex,
  NDEF_FILE_FACTORY_SETTINGS,
  NDEF_FILE_SECURED_SETTINGS,
  SW,
  type Bytes,
  type SecureSession,
} from './chips';
import { authenticateEv2, classify } from './diagnose';
import { apdu } from './format';
import { encodeMessage, formatUid } from './ndef';
import { withSession, type WriteResult } from './nfc';

const PROMPT = 'Hold the top of your iPhone near the card and keep it still.';
const NDEF_FILE_SIZE = 256;
const STRETCH_ROUNDS = 2000;

export const MIN_PASSPHRASE = 8;

const WRONG_PASSPHRASE =
  'The card rejected that passphrase. Either it’s wrong, or the card was secured by someone else. Move the card away before trying again.';

/** Slow part of the key derivation, done before the scan starts: repeated SHA-256 of the passphrase. */
async function stretch(passphrase: string): Promise<Bytes> {
  const secret = new TextEncoder().encode(passphrase.normalize('NFKC'));
  let state = new Uint8Array(32);
  for (let round = 0; round < STRETCH_ROUNDS; round++) {
    const input = new Uint8Array(state.length + secret.length);
    input.set(state);
    input.set(secret, state.length);
    state = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, input));
  }
  return Array.from(state);
}

/** Opens the card's NDEF application and returns its UID. */
async function openCard(tech: NfcTech | null): Promise<{ uid: string; uidBytes: Bytes }> {
  const tag: TagEvent = (await NfcManager.getTag({ readNdef: false })) ?? {};
  if (classify(tech, tag) !== 'type4') throw new Error('That isn’t an NTAG 424 DNA card.');
  const version = await apdu(APDU.getVersion);
  if (version.sw !== SW.MORE || version.data[1] !== 0x04) throw new Error('That isn’t an NTAG 424 DNA card.');
  await apdu(APDU.additionalFrame);
  await apdu(APDU.additionalFrame);
  if ((await apdu(APDU.selectNdefApp)).sw !== SW.OK) throw new Error('Couldn’t open the card’s NDEF application.');
  const uidBytes = (tag.id ?? '').match(/[0-9a-f]{2}/gi)?.map((b) => parseInt(b, 16)) ?? [];
  if (uidBytes.length !== 7) throw new Error('This card hides its serial number (random ID), so a passphrase key can’t be tied to it.');
  return { uid: formatUid(tag.id), uidBytes };
}

/** Sends one encrypted, signed command and advances the session's command counter. */
async function secureCommand(session: SecureSession, cmd: number, header: Bytes, data: Bytes, what: string): Promise<void> {
  const { sw } = await apdu(fullModeCommand(session, cmd, header, data));
  session.ctr += 1;
  if (sw !== SW.DESFIRE_OK) throw new Error(`The card refused to ${what} (status ${hex([sw >> 8, sw & 0xff])}).`);
}

export interface SecureResult {
  uid: string;
  /** The card's new AES key, for use with other tools. Empty after unsecuring. */
  key: string;
}

/**
 * Secures a card that still has the factory key 0. Permissions change first and the key
 * last: if it's interrupted in between, the card still has the factory key and the
 * Diagnose tab's Reset undoes it.
 */
export async function secureCard(passphrase: string): Promise<SecureResult> {
  const stretched = await stretch(passphrase);
  return withSession(NfcTech.IsoDep, PROMPT, 'Card secured', async (tech) => {
    const { uid, uidBytes } = await openCard(tech);

    const settings = await apdu(APDU.getNdefFileSettings);
    if (settings.sw === SW.DESFIRE_OK && settings.data.length >= 4 && (settings.data[2] & 0x0f) !== 0) {
      throw new Error('This card’s permissions are controlled by a different key. Reset it in the Diagnose tab first.');
    }

    const session = await authenticateEv2(0);
    if (!session) {
      throw new Error('This card doesn’t use the factory key any more. It’s either already secured or locked by its issuer. Only blank or reset cards can be secured.');
    }
    const key = cardKey(stretched, uidBytes);
    await secureCommand(session, 0x5f, [0x02], NDEF_FILE_SECURED_SETTINGS, 'change its permissions');
    await secureCommand(session, 0xc4, [0x00], changeKey0Data(key, 0x01), 'take the new key');

    // Changing key 0 ends the session; signing in again proves the new key is in place.
    if (!(await authenticateEv2(0, key))) throw new Error('The card took the key but didn’t verify. Try “Remove lock” with the same passphrase.');
    return { uid, key: hex(key, '') };
  });
}

/** Puts the factory key and open permissions back. */
export async function unsecureCard(passphrase: string): Promise<SecureResult> {
  const stretched = await stretch(passphrase);
  return withSession(NfcTech.IsoDep, PROMPT, 'Lock removed', async (tech) => {
    const { uid, uidBytes } = await openCard(tech);
    const session = await authenticateEv2(0, cardKey(stretched, uidBytes));
    if (!session) throw new Error(WRONG_PASSPHRASE);
    await secureCommand(session, 0x5f, [0x02], NDEF_FILE_FACTORY_SETTINGS, 'change its permissions');
    await secureCommand(session, 0xc4, [0x00], changeKey0Data(FACTORY_KEY, 0x00), 'restore the factory key');
    return { uid, key: '' };
  });
}

/** Native WriteData to the NDEF file. The file's communication mode is plain, so once signed in no MAC is needed. */
async function writeData(offset: number, data: Bytes): Promise<void> {
  const body = [0x02, offset & 0xff, offset >> 8, 0x00, data.length, 0x00, 0x00, ...data];
  const { sw } = await apdu([0x90, 0x8d, 0x00, 0x00, body.length, ...body, 0x00]);
  if (sw === 0) throw new Error('The card stopped responding. Hold it still against the phone and try again.');
  if (sw !== SW.DESFIRE_OK) throw new Error(`The card refused the write (status ${hex([sw >> 8, sw & 0xff])}).`);
}

/** Writes an NDEF message to a secured card: sign in with the passphrase key, message first, length last. */
export async function writeSecuredCard(records: NdefRecord[], passphrase: string, successMessage = 'Written to card'): Promise<WriteResult> {
  const message = encodeMessage(records);
  const capacity = NDEF_FILE_SIZE - 2;
  if (message.length > capacity) throw new Error(`Too much data: ${message.length} bytes, but this card holds ${capacity}.`);
  const stretched = await stretch(passphrase);
  return withSession(NfcTech.IsoDep, PROMPT, successMessage, async (tech) => {
    const { uidBytes } = await openCard(tech);
    if (!(await authenticateEv2(0, cardKey(stretched, uidBytes)))) {
      throw new Error(`${WRONG_PASSPHRASE} To write a card that isn’t secured, clear the passphrase field.`);
    }
    for (let i = 0; i < message.length; i += 40) await writeData(2 + i, message.slice(i, i + 40));
    await writeData(0, [message.length >> 8, message.length & 0xff]);
    return { bytes: message.length, capacity, formatted: false };
  });
}
