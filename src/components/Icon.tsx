import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** TapClay icons: original line icons on a 24px grid with 2px round strokes. */
type Shape = string | { c: [number, number, number]; fill?: boolean } | { r: [number, number, number, number, number] };

function gearPath(): string {
  const teeth = 8;
  const points: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const angle = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / 2 + Math.PI / (teeth * 4);
    const r = i % 4 === 0 || i % 4 === 1 ? 10 : 7.4;
    points.push(`${(12 + r * Math.cos(angle)).toFixed(2)} ${(12 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
}

const ICONS = {
  nfc: ['M9 9.2a4 4 0 0 1 0 5.6', 'M12.2 6.4a8 8 0 0 1 0 11.2', 'M15.4 3.6a12 12 0 0 1 0 16.8', { c: [5.6, 12, 1.4], fill: true }],
  wifi: ['M2.6 9.2a13.5 13.5 0 0 1 18.8 0', 'M5.6 12.6a9.2 9.2 0 0 1 12.8 0', 'M8.7 15.9a4.8 4.8 0 0 1 6.6 0', { c: [12, 19.2, 1.4], fill: true }],
  scan: ['M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9', 'M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9', 'M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15', 'M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15'],
  pencil: ['M4.5 19.5l1-4.2L16 4.8a2.1 2.1 0 0 1 3 3L8.6 18.4z', 'M14 6.8l3 3'],
  layers: ['M12 3.5l9 4.5-9 4.5-9-4.5z', 'M3 12.2l9 4.5 9-4.5', 'M3 16.2l9 4.5 9-4.5'],
  grid: [{ r: [4, 4, 7, 7, 2] }, { r: [13, 4, 7, 7, 2] }, { r: [4, 13, 7, 7, 2] }, { r: [13, 13, 7, 7, 2] }],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1', 'M3.5 4.5v4h4', 'M12 8v4.2l3 1.8'],
  wrench: ['M14.7 6.3a4.5 4.5 0 0 0 5.6 5.6l-1.8 1.8a4.5 4.5 0 0 1-5.2.9L6.6 21A2.1 2.1 0 0 1 3.6 18l6.4-6.7a4.5 4.5 0 0 1 .9-5.2l1.8-1.8z'],
  settings: [gearPath(), { c: [12, 12, 3] }],
  text: ['M5 7V4.5h14V7', 'M12 4.5v15', 'M9 19.5h6'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.1 1.1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.1-1.1'],
  user: [{ c: [12, 8, 4] }, 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  contact: [{ r: [3, 5, 18, 14, 2.5] }, { c: [9, 9.8, 1.8] }, 'M6 16.5a3 3 0 0 1 6 0', 'M14.5 10h3.5', 'M14.5 14h2.5'],
  code: ['M8 7l-5 5 5 5', 'M16 7l5 5-5 5', 'M13.8 4.5l-3.6 15'],
  chevron: ['M9.5 6l6 6-6 6'],
  back: ['M19 12H5.5', 'M11 6l-6 6 6 6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  lock: [{ r: [5, 10.5, 14, 10, 2.5] }, 'M8 10.5V8a4 4 0 0 1 8 0v2.5'],
  copy: [{ r: [9, 9, 11, 11, 2.5] }, 'M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9'],
  trash: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6.5 7l1 12.5h9l1-12.5'],
  alert: ['M12 3.5l9.5 16.5h-19z', 'M12 10v4.5', { c: [12, 17.3, 1.2], fill: true }],
  info: [{ c: [12, 12, 9] }, 'M12 11v5.5', { c: [12, 7.8, 1.2], fill: true }],
  phone: [{ r: [6.5, 2.5, 11, 19, 3] }, 'M10.5 18h3'],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, strokeWidth = 2, color }: { name: IconName; size?: number; strokeWidth?: number; color: string }) {
  const shapes: Shape[] = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {shapes.map((shape, i) => {
        if (typeof shape === 'string') return <Path key={i} d={shape} />;
        if ('c' in shape) {
          return <Circle key={i} cx={shape.c[0]} cy={shape.c[1]} r={shape.c[2]} fill={shape.fill ? color : 'none'} stroke={shape.fill ? 'none' : color} />;
        }
        return <Rect key={i} x={shape.r[0]} y={shape.r[1]} width={shape.r[2]} height={shape.r[3]} rx={shape.r[4]} />;
      })}
    </Svg>
  );
}
