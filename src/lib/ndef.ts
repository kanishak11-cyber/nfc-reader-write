import { Ndef, type NdefRecord } from 'react-native-nfc-manager';

type Bytes = number[];

/* ------------------------------------------------------------------ */
/* Byte helpers                                                        */
/* ------------------------------------------------------------------ */

/** Android hands back signed Java bytes; normalise everything to 0–255. */
function toBytes(value: number[] | string | undefined | null): Bytes {
  if (!value) return [];
  if (typeof value === 'string') return Ndef.util.stringToBytes(value);
  return value.map((b) => b & 0xff);
}

/** NDEF record ids arrive as a hex string on Android and as bytes on iOS. */
function idToBytes(id: NdefRecord['id']): Bytes {
  if (!id) return [];
  if (typeof id === 'string') {
    const hex = id.replace(/[^0-9a-f]/gi, '');
    const out: Bytes = [];
    for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
    return out;
  }
  return toBytes(id);
}

function typeToString(type: NdefRecord['type']): string {
  if (typeof type === 'string') return type;
  return utf8(toBytes(type)) ?? latin1(toBytes(type));
}

export function toHex(bytes: Bytes, separator = ' '): string {
  return bytes.map((b) => (b & 0xff).toString(16).padStart(2, '0').toUpperCase()).join(separator);
}

/** Formats a tag UID ("04a1b2…" or "04:A1:…") as colon-separated upper-case hex. */
export function formatUid(id: string | undefined): string {
  if (!id) return '';
  const hex = id.replace(/[^0-9a-f]/gi, '').toUpperCase();
  return hex.match(/.{1,2}/g)?.join(':') ?? hex;
}

function utf8(bytes: Bytes): string | null {
  return Ndef.util.bytesToString(bytes);
}

function latin1(bytes: Bytes): string {
  return bytes.map((b) => String.fromCharCode(b)).join('');
}

function utf16(bytes: Bytes): string {
  let littleEndian = false;
  let start = 0;
  if (bytes[0] === 0xfe && bytes[1] === 0xff) start = 2;
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    littleEndian = true;
    start = 2;
  }
  let out = '';
  for (let i = start; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
  }
  return out;
}

/** True when the bytes decode as UTF-8 text without control characters (tabs/newlines allowed). */
function asReadableText(bytes: Bytes): string | null {
  const text = utf8(bytes);
  if (text === null) return null;
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text) ? null : text;
}

/* ------------------------------------------------------------------ */
/* Decoding                                                            */
/* ------------------------------------------------------------------ */

const TNF_NAMES = [
  'Empty',
  'Well-known',
  'MIME media',
  'Absolute URI',
  'External',
  'Unknown',
  'Unchanged',
  'Reserved',
] as const;

const URI_PREFIXES: readonly string[] = Ndef.RTD_URI_PROTOCOLS;

/** Schemes we are comfortable handing to Linking.openURL from a tag. */
const OPENABLE = /^(https?:|tel:|mailto:|sms:|smsto:|geo:)/i;

export type RecordKind =
  | 'text'
  | 'link'
  | 'phone'
  | 'email'
  | 'sms'
  | 'location'
  | 'uri'
  | 'wifi'
  | 'contact'
  | 'app'
  | 'poster'
  | 'mime'
  | 'external'
  | 'empty'
  | 'unknown';

export interface Detail {
  label: string;
  value: string;
  secret?: boolean;
}

export interface DecodedRecord {
  kind: RecordKind;
  title: string;
  value: string;
  details: Detail[];
  /** Present when the record can be opened with Linking. */
  url?: string;
  children?: DecodedRecord[];
  raw: {
    tnf: string;
    type: string;
    id: string;
    payloadHex: string;
    payloadText: string | null;
    size: number;
  };
}

