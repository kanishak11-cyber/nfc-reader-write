/**
 * Pure helpers for Tag diagnostics: chip identification, lock/password/permission
 * analysis and the NTAG 424 DNA authentication maths. No NFC I/O here, so it can be
 * unit-tested off-device.
 */
import aesjs from 'aes-js';

export type Bytes = number[];
export type Tone = 'ok' | 'warn' | 'bad' | 'info';
export type Verdict = 'writable' | 'locked' | 'password' | 'key' | 'unknown';

export interface Finding {
  label: string;
  value: string;
  tone?: Tone;
}

export interface Diagnosis {
  chip: string;
  verdict: Verdict;
  headline: string;
  explanation: string;
  advice: string[];
  findings: Finding[];
  /** NTAG 424 DNA key numbers that are worth testing against the factory default key. */
  testableKeys?: number[];
  /** NTAG 424 DNA key that may change file permissions; a reset needs it to be the factory key. */
  changeKey?: number;
}

export const hex = (bytes: Bytes, sep = ' ') =>
  bytes.map((b) => (b & 0xff).toString(16).padStart(2, '0').toUpperCase()).join(sep);

const bit = (value: number, n: number) => (value >> n) & 1;

/* ================================================================== */
/* NFC Forum Type 2: NTAG21x / MIFARE Ultralight                       */
/* ================================================================== */

interface Type2Chip {
  name: string;
  /** Last user-memory page. */
  userEnd: number;
  /** First configuration page (CFG0, holds AUTH0). */
  cfg0?: number;
  /** Dynamic lock bytes page, right before CFG0 on chips that have one. */
  dynLock?: number;
  /** NDEF data area size / 8, as NXP programs it into the capability container. */
  ccSize: number;
}

/** Keyed by GET_VERSION bytes: product type, product subtype, storage size. */
const TYPE2_CHIPS: Record<string, Type2Chip> = {
  '04-01-0B': { name: 'NTAG210', userEnd: 0x0f, cfg0: 0x10, ccSize: 0x06 },
  '04-01-0E': { name: 'NTAG212', userEnd: 0x23, dynLock: 0x24, cfg0: 0x25, ccSize: 0x10 },
  '04-02-0F': { name: 'NTAG213', userEnd: 0x27, dynLock: 0x28, cfg0: 0x29, ccSize: 0x12 },
  '04-02-11': { name: 'NTAG215', userEnd: 0x81, dynLock: 0x82, cfg0: 0x83, ccSize: 0x3e },
  '04-02-13': { name: 'NTAG216', userEnd: 0xe1, dynLock: 0xe2, cfg0: 0xe3, ccSize: 0x6d },
  '04-04-0F': { name: 'NTAG213 F', userEnd: 0x27, dynLock: 0x28, cfg0: 0x29, ccSize: 0x12 },
  '04-04-13': { name: 'NTAG216 F', userEnd: 0xe1, dynLock: 0xe2, cfg0: 0xe3, ccSize: 0x6d },
  '04-05-13': { name: 'NTAG I2C 1k', userEnd: 0xe1, ccSize: 0x6d },
  '04-05-15': { name: 'NTAG I2C 2k', userEnd: 0xe1, ccSize: 0xea },
  '03-01-0B': { name: 'MIFARE Ultralight EV1 (48 bytes)', userEnd: 0x0f, cfg0: 0x10, ccSize: 0x06 },
  '03-01-0E': { name: 'MIFARE Ultralight EV1 (128 bytes)', userEnd: 0x23, dynLock: 0x24, cfg0: 0x25, ccSize: 0x10 },
};

/** SAK values of MIFARE Classic (and Classic-compatible) cards. */
export const CLASSIC_SAKS = new Set([0x08, 0x09, 0x18, 0x19, 0x28, 0x38, 0x88]);

