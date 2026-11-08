import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { HostView, PlayerView } from '../../../shared/types';
import { sfx, vibrate } from '../audio';
import { Avatar } from '../components/Avatar';
import { CountUp, TimerRing } from '../components/ui';
import { emit } from '../net';
import { Blank, byId, GameIntro, PhoneLookUp, StatusRow, TextAction, VoteDots } from './common';

const qLabel = (v: { round: number; totalRounds: number; multiplier: number }) => `Question ${v.round} of ${v.totalRounds} · ×${v.multiplier} points`;

export function FibHost({ v }: { v: HostView }) {
  const d = v.data ?? {};
  const players = byId(v.players);
  switch (v.phase) {
    case 'intro':
      return (
        <GameIntro
          name="FIB FACTORY"
          rules={[
            { art: [5], title: 'Lie', text: 'A weird TRUE fact appears with a blank. Write a fake answer that sounds real.' },
            { art: [2, 9], title: 'Detect', text: 'Your lies get mixed with the truth. Pick the one you think is real.' },
            { art: [0, 3, 8], title: 'Score', text: '+1,000 for finding the truth. +500 for every friend your lie fools.' },
          ]}
          strip={<><span>Points grow:</span><b className="mult m1">Q1–2 ×1</b><b className="mult m2">Q3–4 ×2</b><b className="mult mf">Q5 ×3</b></>}
        />
      );
    case 'question':
      return (
        <div className="fib-question">
          <span className="matchup-count">{qLabel(v)}</span>
          <motion.div className="fib-card" initial={{ scale: 0.6, rotate: -6, opacity: 0 }} animate={{ scale: 1, rotate: -1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }}>
            <Blank text={d.question} />
          </motion.div>
          <p className="hint-line">This is 100% true. Get ready to lie about it.</p>
        </div>
      );
    case 'lie':
      return (
        <div className="writing">
          <div className="writing-head">
            <div>
              <span className="matchup-count">{qLabel(v)}</span>
              <h1 className="big-head">Write a lie on your phone</h1>
            </div>
            <TimerRing timer={v.timer} size="calc(var(--u) * 11)" paused={v.paused} />
          </div>
          <div className="fib-card small"><Blank text={d.question} /></div>
          <StatusRow players={v.players} done={new Set(d.done ?? [])} doneLabel="Lied" waitLabel="scheming…" />
        </div>
      );
    case 'pick':
      return (
        <div className="final-board">
          <div className="final-top">
            <div className="fib-card small"><Blank text={d.question} /></div>
            <TimerRing timer={v.timer} size="calc(var(--u) * 8)" paused={v.paused} />
          </div>
          <div className="final-grid" style={{ gridTemplateColumns: `repeat(${d.options.length <= 4 ? 2 : d.options.length <= 6 ? 3 : 4}, 1fr)` }}>
            {d.options.map((o: any, i: number) => (
              <motion.div key={o.key} className={`final-card fc-${i % 5}`} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.12 }}>
                <span className="final-letter">{String.fromCharCode(65 + i)}</span>
                <p>{o.text}</p>
              </motion.div>
            ))}
          </div>
          <div className="matchup-bottom">
            <VoteDots voted={d.picked} eligible={d.eligible} />
            <span className="hint-line">Which one is the truth? Pick on your phone.</span>
          </div>
        </div>
      );
    case 'reveal':
      return <FibReveal v={v} />;
  }
  return null;
}

