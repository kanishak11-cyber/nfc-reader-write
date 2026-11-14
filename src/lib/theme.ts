/**
 * TapClay design tokens: puffy clay surfaces on lavender, one violet gradient for the
 * action that matters, navy type. The app ships the Lavender (light) theme only; the
 * Midnight tokens stay here so the design system's second theme is one line away.
 */
import { Platform, type TextStyle } from 'react-native';

const violet = {
  violet300: '#9a6cf5',
  violet400: '#7c5cf0',
  violet500: '#6650ee',
  violet600: '#5b45e6',
  onViolet: '#ffffff',
};

const lavender = {
  ...violet,
  bg: '#e9e8fd',
  surface: '#f4f3fe',
  surfaceTint: '#e4defd',
  surfaceSunk: '#dddcf7',
  ink: '#0b0c3a',
  inkMuted: '#45476f',
  line: '#d2cff3',
  lineStrong: '#6f6bb0',
  violetInk: '#4c35ea',
  success: '#0d6a4c',
  successSoft: '#c9f0de',
  danger: '#a81c36',
  dangerSoft: '#ffd9de',
  warning: '#7d5200',
  warningSoft: '#ffe7b3',
  /** Behind bottom sheets. */
  scrim: 'rgba(11, 12, 58, 0.45)',
  /** Clay = one soft outer drop plus a light rim on top and a tinted shade at the bottom. */
  claySm: '0 6px 12px -4px rgba(80,70,180,0.30), inset 0 -3px 6px rgba(110,96,220,0.18), inset 0 3px 6px rgba(255,255,255,0.95)',
  clayMd: '0 12px 24px -10px rgba(80,70,180,0.38), inset 0 -4px 10px rgba(110,96,220,0.16), inset 0 4px 10px rgba(255,255,255,1)',
  clayLg: '0 24px 44px -16px rgba(80,70,180,0.45), inset 0 -8px 16px rgba(110,96,220,0.18), inset 0 8px 16px rgba(255,255,255,1)',
  clayViolet: '0 18px 32px -12px rgba(91,69,230,0.65), inset 0 -6px 12px rgba(40,20,140,0.35), inset 0 6px 12px rgba(255,255,255,0.40)',
  clayPressed: 'inset 0 4px 10px rgba(80,70,180,0.30), inset 0 -2px 6px rgba(255,255,255,0.70)',
  clayWell: 'inset 0 3px 8px rgba(80,70,180,0.24), inset 0 -2px 4px rgba(255,255,255,0.90)',
};

const midnight: typeof lavender = {
  ...violet,
  bg: '#16173d',
  surface: '#20224f',
  surfaceTint: '#2b2c66',
  surfaceSunk: '#121333',
  ink: '#f2f1ff',
  inkMuted: '#b5b6de',
  line: '#34366f',
  lineStrong: '#7c7ec4',
  violetInk: '#b8a7ff',
  success: '#6ee0b0',
  successSoft: '#123f33',
  danger: '#ff8f9f',
  dangerSoft: '#4a1622',
  warning: '#ffc95c',
  warningSoft: '#47330a',
  scrim: 'rgba(0, 0, 0, 0.6)',
  claySm: '0 6px 12px -4px rgba(0,0,0,0.55), inset 0 -3px 6px rgba(0,0,0,0.30), inset 0 3px 6px rgba(255,255,255,0.10)',
  clayMd: '0 12px 24px -10px rgba(0,0,0,0.60), inset 0 -4px 10px rgba(0,0,0,0.30), inset 0 4px 10px rgba(255,255,255,0.09)',
  clayLg: '0 24px 44px -16px rgba(0,0,0,0.70), inset 0 -8px 16px rgba(0,0,0,0.32), inset 0 8px 16px rgba(255,255,255,0.10)',
  clayViolet: '0 18px 32px -12px rgba(0,0,0,0.70), inset 0 -6px 12px rgba(40,20,140,0.40), inset 0 6px 12px rgba(255,255,255,0.30)',
  clayPressed: 'inset 0 4px 10px rgba(0,0,0,0.55), inset 0 -2px 6px rgba(255,255,255,0.06)',
  clayWell: 'inset 0 3px 8px rgba(0,0,0,0.60), inset 0 -2px 4px rgba(255,255,255,0.05)',
};

export type Theme = typeof lavender;

export const themes = { lavender, midnight };

/** Always Lavender: the app is light-only, whatever the phone is set to. */
export function useTheme(): Theme {
  return themes.lavender;
}

/** Brand gradient: 140° on cards, 100° on buttons. */
export const gradient = {
  card: `linear-gradient(140deg, ${violet.violet300} 0%, ${violet.violet400} 38%, ${violet.violet600} 100%)`,
  button: `linear-gradient(100deg, ${violet.violet400} 0%, ${violet.violet500} 50%, ${violet.violet600} 100%)`,
  /** Meter fill and the switched-on toggle track. */
  bar: `linear-gradient(90deg, ${violet.violet400} 0%, ${violet.violet600} 100%)`,
};

export const radius = { sm: 16, md: 24, lg: 30, xl: 48, pill: 999 } as const;
/** space-1…space-10 of the design system. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;

/** Plus Jakarta Sans, weights 500, 700 and 800 only (loaded in the root layout). */
export const font = {
  medium: 'PlusJakartaSans_500Medium',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const mono = { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) } as const;

export const type = {
  display: { fontFamily: font.extraBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.64 },
  title: { fontFamily: font.extraBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.26 },
  heading: { fontFamily: font.extraBold, fontSize: 21, lineHeight: 28 },
  bodyStrong: { fontFamily: font.bold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: font.medium, fontSize: 16, lineHeight: 24 },
  /** Compact row titles and summary values. */
  label: { fontFamily: font.bold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  /** Small group headings: "Recent", "Today". */
  group: { fontFamily: font.bold, fontSize: 14, lineHeight: 20 },
  micro: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  mono: { ...mono, fontSize: 14, lineHeight: 20 },
} satisfies Record<string, TextStyle>;