export function identifyType2(version: Bytes | null): Type2Chip | null {
  if (!version || version.length < 8 || version[0] !== 0x00 || version[1] !== 0x04) return null;
  const chip = TYPE2_CHIPS[hex([version[2], version[3], version[6]], '-')];
  if (!chip) return null;
  // NTAG213 TT reports major version 3 with the NTAG213 layout.
  if (chip.name === 'NTAG213' && version[4] === 0x03) return { ...chip, name: 'NTAG213 TT' };
  return chip;
}

/** The page the diagnostics READ starts at to fetch the lock + config pages in one go. */
export function type2ConfigPage(chip: Type2Chip): number | null {
  return chip.dynLock ?? chip.cfg0 ?? null;
}

export interface Type2Scan {
  /** READ page 0 (pages 0–3: UID, static lock bytes, capability container). */
  header: Bytes | null;
  /** GET_VERSION response, or null when the chip doesn't support it. */
  version: Bytes | null;
  /** READ starting at the dynamic-lock / CFG0 page. */
  config: Bytes | null;
  /** The chip refused to read its configuration pages. */
  configBlocked: boolean;
}

export function analyzeType2(scan: Type2Scan): Diagnosis {
  const chip = identifyType2(scan.version);
  const chipName = chip?.name ?? (scan.version ? `NFC Forum Type 2 (${hex(scan.version)})` : 'MIFARE Ultralight / NTAG (older, no version info)');
  const findings: Finding[] = [{ label: 'Chip', value: chipName }];

  if (!scan.header || scan.header.length < 16) {
    return {
      chip: 'MIFARE-family card',
      verdict: 'unknown',
      headline: 'Couldn’t read the chip’s settings',
      explanation:
        'The chip didn’t answer a standard memory read. Either its whole memory is password-protected, or it’s a MIFARE DESFire or MIFARE Plus card, which uses keys instead.',
      advice: adviceForPassword(),
      findings: [{ label: 'Chip', value: 'MIFARE family (not identified)' }],
    };
  }

  const h = scan.header;
  const cc = h.slice(12, 16);
  const formatted = cc[0] === 0xe1;
  const ccWrite = cc[3] & 0x0f;

  const locked = staticLockedPages(h);
  const staticLocked = [...locked].filter((page) => page >= 4);
  const ccPageLocked = locked.has(3);

  findings.push({
    label: 'NDEF data area',
    value: formatted ? `${cc[2] * 8} bytes, ${ccWrite === 0 ? 'marked writable' : 'marked read-only'}` : 'Not formatted for NDEF',
    tone: formatted && ccWrite !== 0 ? 'bad' : undefined,
  });
  findings.push({
    label: 'Lock bits (pages 3–15)',
    value: staticLocked.length || ccPageLocked
      ? `Set: ${[ccPageLocked ? 'capability container' : null, staticLocked.length ? `pages ${staticLocked.join(', ')}` : null].filter(Boolean).join(', ')}`
      : 'None set',
    tone: staticLocked.length ? 'bad' : undefined,
  });

  // Configuration pages: dynamic lock bytes, AUTH0, ACCESS.
  let dynLocked = false;
  let auth0: number | null = null;
  let access: number | null = null;
  if (chip && scan.config && scan.config.length >= 12) {
    const offset = chip.dynLock ? 4 : 0;
    if (chip.dynLock) {
      dynLocked = (scan.config[0] | scan.config[1]) !== 0;
      findings.push({
        label: 'Lock bits (pages 16+)',
        value: dynLocked ? `Set (${hex(scan.config.slice(0, 3))})` : 'None set',
        tone: dynLocked ? 'bad' : undefined,
      });
    }
    if (chip.cfg0 !== undefined) {
      auth0 = scan.config[offset + 3];
      access = scan.config[offset + 4];
    }
  }

  const passwordFrom = auth0 !== null && chip && auth0 <= chip.userEnd ? auth0 : null;
  if (auth0 !== null && chip) {
    findings.push({
      label: 'Password protection',
      value: passwordFrom !== null ? `On, from page ${passwordFrom}` : 'Off',
      tone: passwordFrom !== null ? 'warn' : 'ok',
    });
  }
  if (access !== null) {
    const prot = bit(access, 7) === 1;
    const cfgLock = bit(access, 6) === 1;
    const authLim = access & 0x07;
    if (passwordFrom !== null) {
      findings.push({ label: 'Password needed for', value: prot ? 'Reading and writing' : 'Writing only' });
      findings.push({
        label: 'Wrong-password limit',
        value: authLim ? `${2 ** authLim} attempts, then the tag disables the password for good` : 'Unlimited',
        tone: authLim ? 'warn' : undefined,
      });
    }
    findings.push({ label: 'Configuration', value: cfgLock ? 'Permanently locked' : 'Not locked', tone: cfgLock ? 'warn' : undefined });
  } else if (scan.configBlocked) {
    findings.push({ label: 'Password protection', value: 'On (configuration pages are hidden)', tone: 'warn' });
  } else if (!chip) {
    findings.push({ label: 'Password protection', value: 'Can’t check on this chip' });
  }

  const permanentlyLocked = staticLocked.length > 0 || dynLocked || (formatted && ccWrite !== 0);

  if (permanentlyLocked) {
    return {
      chip: chipName,
      verdict: 'locked',
      headline: 'Permanently locked',
      explanation:
        'Lock bits on this chip have been set. They’re one-time switches in the hardware: once set they can never be cleared, by any app or phone. The data on it is fixed for life.',
      advice: [
        'This tag can’t be formatted or rewritten. Replace it with a blank NTAG215 or NTAG216.',
        'If it points to a dead company’s link, stop using it. Whoever registers that domain later controls where it sends people.',
      ],
      findings,
    };
  }

  if (passwordFrom !== null || scan.configBlocked) {
    return {
      chip: chipName,
      verdict: 'password',
      headline: 'Password protected',
      explanation:
        'Writing to this chip needs a 32-bit password set by whoever programmed it. Without that password it can’t be erased or rewritten.',
      advice: adviceForPassword(),
      findings,
    };
  }

  return {
    chip: chipName,
    verdict: chip ? 'writable' : 'unknown',
    headline: chip ? 'Nothing is blocking writes' : 'No lock found',
    explanation: chip
      ? 'No lock bits are set and there’s no password. You should be able to write or erase this tag in the Write tab.'
      : 'No lock bits are set, but this older chip can’t report whether it has a password.',
    advice: [
      formatted ? 'Try writing again, and keep the phone still until it finishes.' : 'Writing to it in the Write tab will format it first.',
      'If writing still fails, try another phone. iPhones and some Android phones struggle with certain tags.',
    ],
    findings,
  };
}