function FibReveal({ v }: { v: HostView }) {
  const d = v.data;
  const players = byId(v.players);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ms = (v.timer?.duration ?? 10000) / (d.order.length * d.perOption + 5) * d.perOption;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, d.order.length)), ms);
    return () => clearInterval(t);
  }, []);
  const current = d.options.find((o: any) => o.key === d.order[Math.min(step, d.order.length - 1)]);
  useEffect(() => {
    if (!current) return;
    if (current.truth) sfx('sweep');
    else sfx(current.pickers.length ? 'buzz' : 'whoosh');
  }, [current?.key]);
  if (!current) return null;
  return (
    <div className="fib-reveal">
      <div className="fib-card small"><Blank text={d.question} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={current.key} className="fib-step" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ x: -400, opacity: 0 }} transition={{ duration: 0.3 }}>
          <motion.div className={`fib-answer ${current.truth ? 'truth' : 'lie'}`} initial={{ scale: 0.5, rotate: -8 }} animate={{ scale: 1, rotate: current.truth ? 0 : -2 }} transition={{ type: 'spring', stiffness: 220, damping: 15 }}>
            <span className="fib-answer-text">{current.text}</span>
            <motion.span className="stamp" initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1, rotate: current.truth ? 8 : -12 }} transition={{ delay: 0.6 }}>
              {current.truth ? 'THE TRUTH' : 'A LIE'}
            </motion.span>
          </motion.div>
        <div className="fib-people">
          <div className="fib-col">
            <span className="fib-col-label">{current.truth ? 'Found it' : 'Fell for it'}</span>
            <div className="fib-avatars">
              {current.pickers.length === 0 && <span className="muted">nobody</span>}
              {current.pickers.map((id: string) => players[id] && (
                <motion.div key={id} className="fib-person" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <Avatar id={players[id].avatar} size="calc(var(--u) * 6)" mood={current.truth ? 'happy' : 'shock'} />
                  <span>{players[id].name}</span>
                  {current.truth && <b className="gain-chip">+{(1000 * v.multiplier).toLocaleString()}</b>}
                </motion.div>
              ))}
            </div>
          </div>
          {!current.truth && (
            <div className="fib-col">
              <span className="fib-col-label">Lie written by</span>
              <div className="fib-avatars">
                {current.authors.map((id: string) => players[id] && (
                  <motion.div key={id} className="fib-person" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9 }}>
                    <Avatar id={players[id].avatar} size="calc(var(--u) * 6)" mood="wink" />
                    <span>{players[id].name}</span>
                    <b className="gain-chip">+<CountUp to={500 * v.multiplier * current.pickers.length} delay={1} /></b>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function FibPhone({ v }: { v: PlayerView }) {
  const d = v.data ?? {};
  switch (v.phase) {
    case 'intro':
      return <PhoneLookUp title="Fib Factory" sub="Rules are on the TV. Start practising your poker face." mood="wink" />;
    case 'question':
      return <PhoneLookUp title={`Question ${v.round}`} sub="Read the fact on the TV." />;
    case 'lie':
      return (
        <TextAction
          key={v.round}
          type="lie"
          max={50}
          label={`Question ${v.round} of ${v.totalRounds}`}
          prompt={<Blank text={d.question} />}
          placeholder="Your convincing lie…"
          done={!!d.myLie}
          doneView={<PhoneLookUp title="Lie locked in" sub={`“${d.myLie}”. Let’s see who bites.`} mood="wink" />}
        />
      );
    case 'pick':
      return <FibPick v={v} />;
    case 'reveal':
      return (
        <PhoneLookUp
          title={d.result === 'truth' ? 'You found the truth!' : d.result === 'fooled' ? 'You got played.' : 'You didn’t pick.'}
          sub={`The truth: “${d.truth}”${d.fooledCount ? ` · Your lie fooled ${d.fooledCount} ${d.fooledCount === 1 ? 'person' : 'people'}` : ''}`}
          mood={d.result === 'truth' ? 'happy' : 'sad'}
        >
          {d.gain > 0 && <p className="gain-line">+{d.gain.toLocaleString()}</p>}
        </PhoneLookUp>
      );
  }
  return null;
}

function FibPick({ v }: { v: PlayerView }) {
  const d = v.data;
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const chosen = d.myPick ?? pending;
  const pick = async (key: string) => {
    if (!d.canPick || pending) return;
    setPending(key);
    const ack = await emit('game:action', { type: 'pick', choice: key });
    if (!ack.ok) return setPending(null), setError(ack.error ?? 'Could not pick.');
    sfx('vote');
    vibrate(30);
  };
  return (
    <div className="vote-panel">
      <p className="vote-prompt"><Blank text={d.question} /></p>
      <h2 className="vote-head">{chosen ? 'Locked in' : 'Which one is TRUE?'}</h2>
      <div className="vote-options many">
        {d.options.map((o: any, i: number) => (
          <motion.button key={o.key} className={`vote-btn vb-${i % 5} ${chosen === o.key ? 'chosen' : ''} ${chosen && chosen !== o.key ? 'faded' : ''} ${o.mine ? 'mine' : ''}`} disabled={o.mine || !d.canPick || !!pending} onClick={() => pick(o.key)} whileTap={{ scale: 0.95 }}>
            {o.text}
            {o.mine && <span className="mine-tag">your lie</span>}
          </motion.button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
