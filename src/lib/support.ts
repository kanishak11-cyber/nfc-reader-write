/**
 * Which tag families this phone can read, write and format, and what to use instead when
 * it can't. Shown in the Diagnose tab and mirrored in the README.
 */
import { Platform } from 'react-native';

export type SupportLevel = 'full' | 'partial' | 'none';

export interface TagSupport {
  name: string;
  level: SupportLevel;
  detail: string;
}

const IOS: TagSupport[] = [
  { name: 'NTAG213 / 215 / 216', level: 'full', detail: 'Read, write, erase and diagnose. Blank tags are formatted automatically.' },
  {
    name: 'MIFARE Ultralight',
    level: 'full',
    detail: 'Read, write, erase and diagnose. Blank tags are formatted automatically; older chips need a second tap the first time.',
  },
  { name: 'NTAG 424 DNA', level: 'full', detail: 'Read, write and diagnose. Cards that still use the factory key can be reset.' },
  { name: 'ICODE / ISO 15693', level: 'full', detail: 'Read, write and erase. Blank tags are formatted automatically.' },
  {
    name: 'MIFARE DESFire',
    level: 'partial',
    detail: 'Read and write once it’s formatted. iPhones can’t format a blank card: write to it once on an Android phone, then use it here.',
  },
  {
    name: 'FeliCa',
    level: 'partial',
    detail: 'Read and write FeliCa Lite-S tags that are already NDEF formatted. No phone can format a blank FeliCa tag.',
  },
  {
    name: 'MIFARE Classic',
    level: 'none',
    detail: 'iPhones can’t detect MIFARE Classic at all. Use an Android phone with an NXP NFC chip.',
  },
];

const ANDROID: TagSupport[] = [
  { name: 'NTAG213 / 215 / 216', level: 'full', detail: 'Read, write, erase and diagnose. Blank tags are formatted automatically.' },
  {
    name: 'MIFARE Ultralight',
    level: 'full',
    detail: 'Read, write, erase and diagnose. Blank tags are formatted automatically; older chips may need a second tap.',
  },
  { name: 'NTAG 424 DNA', level: 'full', detail: 'Read, write and diagnose. Cards that still use the factory key can be reset.' },
  { name: 'ICODE / ISO 15693', level: 'full', detail: 'Read, write and erase. Blank tags are formatted automatically.' },
  {
    name: 'MIFARE DESFire',
    level: 'full',
    detail: 'Read and write. Blank EV1, EV2 and EV3 cards are formatted automatically, and then work on iPhones too.',
  },
  {
    name: 'FeliCa',
    level: 'partial',
    detail: 'Read and write FeliCa Lite-S tags that are already NDEF formatted. No phone can format a blank FeliCa tag.',
  },
  {
    name: 'MIFARE Classic',
    level: 'partial',
    detail:
      'Only on phones with an NXP NFC chip, and only cards with factory keys or already formatted. Phones with other chips, and all iPhones, can’t read it.',
  },
];

export function tagSupport(): TagSupport[] {
  return Platform.OS === 'ios' ? IOS : ANDROID;
}