function adviceForPassword(): string[] {
  return [
    'Only the company that programmed the card has the password. If it has closed, the card can’t be reset.',
    'Don’t try guessing: many chips disable the password permanently after a few wrong tries.',
    'Replace it with a blank NTAG215 or NTAG216 and write your own link.',
  ];
}

/* Writing Type 2 memory directly ------------------------------------ */
/* Used when the phone's own NDEF support gives up on a tag: iPhones can't format
   factory-blank chips, and some Android phones don't offer to.                    */

/** Pages 3–15 whose static lock bits are set, from a READ of page 0 (page 3 is the capability container). */
export function staticLockedPages(header: Bytes): Set<number> {
  const pages = new Set<number>();
  for (let b = 3; b <= 7; b++) if (bit(header[10], b)) pages.add(b);
  for (let b = 0; b <= 7; b++) if (bit(header[11], b)) pages.add(b + 8);
  return pages;
}

export type Type2Layout =
  | { state: 'blank' }
  | { state: 'formatted'; dataArea: number }
  | { state: 'readOnly' }
  | { state: 'foreign'; cc: Bytes };

/** What the capability container (page 3) says, from a READ of page 0. */
export function type2Layout(header: Bytes): Type2Layout {
  const cc = header.slice(12, 16);
  if (cc.every((b) => b === 0)) return { state: 'blank' };
  if (cc[0] !== 0xe1 || cc[1] >> 4 !== 1 || cc[2] === 0) return { state: 'foreign', cc };
  if ((cc[3] & 0x0f) !== 0) return { state: 'readOnly' };
  return { state: 'formatted', dataArea: cc[2] * 8 };
}

