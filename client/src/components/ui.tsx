import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { audioPrefs, audioReady, onAudioChange, setMuted, setMusicEnabled, setVolume, sfx, unlockAudio } from '../audio';
import { now } from '../net';
import type { TimerView } from '../../../shared/types';

export type Theme = 'menu' | 'r1' | 'r2' | 'r3' | 'final' | 'win' | 'fib' | 'doodle' | 'who';

export const themeForRound = (round: number): Theme => (round >= 4 ? 'final' : round === 3 ? 'r3' : round === 2 ? 'r2' : 'r1');

/** Flat, colour-coded stage. Each round gets its own colour. */
export function Stage({ theme, children, className = '' }: { theme: Theme; children: ReactNode; className?: string }) {
  return (
    <div className={`stage theme-${theme} ${className}`}>
      <div className="stage-spot" />
      <div className="stage-content">{children}</div>
    </div>
  );
}

export function Logo({ size = 1, animated = true }: { size?: number; animated?: boolean }) {
  const whip = { duration: 0.45, ease: [0.2, 0.9, 0.3, 1.2] as [number, number, number, number] };
  return (
    <div className="logo" style={{ fontSize: `calc(var(--u) * ${size})` }} aria-label="Noor's Whiplash">
      <motion.span className="logo-top" initial={animated ? { y: -20, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35, duration: 0.4 }}>
        Noor’s
      </motion.span>
      <span className="logo-whip">
        <motion.span className="logo-trail t2" aria-hidden initial={animated ? { x: '60%', opacity: 0 } : false} animate={{ x: 0, opacity: 0.35 }} transition={{ ...whip, delay: 0.06 }}>WHIPLASH</motion.span>
        <motion.span className="logo-trail t1" aria-hidden initial={animated ? { x: '60%', opacity: 0 } : false} animate={{ x: 0, opacity: 0.6 }} transition={{ ...whip, delay: 0.03 }}>WHIPLASH</motion.span>
        <motion.span className="logo-main" initial={animated ? { x: '60%', opacity: 0 } : false} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}>WHIPLASH</motion.span>
      </span>
    </div>
  );
}

/** Countdown ring. Ticks in the final 5 seconds. */
export function TimerRing({ timer, size = 120, tick = true, paused }: { timer: TimerView | null; size?: number | string; tick?: boolean; paused?: boolean }) {
  const [left, setLeft] = useState(0);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (!timer) return;
    let raf = 0;
    const loop = () => {
      const ms = Math.max(0, timer.deadline - now());
      setLeft(ms);
      const s = Math.ceil(ms / 1000);
      if (tick && !paused && s <= 5 && s > 0 && s !== lastTick.current) {
        lastTick.current = s;
        sfx('tick');
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [timer?.deadline, timer?.duration, tick, paused]);
  if (!timer) return null;
  const frac = Math.min(1, left / timer.duration);
  const secs = Math.ceil(left / 1000);
  const urgent = secs <= 5;
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <motion.div
      className={`timer-ring ${urgent ? 'urgent' : ''}`}
      style={{ width: size, height: size }}
      animate={urgent ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 0.5, repeat: Infinity } : {}}
    >
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="var(--ink)" />
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={urgent ? '#ff4f5a' : 'var(--accent-c)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span>{paused ? '❚❚' : secs}</span>
    </motion.div>
  );
}

/** Thin bar version for phones. */
export function TimerBar({ timer }: { timer: TimerView | null }) {
  const [frac, setFrac] = useState(1);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!timer) return;
    let raf = 0;
    const loop = () => {
      const ms = Math.max(0, timer.deadline - now());
      setFrac(Math.min(1, ms / timer.duration));
      setSecs(Math.ceil(ms / 1000));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [timer?.deadline, timer?.duration]);
  if (!timer) return null;
  return (
    <div className={`timer-bar ${secs <= 5 ? 'urgent' : ''}`}>
      <div className="timer-bar-fill" style={{ transform: `scaleX(${frac})` }} />
      <span>{secs}s</span>
    </div>
  );
}

export function CountUp({ from = 0, to, duration = 1.4, delay = 0, prefix = '', onDone }: { from?: number; to: number; duration?: number; delay?: number; prefix?: string; onDone?: () => void }) {
  const mv = useMotionValue(from);
  const text = useTransform(mv, (v) => `${prefix}${Math.round(v).toLocaleString()}`);
  useEffect(() => {
    const c = animate(mv, to, { duration, delay, ease: 'easeOut', onComplete: onDone });
    return () => c.stop();
  }, [to, from]);
  return <motion.span>{text}</motion.span>;
}

