/**
 * Contact cards: reading vCards (2.1, 3.0 and 4.0) from tags, writing them, and the
 * contact-page link that lets iPhones save a card without an app.
 */

export interface ContactCard {
  givenName: string;
  familyName: string;
  /** The vCard's FN, or the name parts joined when it has none. */
  fullName: string;
  organisation: string;
  jobTitle: string;
  /** Labels are the ones expo-contacts understands: mobile, work, home, main, other… */
  phones: { number: string; label: string }[];
  emails: { address: string; label: string }[];
  urls: string[];
}

export const VCARD_MIME = 'text/vcard';

/** The name to show for a card: its full name, else its company. */
export function contactName(card: ContactCard): string {
  return card.fullName || [card.givenName, card.familyName].filter(Boolean).join(' ') || card.organisation;
}

/* Reading ----------------------------------------------------------- */

interface Property {
  name: string;
  params: Record<string, string[]>;
  value: string;
}

/** Joins folded lines (RFC 2425) and vCard 2.1 quoted-printable soft line breaks. */
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].endsWith('=') && /QUOTED-PRINTABLE/i.test(lines[last].split(':')[0])) {
      lines[last] = lines[last].slice(0, -1) + line;
    } else if (last >= 0 && /^[ \t]/.test(line)) {
      lines[last] += line.slice(1);
    } else if (line.trim()) {
      lines.push(line);
    }
  }
  return lines;
}

function parseLine(line: string): Property | null {
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;

  const [nameWithGroup, ...paramParts] = line.slice(0, colon).split(';');
  const params: Record<string, string[]> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    const rawValues = (eq === -1 ? part : part.slice(eq + 1)).replace(/"/g, '');
    const values = rawValues.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
    // vCard 2.1 allows bare parameters: "TEL;CELL;QUOTED-PRINTABLE:…".
    let key = eq === -1 ? 'TYPE' : part.slice(0, eq).trim().toUpperCase();
    if (eq === -1 && (values[0] === 'quoted-printable' || values[0] === 'base64')) key = 'ENCODING';
    (params[key] ??= []).push(...values);
  }
  return {
    name: nameWithGroup.slice(nameWithGroup.lastIndexOf('.') + 1).trim().toUpperCase(),
    params,
    value: line.slice(colon + 1),
  };
}

/** Quoted-printable (vCard 2.1, as many Android phones export) to text. */
function decodeQuotedPrintable(value: string): string {
  try {
    return decodeURIComponent(value.replace(/%/g, '%25').replace(/=([0-9a-f]{2})/gi, '%$1'));
  } catch {
    // Not UTF-8: read the bytes as Latin-1.
    return value.replace(/=([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }
}

/** Splits a structured value (N, ORG) on unescaped semicolons and unescapes each part. */
function splitStructured(value: string): string[] {
  const parts: string[] = [''];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '\\' && i + 1 < value.length) {
      const next = value[++i];
      parts[parts.length - 1] += next === 'n' || next === 'N' ? '\n' : next;
    } else if (c === ';') {
      parts.push('');
    } else {
      parts[parts.length - 1] += c;
    }
  }
  return parts.map((p) => p.trim());
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c)).trim();
}

function phoneLabel(types: string[]): string {
  if (types.includes('fax')) return types.includes('home') ? 'faxhome' : 'faxwork';
  if (types.includes('cell') || types.includes('mobile') || types.includes('iphone')) return types.includes('work') ? 'workmobile' : 'mobile';
  if (types.includes('pager')) return 'pager';
  if (types.includes('work')) return 'work';
  if (types.includes('home')) return 'home';
  if (types.includes('main')) return 'main';
  return 'other';
}

function emailLabel(types: string[]): string {
  if (types.includes('work')) return 'work';
  if (types.includes('home')) return 'home';
  return 'other';
}

/** Parses the first contact in a vCard. Returns null when the text isn't a vCard. */
export function parseVcard(text: string): ContactCard | null {
  if (!/BEGIN:VCARD/i.test(text)) return null;
  const card: ContactCard = { givenName: '', familyName: '', fullName: '', organisation: '', jobTitle: '', phones: [], emails: [], urls: [] };

  for (const line of unfold(text)) {
    const property = parseLine(line);
    if (!property) continue;
    if (property.name === 'END') break;
    const { name, params } = property;
    const types = params.TYPE ?? [];
    const value = params.ENCODING?.[0] === 'quoted-printable' ? decodeQuotedPrintable(property.value) : property.value;

    switch (name) {
      case 'FN':
        card.fullName ||= unescapeText(value);
        break;
      case 'N': {
        const [family = '', given = ''] = splitStructured(value);
        card.familyName ||= family;
        card.givenName ||= given;
        break;
      }
      case 'ORG':
        card.organisation ||= splitStructured(value).filter(Boolean).join(' ');
        break;
      case 'TITLE':
        card.jobTitle ||= unescapeText(value);
        break;
      case 'TEL': {
        // vCard 4.0 writes numbers as tel: URIs.
        const number = unescapeText(value).replace(/^tel:/i, '');
        if (number) card.phones.push({ number, label: phoneLabel(types) });
        break;
      }
      case 'EMAIL': {
        const address = unescapeText(value).replace(/^mailto:/i, '');
        if (address) card.emails.push({ address, label: emailLabel(types) });
        break;
      }
      case 'URL': {
        const url = unescapeText(value);
        if (url) card.urls.push(url);
        break;
      }
    }
  }

  if (!card.fullName) card.fullName = [card.givenName, card.familyName].filter(Boolean).join(' ');
  return card;
}