/**
 * Capability container for a blank chip and the data area it declares. Chips we can't
 * identify get 48 bytes, the least any Type 2 tag has, since the container is one-time
 * programmable and can't be enlarged later.
 */
export function type2BlankFormat(version: Bytes | null): { cc: Bytes; dataArea: number } {
  const chip = identifyType2(version);
  const ccSize = chip?.ccSize ?? 0x06;
  // NTAG I2C 2k declares more than sector 0 holds; only sector 0 is reachable without SECTOR_SELECT.
  const dataArea = chip ? Math.min(ccSize * 8, (chip.userEnd - 3) * 4) : ccSize * 8;
  return { cc: [0xe1, 0x10, ccSize, 0x00], dataArea };
}

/**
 * NDEF message TLV, then a terminator TLV when there's room, zero-padded to whole
 * 4-byte pages. Null when it doesn't fit the data area.
 */
export function type2NdefTlv(message: Bytes, dataArea: number): Bytes | null {
  const length = message.length < 0xff ? [message.length] : [0xff, message.length >> 8, message.length & 0xff];
  const tlv = [0x03, ...length, ...message];
  if (tlv.length > dataArea) return null;
  if (tlv.length < dataArea) tlv.push(0xfe);
  while (tlv.length % 4) tlv.push(0x00);
  return tlv;
}

/** Largest NDEF message a data area holds: the TLV header is 2 bytes, or 4 from 255 bytes up. */
export function type2MessageCapacity(dataArea: number): number {
  return Math.max(Math.min(0xfe, dataArea - 2), dataArea - 4);
}

/* ================================================================== */
/* NFC Forum Type 4: NTAG 424 DNA, DESFire, other ISO-DEP tags          */
/* ================================================================== */

export const APDU = {
  selectNdefApp: [0x00, 0xa4, 0x04, 0x00, 0x07, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00],
  selectCcFile: [0x00, 0xa4, 0x00, 0x0c, 0x02, 0xe1, 0x03],
  readCc: [0x00, 0xb0, 0x00, 0x00, 0x0f],
  getVersion: [0x90, 0x60, 0x00, 0x00, 0x00],
  additionalFrame: [0x90, 0xaf, 0x00, 0x00, 0x00],
  /** GetFileSettings for file 02, the NDEF file on NTAG 424 DNA. */
  getNdefFileSettings: [0x90, 0xf5, 0x00, 0x00, 0x01, 0x02, 0x00],
  authenticateEv2First: (keyNo: number) => [0x90, 0x71, 0x00, 0x00, 0x02, keyNo, 0x00, 0x00],
  authenticatePart2: (payload: Bytes) => [0x90, 0xaf, 0x00, 0x00, payload.length, ...payload, 0x00],
};

/** Splits an APDU response into data and the two status-word bytes. */
export function splitResponse(response: Bytes): { data: Bytes; sw: number } {
  const r = response.map((b) => b & 0xff);
  if (r.length < 2) return { data: [], sw: 0 };
  return { data: r.slice(0, -2), sw: (r[r.length - 2] << 8) | r[r.length - 1] };
}

export const SW = { OK: 0x9000, DESFIRE_OK: 0x9100, MORE: 0x91af, AUTH_ERROR: 0x91ae, PERMISSION_DENIED: 0x919d } as const;

export interface Type4Scan {
  ndefApp: boolean;
  cc: Bytes | null;
  /** Hardware part of the native GetVersion response (7 bytes). */
  version: Bytes | null;
  fileSettings: Bytes | null;
  fileSettingsSw: number | null;
}

