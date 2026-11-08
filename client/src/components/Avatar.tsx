import { motion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';

// 12 original characters. Deliberately simple: flat colour, one outline weight,
// odd silhouettes, mismatched eyes, stick legs. The funny comes from the shapes.
export type Mood = 'idle' | 'happy' | 'sad' | 'shock' | 'wink';

const INK = '#1d1a24';
const SW = 3.5;

type Eye = [x: number, y: number, r: number];
interface Char {
  name: string;
  color: string;
  body: ReactNode | string; // path d, or custom SVG
  eyes: Eye[];
  look?: [number, number]; // pupil offset direction
  mouth: [x: number, y: number, w: number];
  idleMouth?: 'smile' | 'flat' | 'o' | 'wavy' | 'grin' | 'tongue';
  legs?: [x1: number, x2: number, top: number];
  extra?: ReactNode;
}

const C = (d: string, fill: string) => <path d={d} fill={fill} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;

export const AVATARS: Char[] = [
  { // noodle
    name: 'Noodle', color: '#ff7eb6',
    body: 'M48 14 C60 6 74 12 71 30 C68 52 75 70 72 92 C70 108 50 110 48 96 C46 76 40 56 42 34 C43 24 44 18 48 14Z',
    eyes: [[52, 30, 4.5], [64, 27, 7]], look: [1, 0], mouth: [58, 46, 8], idleMouth: 'o', legs: [52, 66, 104],
  },
  { // potato
    name: 'Spud', color: '#e3b778',
    body: 'M24 52 C20 30 44 18 62 22 C84 20 104 36 100 60 C104 84 86 104 60 102 C34 106 16 86 24 52Z',
    eyes: [[46, 52, 6], [74, 49, 10]], look: [-1, 1], mouth: [60, 76, 26], idleMouth: 'grin', legs: [44, 76, 100],
    extra: <g fill="#c99a58"><circle cx="34" cy="74" r="3" /><circle cx="86" cy="80" r="2.5" /><circle cx="70" cy="30" r="2" /></g>,
  },
  { // lopsided egg
    name: 'Eggbert', color: '#ffd23f',
    body: 'M58 12 C84 14 98 50 92 78 C86 102 60 108 42 100 C22 90 22 56 34 34 C40 22 48 12 58 12Z',
    eyes: [[52, 48, 13], [80, 54, 4]], look: [1, -1], mouth: [62, 82, 20], idleMouth: 'wavy', legs: [46, 72, 102],
  },
  { // pancake
    name: 'Flapjack', color: '#ff9a3c',
    body: 'M8 72 C8 56 32 48 60 48 C88 48 112 56 112 72 C112 88 88 96 60 96 C32 96 8 88 8 72Z',
    eyes: [[22, 68, 6], [98, 68, 6]], look: [0, 1], mouth: [60, 80, 6], idleMouth: 'o', legs: [42, 78, 95],
  },
  { // pear with a tiny head
    name: 'Pearl', color: '#7ed6a7',
    body: 'M60 14 C70 14 74 24 72 36 C70 46 96 58 98 82 C100 104 80 112 60 112 C40 112 20 104 22 82 C24 58 50 46 48 36 C46 24 50 14 60 14Z',
    eyes: [[55, 28, 4], [66, 28, 4]], look: [0, 0], mouth: [60, 40, 6], idleMouth: 'flat', legs: [48, 72, 110],
  },
  { // triangle cyclops
    name: 'Tri', color: '#b9a3f5',
    body: 'M60 10 L106 100 Q60 110 14 100 Z',
    eyes: [[60, 62, 13]], look: [-1, 0], mouth: [60, 88, 22], idleMouth: 'smile', legs: [44, 76, 104],
  },
  { // bean with a massive nose
    name: 'Schnoz', color: '#6ec3f4',
    body: 'M60 14 C86 14 98 38 96 66 C94 98 82 110 60 110 C38 110 24 98 24 66 C22 38 34 14 60 14Z',
    eyes: [[48, 42, 6], [72, 42, 6]], look: [1, 1], mouth: [60, 92, 18], idleMouth: 'flat', legs: [48, 72, 108],
    extra: <ellipse cx="60" cy="64" rx="13" ry="17" fill="#ff8fa3" stroke={INK} strokeWidth={SW} />,
  },
  { // brick with a unibrow
    name: 'Brick', color: '#ff5a4e',
    body: 'M24 24 H96 Q100 24 100 28 V100 Q100 104 96 104 H24 Q20 104 20 100 V28 Q20 24 24 24Z',
    eyes: [[46, 58, 5], [74, 58, 5]], look: [0, 0], mouth: [60, 82, 30], idleMouth: 'flat', legs: [44, 76, 104],
    extra: <path d="M34 46 Q60 38 86 46" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />,
  },
  { // long neck
    name: 'Stretch', color: '#3fb8af',
    body: (
      <g fill="#3fb8af" stroke={INK} strokeWidth={SW} strokeLinejoin="round">
        <ellipse cx="60" cy="94" rx="30" ry="14" />
        <rect x="54" y="34" width="12" height="54" rx="4" />
        <circle cx="60" cy="28" r="15" />
      </g>
    ),
    eyes: [[55, 26, 3.5], [66, 25, 5.5]], look: [1, 0], mouth: [60, 36, 6], idleMouth: 'o', legs: [46, 74, 106],
  },
  { // peanut
    name: 'Goober', color: '#ffb38a',
    body: 'M60 14 C82 14 90 34 82 50 C76 60 76 64 84 76 C96 96 80 112 60 112 C40 112 24 96 36 76 C44 64 44 60 38 50 C30 34 38 14 60 14Z',
    eyes: [[51, 34, 6], [69, 34, 6]], look: [-1, 0], mouth: [60, 86, 16], idleMouth: 'tongue', legs: [48, 72, 110],
  },
  { // melting blob
    name: 'Drip', color: '#8aa1ff',
    body: 'M20 60 C20 32 40 18 60 18 C80 18 100 32 100 60 L100 92 Q94 104 88 92 Q84 82 78 98 Q72 110 66 94 Q60 84 54 100 Q46 112 40 94 Q34 84 28 96 Q20 104 20 90 Z',
    eyes: [[46, 52, 7], [74, 55, 7]], look: [0, 1], mouth: [60, 74, 16], idleMouth: 'wavy',
  },
  { // wonky star
    name: 'Stuart', color: '#c3d34a',
    body: 'M60 8 L72 42 L110 40 L80 64 L94 104 L60 82 L24 106 L38 64 L8 44 L48 42 Z',
    eyes: [[52, 56, 5], [68, 55, 8]], look: [-1, -1], mouth: [60, 72, 10], idleMouth: 'smile', legs: [44, 76, 100],
  },
];

/** The show's host — a lanky noodle in a bow tie. */
const HOST: Char = {
  name: 'Host', color: '#fff3e0',
  body: 'M46 12 C60 2 76 10 72 30 C69 52 76 72 73 96 C71 112 49 114 47 98 C44 76 39 56 41 32 C42 22 42 16 46 12Z',
  eyes: [[51, 28, 5], [64, 26, 7]], look: [1, 0], mouth: [58, 44, 12], idleMouth: 'grin', legs: [52, 66, 108],
  extra: (
    <g>
      <path d="M48 58 L58 63 L48 68 Z M68 58 L58 63 L68 68 Z" fill="#ff5a4e" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M74 70 Q92 66 96 52" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="92" y="38" width="9" height="15" rx="4.5" fill="#444" stroke={INK} strokeWidth="3" />
    </g>
  ),
};

function Mouth({ x, y, w, kind }: { x: number; y: number; w: number; kind: string }) {
  const s = { fill: 'none', stroke: INK, strokeWidth: SW, strokeLinecap: 'round' as const };
  const h = Math.max(w, 10) / 2;
  switch (kind) {
    case 'flat':
      return <path d={`M${x - h} ${y} H${x + h}`} {...s} />;
    case 'o':
      return <ellipse cx={x} cy={y} rx={Math.max(3, w / 2.5)} ry={Math.max(4, w / 2)} fill={INK} />;
    case 'wavy':
      return <path d={`M${x - h} ${y} q${h / 2} -5 ${h} 0 t${h} 0`} {...s} />;
    case 'grin':
      return <path d={`M${x - h} ${y - 2} Q${x} ${y + h * 0.9} ${x + h} ${y - 2} Z`} fill="#fff" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;
    case 'tongue':
      return (
        <g>
          <path d={`M${x - h} ${y} Q${x} ${y + 8} ${x + h} ${y}`} {...s} />
          <path d={`M${x + 1} ${y + 3} q4 10 9 2`} fill="#ff6f8a" stroke={INK} strokeWidth="2.5" />
        </g>
      );
    case 'happy':
      return <path d={`M${x - h - 2} ${y - 3} Q${x} ${y + h + 8} ${x + h + 2} ${y - 3} Z`} fill={INK} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;
    case 'sad':
      return <path d={`M${x - h} ${y + 4} Q${x} ${y - 6} ${x + h} ${y + 4}`} {...s} />;
    default:
      return <path d={`M${x - h} ${y - 2} Q${x} ${y + 7} ${x + h} ${y - 2}`} {...s} />;
  }
}

function Figure({ c, mood }: { c: Char; mood: Mood }) {
  const [lx, ly] = c.look ?? [0, 0];
  const mouthKind = mood === 'idle' ? c.idleMouth ?? 'smile' : mood === 'shock' ? 'o' : mood === 'wink' ? 'smile' : mood;
  return (
    <g>
      {c.legs && (
        <g stroke={INK} strokeWidth={SW} strokeLinecap="round">
          <path d={`M${c.legs[0]} ${c.legs[2] - 4} V${c.legs[2] + 14}`} />
          <path d={`M${c.legs[1]} ${c.legs[2] - 4} V${c.legs[2] + 14}`} />
          <path d={`M${c.legs[0] - 7} ${c.legs[2] + 15} H${c.legs[0] + 2}`} />
          <path d={`M${c.legs[1] - 2} ${c.legs[2] + 15} H${c.legs[1] + 7}`} />
        </g>
      )}
      {typeof c.body === 'string' ? C(c.body, c.color) : c.body}
      {c.extra}
      {c.eyes.map(([x, y, r], i) => {
        const closed = mood === 'happy' || (mood === 'wink' && i === c.eyes.length - 1 && c.eyes.length > 1);
        if (closed) return <path key={i} d={`M${x - r} ${y + 1} Q${x} ${y - r} ${x + r} ${y + 1}`} fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" />;
        const rr = mood === 'shock' ? r * 1.2 : r;
        const pr = Math.max(1.8, rr * 0.42);
        const off = rr - pr - 1;
        const py = mood === 'sad' ? off : ly * off * 0.7;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={rr} fill="#fff" stroke={INK} strokeWidth={Math.min(SW, 1 + r * 0.35)} />
            <circle cx={x + lx * off * 0.7} cy={y + py} r={pr} fill={INK} />
          </g>
        );
      })}
      {mood === 'sad' &&
        c.eyes.slice(0, 2).map(([x, y, r], i) => (
          <path key={`b${i}`} d={`M${x - r} ${y - r - 3 + (i ? 3 : -3) * 0} L${x + r} ${y - r - 3 + (i ? -3 : 3)}`} stroke={INK} strokeWidth="3" strokeLinecap="round" />
        ))}
      <Mouth x={c.mouth[0]} y={c.mouth[1]} w={c.mouth[2]} kind={mouthKind} />
    </g>
  );
}

