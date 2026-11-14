import { Platform, useColorScheme } from 'react-native';

const light = {
  background: '#F2F3F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F6FA',
  text: '#0E1116',
  textMuted: '#5D6472',
  textSubtle: '#8A909C',
  border: '#E1E4EB',
  accent: '#2459E0',
  accentText: '#FFFFFF',
  accentSoft: '#E6EDFF',
  success: '#167A47',
  successSoft: '#E3F5EB',
  danger: '#C2312B',
  dangerSoft: '#FCE9E8',
  warning: '#9A5B00',
  warningSoft: '#FFF2DC',
  overlay: 'rgba(8, 10, 15, 0.45)',
};

const dark: typeof light = {
  background: '#0B0D12',
  surface: '#161A22',
  surfaceMuted: '#1D222C',
  text: '#F1F3F7',
  textMuted: '#A3AAB8',
  textSubtle: '#737B8A',
  border: '#272D39',
  accent: '#6E95FF',
  accentText: '#0B0D12',
  accentSoft: '#1C2742',
  success: '#4CC98A',
  successSoft: '#13291E',
  danger: '#FF7A72',
  dangerSoft: '#341615',
  warning: '#F5B451',
  warningSoft: '#33250F',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const mono = { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) } as const;