export function identifyType4(version: Bytes | null): string | null {
  if (!version || version.length < 7 || version[0] !== 0x04) return null;
  switch (version[1]) {
    case 0x04:
      return version[2] === 0x08 ? 'NTAG 424 DNA TagTamper' : 'NTAG 424 DNA';
    case 0x01:
      return 'MIFARE DESFire';
    case 0x08:
      return 'MIFARE DESFire Light';
    default:
      return null;
  }
}

const accessName = (n: number) => (n === 0xe ? 'Anyone' : n === 0xf ? 'No one' : `Holder of AES key ${n}`);

export function analyzeType4(scan: Type4Scan): Diagnosis {
  const named = identifyType4(scan.version);
  const chip = named ?? 'ISO 14443-4 smart card';
  const findings: Finding[] = [{ label: 'Chip', value: chip }];

  if (!scan.ndefApp) {
    return {
      chip,
      verdict: 'unknown',
      headline: 'Not an NFC data tag',
      explanation:
        'This card has no NDEF application, so it isn’t meant to hold links or text. It’s probably a payment, transit, access or ID card.',
      advice: ['Cards like this can’t be formatted into NFC tags. Use a blank NTAG215 or NTAG216 instead.'],
      findings,
    };
  }

  const ccWrite = scan.cc && scan.cc.length >= 15 ? scan.cc[14] : null;
  if (scan.cc && scan.cc.length >= 13) {
    findings.push({ label: 'NDEF capacity', value: `${(scan.cc[11] << 8) | scan.cc[12]} bytes` });
  }
  if (ccWrite !== null) {
    findings.push({
      label: 'NDEF container says',
      value: ccWrite === 0x00 ? 'Writable' : ccWrite === 0xff ? 'Read-only' : `Restricted (0x${hex([ccWrite])})`,
    });
  }

  if (named?.startsWith('NTAG 424') && scan.fileSettings && scan.fileSettings.length >= 7) {
    const fs = scan.fileSettings;
    const sdm = bit(fs[1], 6) === 1;
    const change = fs[2] & 0x0f;
    const readWrite = fs[2] >> 4;
    const read = fs[3] >> 4;
    const write = fs[3] & 0x0f;
    findings.push(
      { label: 'Who can read', value: accessName(read) },
      { label: 'Who can write', value: accessName(write), tone: write === 0xe ? 'ok' : 'bad' },
      { label: 'Who can change permissions', value: accessName(change), tone: change === 0xe ? 'ok' : 'warn' },
    );
    if (readWrite !== write) findings.push({ label: 'Who can read and write', value: accessName(readWrite) });
    if (sdm) {
      const opts = fs[7] ?? 0;
      const parts = [bit(opts, 7) ? 'UID' : null, bit(opts, 6) ? 'tap counter' : null, 'CMAC signature', bit(opts, 4) ? 'encrypted data' : null];
      findings.push({ label: 'SUN (dynamic URL)', value: `On: adds ${parts.filter(Boolean).join(', ')} to every tap`, tone: 'info' });
    }

    const testable = [...new Set([write, change])].filter((k) => k <= 4);

    if (write === 0xe) {
      return {
        chip,
        verdict: 'writable',
        headline: 'Writing is allowed',
        explanation: 'The chip’s file permissions let anyone write the NDEF data.',
        advice: ['Try writing again in the Write tab, and keep the phone still until it finishes.'],
        findings,
      };
    }
    if (write === 0xf && change === 0xf) {
      return {
        chip,
        verdict: 'locked',
        headline: 'Permanently locked',
        explanation: 'Writing is switched off, and so is changing the permissions. Nobody can ever rewrite this card, not even the vendor.',
        advice: replaceAdvice(sdm),
        findings,
      };
    }
    return {
      chip,
      verdict: 'key',
      headline: `Protected by AES key ${write <= 4 ? write : change}`,
      explanation:
        `This is a secure NTAG 424 DNA chip. Its link can only be changed by someone holding a secret 128-bit AES key, which was set by the company that issued it.${sdm ? ' The link changes on every tap (SUN), so the company’s server can check the card is genuine.' : ''} Apps that say “Writable: Yes” are only reading the NDEF container, not these permissions.`,
      advice: [
        'Some vendors never change NXP’s factory key. “Test factory key” below checks that. If it matches, you can reset the card and reuse it.',
        ...replaceAdvice(sdm),
      ],
      findings,
      testableKeys: testable.length ? testable : [0],
      changeKey: change <= 4 ? change : undefined,
    };
  }

  if (named?.startsWith('NTAG 424')) {
    findings.push({ label: 'File permissions', value: `Hidden (status ${hex([(scan.fileSettingsSw ?? 0) >> 8, (scan.fileSettingsSw ?? 0) & 0xff])})`, tone: 'warn' });
    return {
      chip,
      verdict: 'key',
      headline: 'Protected by an AES key',
      explanation: 'This NTAG 424 DNA chip hides its file permissions without a key. That means it was configured with custom security by its issuer.',
      advice: ['“Test factory key” below checks whether the factory key still works.', ...replaceAdvice(false)],
      findings,
      testableKeys: [0],
      changeKey: 0,
    };
  }

  // Generic Type 4 (DESFire, other ISO-DEP tags): only the NDEF container's write flag is standard.
  if (ccWrite === 0x00) {
    return {
      chip,
      verdict: 'writable',
      headline: 'Writing is allowed',
      explanation: 'The tag’s NDEF container allows writing.',
      advice: ['Try writing again in the Write tab, and keep the phone still until it finishes.'],
      findings,
    };
  }
  if (ccWrite === 0xff) {
    return {
      chip,
      verdict: 'locked',
      headline: 'Read-only',
      explanation: 'The tag’s NDEF container is marked read-only, so standard NFC apps can’t write it.',
      advice: replaceAdvice(false),
      findings,
    };
  }
  return {
    chip,
    verdict: 'key',
    headline: 'Protected by a key',
    explanation: 'Writing needs a proprietary key or password set by whoever issued the card.',
    advice: replaceAdvice(false),
    findings,
  };
}