export function decodeRecord(record: NdefRecord): DecodedRecord {
  const tnf = record.tnf & 0x07;
  const type = typeToString(record.type);
  const payload = toBytes(record.payload);
  const id = idToBytes(record.id);

  const raw: DecodedRecord['raw'] = {
    tnf: `${TNF_NAMES[tnf]} (0x0${tnf})`,
    type,
    id: id.length ? toHex(id) : '',
    payloadHex: toHex(payload),
    payloadText: asReadableText(payload),
    size: payload.length,
  };

  const base = { details: [] as Detail[], raw };

  switch (tnf) {
    case 0x00:
      return { ...base, kind: 'empty', title: 'Empty record', value: 'This tag holds an empty NDEF message.' };

    case 0x01:
      if (type === 'T') return { ...base, ...decodeText(payload) };
      if (type === 'U') return { ...base, ...describeUri(decodeUriPayload(payload)) };
      if (type === 'Sp') return { ...base, ...decodeSmartPoster(payload) };
      return { ...base, kind: 'unknown', title: `Well-known type “${type}”`, value: raw.payloadText ?? raw.payloadHex };

    case 0x02:
      return { ...base, ...decodeMime(type, payload) };

    case 0x03:
      return { ...base, ...describeUri(type), title: 'Absolute URI' };

    case 0x04:
      if (type === 'android.com:pkg') {
        return {
          ...base,
          kind: 'app',
          title: 'Android app',
          value: utf8(payload) ?? raw.payloadHex,
          details: [{ label: 'Effect', value: 'Opens or installs this app on Android' }],
        };
      }
      return { ...base, kind: 'external', title: type || 'External type', value: raw.payloadText ?? raw.payloadHex };

    default:
      return {
        ...base,
        kind: 'unknown',
        title: TNF_NAMES[tnf],
        value: raw.payloadText ?? (payload.length ? raw.payloadHex : 'No payload'),
      };
  }
}

type Decoded = Omit<DecodedRecord, 'raw' | 'details'> & { details?: Detail[] };

function decodeText(payload: Bytes): Decoded {
  const status = payload[0] ?? 0;
  const isUtf16 = (status & 0x80) !== 0;
  const langLength = status & 0x3f;
  const language = latin1(payload.slice(1, 1 + langLength));
  const body = payload.slice(1 + langLength);
  const text = isUtf16 ? utf16(body) : (utf8(body) ?? latin1(body));
  return {
    kind: 'text',
    title: 'Text',
    value: text,
    details: [
      ...(language ? [{ label: 'Language', value: language }] : []),
      { label: 'Encoding', value: isUtf16 ? 'UTF-16' : 'UTF-8' },
    ],
  };
}

function decodeUriPayload(payload: Bytes): string {
  const prefix = URI_PREFIXES[payload[0] ?? 0] ?? '';
  const rest = payload.slice(1);
  return prefix + (utf8(rest) ?? latin1(rest));
}

function describeUri(uri: string): Decoded {
  const url = OPENABLE.test(uri) ? uri : undefined;
  const lower = uri.toLowerCase();

  if (lower.startsWith('tel:')) {
    return { kind: 'phone', title: 'Phone number', value: decodeURIComponentSafe(uri.slice(4)), url };
  }
  if (lower.startsWith('mailto:')) {
    const [address, query = ''] = uri.slice(7).split('?');
    const params = parseQuery(query);
    const details: Detail[] = [];
    if (params.subject) details.push({ label: 'Subject', value: params.subject });
    if (params.body) details.push({ label: 'Body', value: params.body });
    return { kind: 'email', title: 'Email', value: decodeURIComponentSafe(address), details, url };
  }
  if (lower.startsWith('sms:') || lower.startsWith('smsto:')) {
    const [number, query = ''] = uri.slice(uri.indexOf(':') + 1).split('?');
    const params = parseQuery(query);
    return {
      kind: 'sms',
      title: 'SMS',
      value: decodeURIComponentSafe(number),
      details: params.body ? [{ label: 'Message', value: params.body }] : [],
      url,
    };
  }
  if (lower.startsWith('geo:')) {
    return { kind: 'location', title: 'Location', value: uri.slice(4), url };
  }
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return { kind: 'link', title: 'Link', value: uri, url };
  }
  return { kind: 'uri', title: 'URI', value: uri, url };
}

function decodeSmartPoster(payload: Bytes): Decoded {
  let children: DecodedRecord[] = [];
  try {
    children = Ndef.decodeMessage(payload).map(decodeRecord);
  } catch {
    // Malformed nested message; fall through with no children.
  }
  const uri = children.find((c) => c.url || ['link', 'uri', 'phone', 'email', 'sms', 'location'].includes(c.kind));
  const title = children.find((c) => c.kind === 'text');
  return {
    kind: 'poster',
    title: 'Smart poster',
    value: uri?.value ?? title?.value ?? 'Smart poster',
    url: uri?.url,
    details: title ? [{ label: 'Title', value: title.value }] : [],
    children,
  };
}