/* Writing ----------------------------------------------------------- */

/** Escapes a vCard 3.0 text value (RFC 2426 §5): backslash, comma, semicolon and newlines. */
function escapeText(value: string): string {
  return value.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
}

const TEL_TYPES: Record<string, string> = {
  mobile: 'CELL',
  workmobile: 'CELL,WORK',
  work: 'WORK',
  home: 'HOME',
  faxwork: 'FAX,WORK',
  faxhome: 'FAX,HOME',
  pager: 'PAGER',
};

/** A vCard 3.0, which both Android's and iOS's contact importers read. Empty fields are left out to save tag space. */
export function encodeVcard(card: ContactCard): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeText(card.familyName)};${escapeText(card.givenName)};;;`,
    `FN:${escapeText(contactName(card))}`,
    card.organisation ? `ORG:${escapeText(card.organisation)}` : null,
    card.jobTitle ? `TITLE:${escapeText(card.jobTitle)}` : null,
    ...card.phones.map((p) => `TEL;TYPE=${TEL_TYPES[p.label] ?? 'VOICE'}:${p.number}`),
    ...card.emails.map((e) => `EMAIL:${escapeText(e.address)}`),
    ...card.urls.map((u) => `URL:${escapeText(u)}`),
    'END:VCARD',
  ];
  return `${lines.filter(Boolean).join('\r\n')}\r\n`;
}

/* Contact page ------------------------------------------------------ */

/**
 * A static page (web/contact/index.html) that shows a contact and saves it. The tag links to
 * it with the contact in the URL fragment, after the #, which browsers never send to the
 * server: the page builds the contact in the browser and nothing is stored anywhere.
 */
export const CONTACT_PAGE_URL = 'https://kanishak11-cyber.github.io/nfc-reader-write/c/';

/** Fragment keys. Short, because every byte counts on a 137-byte tag. */
const KEYS = { f: 'givenName', l: 'familyName', o: 'organisation', t: 'phone', e: 'email' } as const;

/** Percent-encodes what the fragment needs encoded, but leaves + @ : / , readable and short. */
function encodeFragmentValue(value: string): string {
  return encodeURIComponent(value).replace(/%(2B|40|3A|2F|2C)/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** The contact-page link for a card: name, company, first phone and first email. */
export function contactPageLink(card: ContactCard): string {
  const values: Record<keyof typeof KEYS, string> = {
    f: card.givenName,
    l: card.familyName,
    o: card.organisation,
    t: card.phones[0]?.number ?? '',
    e: card.emails[0]?.address ?? '',
  };
  const fragment = (Object.keys(KEYS) as (keyof typeof KEYS)[])
    .filter((key) => values[key])
    .map((key) => `${key}=${encodeFragmentValue(values[key])}`)
    .join('&');
  return `${CONTACT_PAGE_URL}#${fragment}`;
}

/** Reads a contact back from a contact-page link, or returns null for any other URL. */
export function parseContactPageLink(url: string): ContactCard | null {
  if (!url.startsWith(`${CONTACT_PAGE_URL}#`)) return null;
  const values: Partial<Record<(typeof KEYS)[keyof typeof KEYS], string>> = {};
  for (const pair of url.slice(CONTACT_PAGE_URL.length + 1).split('&')) {
    const eq = pair.indexOf('=');
    const key = pair.slice(0, eq) as keyof typeof KEYS;
    if (eq === -1 || !(key in KEYS)) continue;
    try {
      values[KEYS[key]] = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      values[KEYS[key]] = pair.slice(eq + 1);
    }
  }
  const card: ContactCard = {
    givenName: values.givenName ?? '',
    familyName: values.familyName ?? '',
    fullName: [values.givenName, values.familyName].filter(Boolean).join(' '),
    organisation: values.organisation ?? '',
    jobTitle: '',
    phones: values.phone ? [{ number: values.phone, label: 'mobile' }] : [],
    emails: values.email ? [{ address: values.email, label: 'other' }] : [],
    urls: [],
  };
  return contactName(card) || card.phones.length || card.emails.length ? card : null;
}
