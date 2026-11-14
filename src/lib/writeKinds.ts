import type { IconName } from '@/components/Icon';

import type { WriteKind } from './ndef';

/** What the app can write, named the way people name it. */
export const WRITE_KINDS: { kind: WriteKind; icon: IconName; title: string; subtitle: string }[] = [
  { kind: 'link', icon: 'link', title: 'URL / Link', subtitle: 'Open a website or app' },
  { kind: 'text', icon: 'text', title: 'Text', subtitle: 'Write plain text' },
  { kind: 'phone', icon: 'phone', title: 'Phone number', subtitle: 'Offer to call a number' },
  { kind: 'email', icon: 'user', title: 'Email', subtitle: 'Start an email to an address' },
  { kind: 'wifi', icon: 'wifi', title: 'Wi-Fi', subtitle: 'Save and share Wi-Fi credentials' },
];
