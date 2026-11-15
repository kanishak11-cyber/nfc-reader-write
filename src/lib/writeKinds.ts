import type { IconName } from '@/components/Icon';

import type { WriteKind } from './ndef';

/** What the app can write, named the way people name it. */
export const WRITE_KINDS: { kind: WriteKind; icon: IconName; title: string; subtitle: string }[] = [
  { kind: 'link', icon: 'link', title: 'URL / Link', subtitle: 'Open a website or app' },
  { kind: 'text', icon: 'text', title: 'Text', subtitle: 'Show a short note' },
  { kind: 'phone', icon: 'phone', title: 'Phone number', subtitle: 'Start a call with one tap' },
  { kind: 'contact', icon: 'contact', title: 'Contact card', subtitle: 'Let people save your number' },
  { kind: 'email', icon: 'user', title: 'Email', subtitle: 'Start an email to an address' },
  { kind: 'wifi', icon: 'wifi', title: 'Wi-Fi', subtitle: 'Join a network on Android' },
];