function replaceAdvice(sdm: boolean): string[] {
  return [
    'Without the key it can’t be rewritten or reset. Replace it with a blank NTAG215/216, or with a blank NTAG 424 DNA if you want the same anti-cloning protection.',
    sdm
      ? 'If the company’s domain lapses, whoever registers it next controls where this card sends people. Retire these cards.'
      : 'If it points to a dead company’s link, stop handing it out.',
  ];
}

/* ================================================================== */
/* Other technologies                                                  */
/* ================================================================== */

export function analyzeClassic(opts: { formattable: boolean; ndefWritable: boolean | null }): Diagnosis {
  const findings: Finding[] = [{ label: 'Chip', value: 'MIFARE Classic' }];
  if (opts.formattable) {
    return {
      chip: 'MIFARE Classic',
      verdict: 'writable',
      headline: 'Can be formatted',
      explanation: 'Android reports this MIFARE Classic card as formattable, which means it still uses the factory keys.',
      advice: ['Write anything in the Write tab on this Android phone and it will be formatted automatically. iPhones can’t write MIFARE Classic.'],
      findings,
    };
  }
  findings.push({ label: 'Android NDEF access', value: opts.ndefWritable === null ? 'Not available' : opts.ndefWritable ? 'Writable' : 'Read-only' });
  return {
    chip: 'MIFARE Classic',
    verdict: opts.ndefWritable ? 'writable' : 'key',
    headline: opts.ndefWritable ? 'Writable' : 'Protected by sector keys',
    explanation: opts.ndefWritable
      ? 'Android can write NDEF data to this card.'
      : 'MIFARE Classic memory is guarded by 48-bit sector keys. Without the issuer’s keys this card can’t be rewritten. iPhones can’t write MIFARE Classic at all.',
    advice: opts.ndefWritable ? ['Use the Write tab on Android.'] : ['Replace it with a blank NTAG215 or NTAG216, which work on every phone.'],
    findings,
  };
}