/** Canvas confetti burst — lightweight, no dependencies. */
export function Confetti({ bursts = 3 }: { bursts?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const colors = ['#ff4f9a', '#ffd23f', '#2fd6f0', '#9be15d', '#a77bff', '#ff8a3d', '#fff'];
    type P = { x: number; y: number; vx: number; vy: number; r: number; w: number; h: number; c: string; vr: number; shape: number };
    let ps: P[] = [];
    const resize = () => {
      c.width = c.clientWidth * devicePixelRatio;
      c.height = c.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);
    const burst = (x: number) => {
      for (let i = 0; i < 160; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const sp = (8 + Math.random() * 14) * devicePixelRatio;
        ps.push({ x: x * c.width, y: c.height, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 1.6, r: Math.random() * 6, w: (6 + Math.random() * 8) * devicePixelRatio, h: (10 + Math.random() * 10) * devicePixelRatio, c: colors[i % colors.length], vr: (Math.random() - 0.5) * 0.4, shape: i % 3 });
      }
    };
    const timers = [...Array(bursts)].map((_, i) => setTimeout(() => burst([0.2, 0.8, 0.5, 0.35, 0.65][i % 5]), i * 450));
    const rain = setInterval(() => {
      for (let i = 0; i < 6; i++) ps.push({ x: Math.random() * c.width, y: -20, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: 0, w: 10 * devicePixelRatio, h: 14 * devicePixelRatio, c: colors[Math.floor(Math.random() * colors.length)], vr: (Math.random() - 0.5) * 0.3, shape: i % 3 });
    }, 120);
    let raf = 0;
    const loop = () => {
      g.clearRect(0, 0, c.width, c.height);
      ps = ps.filter((p) => p.y < c.height + 40);
      for (const p of ps) {
        p.vy += 0.35 * devicePixelRatio;
        p.vx *= 0.99;
        p.vy = Math.min(p.vy, 7 * devicePixelRatio);
        p.x += p.vx + Math.sin(p.y / 40);
        p.y += p.vy;
        p.r += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.fillStyle = p.c;
        if (p.shape === 0) g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        else if (p.shape === 1) {
          g.beginPath();
          g.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          g.fill();
        } else {
          g.beginPath();
          g.moveTo(0, -p.h / 2);
          g.lineTo(p.w / 2, p.h / 2);
          g.lineTo(-p.w / 2, p.h / 2);
          g.fill();
        }
        g.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      clearInterval(rain);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden />;
}

export function useAudioPrefs() {
  const [, force] = useState(0);
  useEffect(() => {
    const off = onAudioChange(() => force((n) => n + 1));
    return () => void off();
  }, []);
  return { ...audioPrefs(), ready: audioReady() };
}

export function SoundControls({ compact = false }: { compact?: boolean }) {
  const p = useAudioPrefs();
  const [open, setOpen] = useState(false);
  return (
    <div className={`sound-controls ${compact ? 'compact' : ''}`}>
      <button
        className="icon-btn"
        aria-label={p.muted ? 'Unmute' : 'Mute'}
        onClick={() => {
          unlockAudio();
          if (!p.ready) return setMuted(false);
          setMuted(!p.muted);
        }}
      >
        <SpeakerIcon off={!p.ready || p.muted} />
      </button>
      {!compact && (
        <button className="icon-btn" aria-label="Sound settings" onClick={() => (unlockAudio(), setOpen(!open))}>
          <GearIcon />
        </button>
      )}
      {!p.ready && !compact && <span className="sound-hint">Click for sound</span>}
      {open && (
        <motion.div className="sound-panel" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <label>
            Volume
            <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </label>
          <label className="check">
            <input type="checkbox" checked={p.music} onChange={(e) => setMusicEnabled(e.target.checked)} /> Music
          </label>
        </motion.div>
      )}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'primary', disabled, className = '', big }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; className?: string; big?: boolean }) {
  return (
    <motion.button
      className={`btn btn-${variant} ${big ? 'btn-big' : ''} ${className}`}
      whileHover={disabled ? undefined : { scale: 1.05, rotate: -1 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      disabled={disabled}
      onClick={() => {
        unlockAudio();
        sfx('click');
        onClick?.();
      }}
    >
      {children}
    </motion.button>
  );
}

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {off ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </svg>
  );
}
export function Crown({ size = 40 }: { size?: number | string }) {
  return (
    <svg className="crown-svg" viewBox="0 0 60 40" width={size} height={size}>
      <path d="M6 34 L4 8 L18 20 L30 4 L42 20 L56 8 L54 34 Z" fill="#ffd23f" stroke="#1d1a24" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}