export function Avatar({ id, size = 96, mood = 'idle', bob = false, style, className }: { id: number; size?: number | string; mood?: Mood; bob?: boolean; style?: CSSProperties; className?: string }) {
  const c = AVATARS[((id % AVATARS.length) + AVATARS.length) % AVATARS.length];
  return (
    <motion.svg
      viewBox="0 0 120 130"
      width={size}
      height={size}
      className={className}
      style={{ overflow: 'visible', transformOrigin: '50% 100%', ...style }}
      animate={bob ? { scaleY: [1, 0.93, 1.03, 1], scaleX: [1, 1.05, 0.98, 1] } : undefined}
      transition={bob ? { duration: 1.6 + (id % 4) * 0.25, repeat: Infinity, ease: 'easeInOut' } : undefined}
      aria-label={c.name}
      role="img"
    >
      <Figure c={c} mood={mood} />
    </motion.svg>
  );
}

export function SvgDefs() {
  return null;
}

/** The host character, used for big reactions on screen. */
export function Mascot({ mood = 'idle', size = 200 }: { mood?: Mood; size?: number | string }) {
  return (
    <motion.svg
      viewBox="0 0 120 130"
      width={size}
      height={size}
      style={{ overflow: 'visible', transformOrigin: '50% 100%' }}
      animate={mood === 'happy' ? { rotate: [-5, 5, -5] } : { scaleY: [1, 0.96, 1] }}
      transition={{ duration: mood === 'happy' ? 0.5 : 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <Figure c={HOST} mood={mood} />
    </motion.svg>
  );
}