export function analyzeGeneric(chip: string, ndefWritable: boolean | null): Diagnosis {
  return {
    chip,
    verdict: ndefWritable === false ? 'locked' : ndefWritable ? 'writable' : 'unknown',
    headline: ndefWritable === false ? 'Read-only' : ndefWritable ? 'Writable' : 'Not checked in detail',
    explanation:
      ndefWritable === false
        ? 'The phone reports this tag’s NDEF data as read-only.'
        : ndefWritable
          ? 'The phone reports this tag as writable.'
          : 'Detailed checks are available for NTAG/Ultralight and NTAG 424 DNA chips. This tag uses a different technology.',
    advice: ndefWritable === false ? ['Replace it with a blank NTAG215 or NTAG216.'] : ['Try writing it in the Write tab.'],
    findings: [{ label: 'Chip', value: chip }],
  };
}

/* ================================================================== */
/* NTAG 424 DNA: AuthenticateEV2First with a candidate key             */
/* ================================================================== */

export const FACTORY_KEY: Bytes = new Array(16).fill(0);

const ZERO_BLOCK: Bytes = new Array(16).fill(0);
const u8 = (b: Bytes) => Uint8Array.from(b);
const xor = (a: Bytes, b: Bytes) => a.map((x, i) => x ^ b[i]);
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];

function ecbEncrypt(key: Bytes, block: Bytes): Bytes {
  return Array.from(new aesjs.ModeOfOperation.ecb(u8(key)).encrypt(u8(block)));
}
function cbcEncrypt(key: Bytes, iv: Bytes, data: Bytes): Bytes {
  return Array.from(new aesjs.ModeOfOperation.cbc(u8(key), u8(iv)).encrypt(u8(data)));
}
function cbcDecrypt(key: Bytes, iv: Bytes, data: Bytes): Bytes {
  return Array.from(new aesjs.ModeOfOperation.cbc(u8(key), u8(iv)).decrypt(u8(data)));
}

/** ISO/IEC 9797-1 padding method 2: 0x80 then zeros up to a 16-byte boundary (always added). */
export function pad80(data: Bytes): Bytes {
  const out = [...data, 0x80];
  while (out.length % 16) out.push(0);
  return out;
}

function shiftLeft(block: Bytes): Bytes {
  const out = new Array<number>(16);
  let carry = 0;
  for (let i = 15; i >= 0; i--) {
    out[i] = ((block[i] << 1) & 0xff) | carry;
    carry = block[i] >> 7;
  }
  return out;
}

/** AES-CMAC (RFC 4493 / NIST SP 800-38B). */
export function cmac(key: Bytes, message: Bytes): Bytes {
  const l = ecbEncrypt(key, ZERO_BLOCK);
  const k1 = shiftLeft(l);
  if (l[0] & 0x80) k1[15] ^= 0x87;
  const k2 = shiftLeft(k1);
  if (k1[0] & 0x80) k2[15] ^= 0x87;

  const blocks = Math.max(1, Math.ceil(message.length / 16));
  const complete = message.length > 0 && message.length % 16 === 0;
  const tail = message.slice((blocks - 1) * 16);
  const last = complete ? xor(tail, k1) : xor(pad80(tail), k2);

  let x = ZERO_BLOCK;
  for (let i = 0; i < blocks - 1; i++) x = ecbEncrypt(key, xor(x, message.slice(i * 16, i * 16 + 16)));
  return ecbEncrypt(key, xor(x, last));
}

export const rotateLeft = (bytes: Bytes) => [...bytes.slice(1), bytes[0]];

