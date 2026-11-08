// Building blocks shared by the newer games (Fib Factory, Doodle Duel, Who Dunnit?).
import { motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import type { PublicPlayer } from '../../../shared/types';
import { sfx, vibrate } from '../audio';
import { Avatar, Mascot, type Mood } from '../components/Avatar';
import { Btn } from '../components/ui';
import { emit } from '../net';

export const byId = (players: PublicPlayer[]) => Object.fromEntries(players.map((p) => [p.id, p])) as Record<string, PublicPlayer>;

/** Game name in the slanted speed-trail style. */
export function GameTitle({ name, size = 1 }: { name: string; size?: number }) {
  return (
    <div className="game-title" style={{ fontSize: `calc(var(--u) * ${size})` }}>
      <span className="logo-whip">
        <motion.span className="logo-trail t2" aria-hidden initial={{ x: '40%', opacity: 0 }} animate={{ x: 0, opacity: 0.35 }} transition={{ duration: 0.45, delay: 0.06 }}>{name}</motion.span>
        <motion.span className="logo-trail t1" aria-hidden initial={{ x: '40%', opacity: 0 }} animate={{ x: 0, opacity: 0.6 }} transition={{ duration: 0.45, delay: 0.03 }}>{name}</motion.span>
        <motion.span className="logo-main" initial={{ x: '40%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}>{name}</motion.span>
      </span>
    </div>
  );
}

export interface Rule {
  art: number[];
  title: string;
  text: string;
}

export function GameIntro({ name, rules, strip }: { name: string; rules: Rule[]; strip?: ReactNode }) {
  return (
    <div className="intro">
      <GameTitle name={name} size={0.75} />
      <div className="rules">
        {rules.map((r, i) => (
          <motion.div key={r.title} className={`rule-card rule-${i}`} initial={{ y: 200, opacity: 0, rotate: -10 }} animate={{ y: 0, opacity: 1, rotate: [-2, 2, -1][i] }} transition={{ delay: 1.2 + i * 0.6, type: 'spring', stiffness: 200, damping: 14 }}>
            <span className="rule-num">{i + 1}</span>
            <div className="rule-art">{r.art.map((a) => <Avatar key={a} id={a} size="calc(var(--u) * 8)" bob />)}</div>
            <h3>{r.title}</h3>
            <p>{r.text}</p>
          </motion.div>
        ))}
      </div>
      {strip && (
        <motion.div className="scoring-strip" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.4 }}>
          {strip}
        </motion.div>
      )}
    </div>
  );
}

/** Row of player avatars with done / waiting status. */
export function StatusRow({ players, done, doneLabel = 'Done', waitLabel = 'thinking…' }: { players: PublicPlayer[]; done: Set<string>; doneLabel?: string; waitLabel?: string }) {
  return (
    <div className="writers">
      {players.map((p, i) => {
        const d = done.has(p.id);
        return (
          <motion.div key={p.id} className={`writer ${d ? 'done' : ''} ${p.connected ? '' : 'offline'}`} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.05 }}>
            <motion.div animate={d ? { y: [0, -24, 0] } : { rotate: [-3, 3, -3] }} transition={d ? { duration: 0.5 } : { duration: 0.6, repeat: Infinity }}>
              <Avatar id={p.avatar} size="100%" mood={d ? 'happy' : 'idle'} />
            </motion.div>
            <span className="writer-name">{p.name}</span>
            <span className="writer-status">{d ? doneLabel : p.connected ? waitLabel : 'away'}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

export function VoteDots({ voted, eligible }: { voted: number; eligible: number }) {
  return (
    <div className="vote-dots">
      {Array.from({ length: eligible }, (_, i) => (
        <motion.span key={i} className={`vdot ${i < voted ? 'in' : ''}`} animate={i < voted ? { scale: [1, 1.5, 1] } : {}} />
      ))}
      <span className="vote-count">{voted}/{eligible}</span>
    </div>
  );
}

// ---------------- phone pieces ----------------
export function PhoneLookUp({ title, sub, mood = 'idle', children }: { title: string; sub?: string; mood?: Mood; children?: ReactNode }) {
  return (
    <div className="phone-center">
      <Mascot mood={mood} size={130} />
      <h1>{title}</h1>
      {sub && <p className="lookup-sub">{sub}</p>}
      {children}
      <p className="muted tv-hint">Eyes on the TV</p>
    </div>
  );
}

/** Prompt card + text box + send, wired to `game:action`. */
export function TextAction({ prompt, label, placeholder, type, max = 50, done, doneView, extra }: { prompt: ReactNode; label?: string; placeholder: string; type: string; max?: number; done: boolean; doneView: ReactNode; extra?: Record<string, unknown> }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  if (done) return <>{doneView}</>;
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ack = await emit('game:action', { type, text, ...extra });
    setSending(false);
    if (!ack.ok) return setError(ack.error ?? 'Could not send.');
    setError('');
    sfx('submit');
    vibrate(25);
  };
  return (
    <div className="write-panel">
      {label && <span className="step-chip">{label}</span>}
      <motion.div className="prompt-card" initial={{ rotate: -4, scale: 0.85 }} animate={{ rotate: -1, scale: 1 }}>
        {prompt}
      </motion.div>
      <textarea className="answer-input" value={text} maxLength={max} placeholder={placeholder} rows={2} autoFocus enterKeyHint="send" onChange={(e) => setText(e.target.value.replace(/\n/g, ''))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), send())} />
      <div className="answer-meta"><span>{text.length}/{max}</span></div>
      {error && <p className="error">{error}</p>}
      <Btn big disabled={!text.trim() || sending} onClick={send}>{sending ? 'Sending…' : 'Send it'}</Btn>
    </div>
  );
}

/** Renders "___" in a prompt as a highlighted blank. */
export function Blank({ text }: { text: string }) {
  const parts = text.split('___');
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="blank">______</span>}
        </span>
      ))}
    </>
  );
}
