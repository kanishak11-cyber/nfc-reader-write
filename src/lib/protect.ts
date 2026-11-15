/**
 * Password protection for NTAG21x and MIFARE Ultralight EV1 tags: set a password,
 * remove it, and write to a tag that has one. The password is the chip's own 32-bit
 * PWD, so other NFC apps that know it can use the tag too.
 */
import { Platform } from 'react-native';
import NfcManager, { NfcTech, type NdefRecord, type TagEvent } from 'react-native-nfc-manager';

import { identifyType2, type2ConfigPages, type2Protection, type Bytes } from './chips';
import { transceiveNfcA, writeType2 } from './format';
import { encodeMessage } from './ndef';
import { withSession, type WriteResult } from './nfc';

const TECHS = Platform.OS === 'ios' ? NfcTech.MifareIOS : NfcTech.NfcA;
const PROMPT = 'Hold the top of your iPhone near the tag and keep it still.';

const UNSUPPORTED =
  'This tag can’t hold a password. Passwords work on NTAG210, 212, 213, 215 and 216 and on MIFARE Ultralight EV1.';
const WRONG_PASSWORD =
  'The tag rejected that password, or it has no password at all. Move the tag away before trying again.';

/** GET_VERSION never needs the password and is never refused by chips that support one. */
async function identify() {
  const chip = identifyType2(await transceiveNfcA([0x60]));
  if (!chip || chip.cfg0 === undefined) throw new Error(UNSUPPORTED);
  return { ...chip, cfg0: chip.cfg0 };
}

/** PWD_AUTH: the chip answers its 2-byte PACK when the password is right, and refuses otherwise. */
async function authenticate(password: Bytes): Promise<boolean> {
  const pack = await transceiveNfcA([0x1b, ...password]);
  return pack !== null && pack.length === 2;
}

async function writePage(page: number, data: Bytes, what: string): Promise<void> {
  const response = await transceiveNfcA([0xa2, page, ...data]);
  if (response === null || (response.length > 0 && (response[0] & 0x0f) !== 0x0a)) {
    throw new Error(`The tag refused to save ${what}. Hold it still and try again.`);
  }
}

async function readConfig(cfg0: number): Promise<Bytes | null> {
  const config = await transceiveNfcA([0x30, cfg0]);
  return config && config.length >= 16 ? config : null;
}

export interface ProtectResult {
  chip: string;
  readProtected: boolean;
}

/**
 * Sets a password. The password and PACK go in first and the page that switches
 * protection on goes last, so an interrupted attempt leaves the tag open.
 */
export function setTagPassword(password: Bytes, readProtect: boolean): Promise<ProtectResult> {
  return withSession(TECHS, PROMPT, 'Tag locked', async () => {
    const chip = await identify();
    const config = await readConfig(chip.cfg0);
    if (!config) throw new Error('This tag already has a password that hides its settings. Remove that password first.');

    const current = type2Protection(chip, config);
    if (current.active) throw new Error('This tag already has a password. Remove it first, then set a new one.');
    if (current.configLocked) throw new Error('This tag’s settings are permanently locked, so a password can’t be added.');

    const { cfg0, cfg1 } = type2ConfigPages(config, { readProtect });
    await writePage(chip.cfg0 + 2, password, 'the password');
    await writePage(chip.cfg0 + 3, [0x00, 0x00, 0x00, 0x00], 'the password');
    await writePage(chip.cfg0 + 1, cfg1, 'its settings');
    await writePage(chip.cfg0, cfg0, 'its settings');

    if (!(await authenticate(password))) throw new Error('The password was set but didn’t verify. Try removing it with the same password.');
    return { chip: chip.name, readProtected: readProtect };
  });
}

/** Signs in with the password, switches protection off and puts the factory password back. */
export function removeTagPassword(password: Bytes): Promise<ProtectResult> {
  return withSession(TECHS, PROMPT, 'Password removed', async () => {
    const chip = await identify();
    if (!(await authenticate(password))) throw new Error(WRONG_PASSWORD);

    const config = await readConfig(chip.cfg0);
    if (!config) throw new Error('The tag stopped responding. Hold it still against the phone and try again.');
    if (type2Protection(chip, config).configLocked) {
      throw new Error('This tag’s settings are permanently locked, so its password can’t be removed. You can still write to it with the password.');
    }

    const { cfg0, cfg1 } = type2ConfigPages(config, false);
    await writePage(chip.cfg0, cfg0, 'its settings');
    await writePage(chip.cfg0 + 1, cfg1, 'its settings');
    await writePage(chip.cfg0 + 2, [0xff, 0xff, 0xff, 0xff], 'the factory password');
    await writePage(chip.cfg0 + 3, [0x00, 0x00, 0x00, 0x00], 'the factory password');
    return { chip: chip.name, readProtected: false };
  });
}

/** Writes an NDEF message to a password-protected tag: sign in, then write its memory directly. */
export function writeRecordsWithPassword(records: NdefRecord[], password: Bytes, successMessage = 'Written to tag'): Promise<WriteResult> {
  const bytes = encodeMessage(records);
  return withSession(TECHS, 'Hold the top of your iPhone near the tag to write.', successMessage, async () => {
    const tag: TagEvent = (await NfcManager.getTag({ readNdef: false }).catch(() => null)) ?? {};
    await identify();
    if (!(await authenticate(password))) throw new Error(`${WRONG_PASSWORD} To write a tag without a password, clear the password field.`);
    return writeType2(bytes, tag.id ?? '');
  });
}