/** AuthenticateEV2First part 1: the card sends E(K, RndB). */
export function decryptRndB(key: Bytes, encRndB: Bytes): Bytes {
  return cbcDecrypt(key, ZERO_BLOCK, encRndB);
}

/** Part 2: E(K, RndA || RndB') where RndB' is RndB rotated left by one byte. */
export function authPart2Payload(key: Bytes, rndB: Bytes, rndA: Bytes): Bytes {
  return cbcEncrypt(key, ZERO_BLOCK, [...rndA, ...rotateLeft(rndB)]);
}

/** The card answers E(K, TI || RndA' || PDcap2 || PCDcap2); RndA' must be our RndA rotated left. */
export function authPart2Result(key: Bytes, response: Bytes, rndA: Bytes): { ok: boolean; ti: Bytes } {
  if (response.length !== 32) return { ok: false, ti: [] };
  const plain = cbcDecrypt(key, ZERO_BLOCK, response);
  const expected = rotateLeft(rndA);
  return { ok: plain.slice(4, 20).every((b, i) => b === expected[i]), ti: plain.slice(0, 4) };
}

/* Secure messaging (NTAG 424 DNA datasheet §9.1, NXP AN12196) -------- */

export interface SecureSession {
  enc: Bytes;
  mac: Bytes;
  ti: Bytes;
  /** Command counter: 0 right after authentication, +1 after every command. */
  ctr: number;
}

/** SV1/SV2 = label || 00 01 00 80 || RndA[15..14] || (RndA[13..8] ⊕ RndB[15..10]) || RndB[9..0] || RndA[7..0]. */
function sessionVector(label: Bytes, rndA: Bytes, rndB: Bytes): Bytes {
  return [
    ...label,
    0x00, 0x01, 0x00, 0x80,
    rndA[0], rndA[1],
    ...xor(rndA.slice(2, 8), rndB.slice(0, 6)),
    ...rndB.slice(6, 16),
    ...rndA.slice(8, 16),
  ];
}

export function deriveSessionKeys(key: Bytes, rndA: Bytes, rndB: Bytes): { enc: Bytes; mac: Bytes } {
  return {
    enc: cmac(key, sessionVector([0xa5, 0x5a], rndA, rndB)),
    mac: cmac(key, sessionVector([0x5a, 0xa5], rndA, rndB)),
  };
}

/** MACt: the 8 even-numbered bytes (S14, S12 … S0) of the CMAC, i.e. odd array indices. */
export const truncateMac = (mac: Bytes) => mac.filter((_, i) => i % 2 === 1);

/** Builds a CommMode.Full command APDU: header in plain, data encrypted, MACt appended. */
export function fullModeCommand(session: SecureSession, cmd: number, header: Bytes, data: Bytes): Bytes {
  const ivc = ecbEncrypt(session.enc, [0xa5, 0x5a, ...session.ti, ...le16(session.ctr), 0, 0, 0, 0, 0, 0, 0, 0]);
  const encrypted = cbcEncrypt(session.enc, ivc, pad80(data));
  const macT = truncateMac(cmac(session.mac, [cmd, ...le16(session.ctr), ...session.ti, ...header, ...encrypted]));
  const body = [...header, ...encrypted, ...macT];
  return [0x90, cmd, 0x00, 0x00, body.length, ...body, 0x00];
}

/** Checks the card's response MAC. Call with the counter already incremented for this command. */
export function responseMacValid(session: SecureSession, returnCode: number, data: Bytes): boolean {
  if (data.length < 8) return false;
  const expected = truncateMac(cmac(session.mac, [returnCode, ...le16(session.ctr), ...session.ti, ...data.slice(0, -8)]));
  return expected.every((b, i) => b === data[data.length - 8 + i]);
}

/**
 * Factory settings for the NDEF file (file 02): CommMode plain, SDM off,
 * access rights E0 EE = read/write/read-write by anyone, change with key 0.
 */
export const NDEF_FILE_FACTORY_SETTINGS: Bytes = [0x00, 0xe0, 0xee];