function decodeMime(mimeType: string, payload: Bytes): Decoded {
  const type = mimeType.toLowerCase();

  if (type === WIFI_MIME) {
    const wifi = decodeWifi(payload);
    if (wifi) {
      const details: Detail[] = [{ label: 'Security', value: wifi.security }];
      if (wifi.password) details.push({ label: 'Password', value: wifi.password, secret: true });
      details.push({ label: 'Note', value: 'Android can join this network from the tag. iOS cannot.' });
      return { kind: 'wifi', title: 'Wi-Fi network', value: wifi.ssid || '(hidden SSID)', details };
    }
  }

  if (type === 'text/vcard' || type === 'text/x-vcard') {
    const text = utf8(payload) ?? latin1(payload);
    const field = (name: string) =>
      text
        .split(/\r?\n/)
        .find((line) => line.toUpperCase().startsWith(name))
        ?.split(':')
        .slice(1)
        .join(':');
    const details: Detail[] = [];
    const tel = field('TEL');
    const email = field('EMAIL');
    const org = field('ORG');
    if (tel) details.push({ label: 'Phone', value: tel });
    if (email) details.push({ label: 'Email', value: email });
    if (org) details.push({ label: 'Organisation', value: org.replace(/;/g, ' ').trim() });
    return { kind: 'contact', title: 'Contact', value: field('FN') ?? 'Contact card', details };
  }

  const readable = asReadableText(payload);
  return {
    kind: 'mime',
    title: mimeType || 'MIME media',
    value: readable ?? `${payload.length} bytes of binary data`,
  };
}

function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponentSafe(k).toLowerCase()] = decodeURIComponentSafe(v.replace(/\+/g, ' '));
  }
  return out;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* ------------------------------------------------------------------ */
/* Wi-Fi Simple Configuration (application/vnd.wfa.wsc)                */
/* ------------------------------------------------------------------ */

const WIFI_MIME = 'application/vnd.wfa.wsc';

const WSC = {
  VERSION: 0x104a,
  CREDENTIAL: 0x100e,
  NETWORK_INDEX: 0x1026,
  SSID: 0x1045,
  AUTH_TYPE: 0x1003,
  ENCRYPTION_TYPE: 0x100f,
  NETWORK_KEY: 0x1027,
  MAC_ADDRESS: 0x1020,
} as const;

const AUTH = { OPEN: 0x0001, WPA_PSK: 0x0002, WPA2_PSK: 0x0020, WPA_WPA2_PSK: 0x0022 } as const;
const ENCRYPTION = { NONE: 0x0001, AES: 0x0008 } as const;

const AUTH_NAMES: Record<number, string> = {
  [AUTH.OPEN]: 'Open',
  [AUTH.WPA_PSK]: 'WPA Personal',
  [AUTH.WPA2_PSK]: 'WPA2 Personal',
  [AUTH.WPA_WPA2_PSK]: 'WPA/WPA2 Personal',
  0x0008: 'WPA Enterprise',
  0x0010: 'WPA2 Enterprise',
};

function tlv(type: number, value: Bytes): Bytes {
  return [(type >> 8) & 0xff, type & 0xff, (value.length >> 8) & 0xff, value.length & 0xff, ...value];
}

function readTlvs(bytes: Bytes): Map<number, Bytes> {
  const out = new Map<number, Bytes>();
  let i = 0;
  while (i + 4 <= bytes.length) {
    const type = (bytes[i] << 8) | bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    out.set(type, bytes.slice(i + 4, i + 4 + length));
    i += 4 + length;
  }
  return out;
}

function decodeWifi(payload: Bytes): { ssid: string; password: string; security: string } | null {
  const credential = readTlvs(payload).get(WSC.CREDENTIAL);
  if (!credential) return null;
  const fields = readTlvs(credential);
  const ssid = fields.get(WSC.SSID) ?? [];
  const key = fields.get(WSC.NETWORK_KEY) ?? [];
  const auth = fields.get(WSC.AUTH_TYPE);
  const authValue = auth && auth.length >= 2 ? (auth[0] << 8) | auth[1] : AUTH.OPEN;
  return {
    ssid: utf8(ssid) ?? latin1(ssid),
    password: utf8(key) ?? latin1(key),
    security: AUTH_NAMES[authValue] ?? `Unknown (0x${authValue.toString(16).padStart(4, '0')})`,
  };
}

/** Encodes a WSC credential in the layout Android's NFC Wi-Fi handler expects. */
function encodeWifi(ssid: string, password: string, secured: boolean): Bytes {
  const credential = [
    ...tlv(WSC.NETWORK_INDEX, [0x01]),
    ...tlv(WSC.SSID, Ndef.util.stringToBytes(ssid)),
    ...tlv(WSC.AUTH_TYPE, u16(secured ? AUTH.WPA2_PSK : AUTH.OPEN)),
    ...tlv(WSC.ENCRYPTION_TYPE, u16(secured ? ENCRYPTION.AES : ENCRYPTION.NONE)),
    ...tlv(WSC.NETWORK_KEY, secured ? Ndef.util.stringToBytes(password) : []),
    ...tlv(WSC.MAC_ADDRESS, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
  ];
  return [...tlv(WSC.VERSION, [0x10]), ...tlv(WSC.CREDENTIAL, credential)];
}

function u16(value: number): Bytes {
  return [(value >> 8) & 0xff, value & 0xff];
}

/* ------------------------------------------------------------------ */
/* Encoding for the Write screen                                       */
/* ------------------------------------------------------------------ */

export type WriteKind = 'text' | 'link' | 'phone' | 'email' | 'wifi';

export interface WriteForm {
  text: string;
  link: string;
  phone: string;
  email: string;
  emailSubject: string;
  emailBody: string;
  ssid: string;
  wifiPassword: string;
  wifiSecured: boolean;
}

export const EMPTY_FORM: WriteForm = {
  text: '',
  link: '',
  phone: '',
  email: '',
  emailSubject: '',
  emailBody: '',
  ssid: '',
  wifiPassword: '',
  wifiSecured: true,
};

export type BuildResult = { ok: true; records: NdefRecord[]; summary: string } | { ok: false; error: string };

export function normaliseLink(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function buildRecords(kind: WriteKind, form: WriteForm): BuildResult {
  switch (kind) {
    case 'text': {
      if (!form.text.trim()) return { ok: false, error: 'Enter some text to write.' };
      return { ok: true, records: [Ndef.textRecord(form.text, 'en')], summary: 'text' };
    }
    case 'link': {
      const url = normaliseLink(form.link);
      if (!url) return { ok: false, error: 'Enter a link to write.' };
      if (/^https?:\/\//i.test(url) && !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) {
        return { ok: false, error: 'That doesn’t look like a valid web address.' };
      }
      if (/\s/.test(url)) return { ok: false, error: 'Links can’t contain spaces.' };
      return { ok: true, records: [Ndef.uriRecord(url)], summary: 'link' };
    }
    case 'phone': {
      const number = form.phone.replace(/[^\d+*#]/g, '');
      if (number.replace(/\D/g, '').length < 3) return { ok: false, error: 'Enter a phone number.' };
      return { ok: true, records: [Ndef.uriRecord(`tel:${number}`)], summary: 'phone number' };
    }
    case 'email': {
      const address = form.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, error: 'Enter a valid email address.' };
      const params: string[] = [];
      if (form.emailSubject.trim()) params.push(`subject=${encodeURIComponent(form.emailSubject.trim())}`);
      if (form.emailBody.trim()) params.push(`body=${encodeURIComponent(form.emailBody.trim())}`);
      const uri = `mailto:${address}${params.length ? `?${params.join('&')}` : ''}`;
      return { ok: true, records: [Ndef.uriRecord(uri)], summary: 'email' };
    }
    case 'wifi': {
      const ssid = form.ssid;
      if (!ssid.trim()) return { ok: false, error: 'Enter the network name (SSID).' };
      if (Ndef.util.stringToBytes(ssid).length > 32) return { ok: false, error: 'Network names are limited to 32 bytes.' };
      if (form.wifiSecured) {
        const pw = form.wifiPassword;
        const isHexKey = /^[0-9a-f]{64}$/i.test(pw);
        if (!isHexKey && (pw.length < 8 || pw.length > 63)) {
          return { ok: false, error: 'WPA2 passwords must be 8–63 characters.' };
        }
      }
      const payload = encodeWifi(ssid, form.wifiPassword, form.wifiSecured);
      return {
        ok: true,
        records: [Ndef.record(Ndef.TNF_MIME_MEDIA, WIFI_MIME, [], payload)],
        summary: 'Wi-Fi network',
      };
    }
  }
}

/** A single empty record: the conventional way to "erase" an NDEF tag. */
export function emptyMessage(): NdefRecord[] {
  return [Ndef.record(Ndef.TNF_EMPTY, '', [], [])];
}

export function encodeMessage(records: NdefRecord[]): Bytes {
  return Ndef.encodeMessage(records);
}

/** Size in bytes of an NDEF message as read from a tag (types/ids may be arrays or strings). */
export function messageSize(records: NdefRecord[]): number {
  return records.reduce((total, record) => {
    const type = typeof record.type === 'string' ? Ndef.util.stringToBytes(record.type) : record.type;
    const id = idToBytes(record.id);
    const payloadLength = record.payload?.length ?? 0;
    const header = 1 + 1 + (payloadLength < 256 ? 1 : 4) + (id.length ? 1 : 0);
    return total + header + type.length + id.length + payloadLength;
  }, 0);
}
