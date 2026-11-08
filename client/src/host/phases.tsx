import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { AnswerView, HostView, PublicPlayer } from '../../../shared/types';
import { Avatar, Mascot } from '../components/Avatar';
import { Btn, Confetti, CountUp, Crown, Logo, TimerRing } from '../components/ui';
import { emit, newRoom } from '../net';

const byId = (v: HostView) => Object.fromEntries(v.players.map((p) => [p.id, p])) as Record<string, PublicPlayer>;
const roundName = (r: number) => (r >= 4 ? 'The Final Lash' : `Round ${r}`);
const fmt = (n: number) => n.toLocaleString();

// ---------------------------------------------------------------- intro
export function Intro({ v }: { v: HostView }) {
  const rules = [
    { art: [4], title: 'Write', text: 'Two prompts land on your phone. Answer them. Your mom will never see this.' },
    { art: [1, 7], title: 'Clash', text: 'Your answer goes head-to-head with someone else’s. Nobody knows who wrote what.' },
    { art: [9, 3, 10], title: 'Vote', text: 'Everyone else picks the funnier one. Take every vote for a Clean Sweep bonus.' },
  ];
  return (
    <div className="intro">
      <motion.div initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 12 }}>
        <Logo size={0.8} />
      </motion.div>
      <div className="rules">
        {rules.map((r, i) => (
          <motion.div key={r.title} className={`rule-card rule-${i}`} initial={{ y: 200, opacity: 0, rotate: -10 }} animate={{ y: 0, opacity: 1, rotate: [-2, 2, -1][i] }} transition={{ delay: 1.6 + i * 0.7, type: 'spring', stiffness: 200, damping: 14 }}>
            <span className="rule-num">{i + 1}</span>
            <div className="rule-art">{r.art.map((a) => <Avatar key={a} id={a} size="calc(var(--u) * 8)" bob />)}</div>
            <h3>{r.title}</h3>
            <p>{r.text}</p>
          </motion.div>
        ))}
      </div>
      <motion.div className="scoring-strip" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 4.2 }}>
        <span>Points grow every round:</span>
        <b className="mult m1">R1 ×1</b>
        <b className="mult m2">R2 ×2</b>
        <b className="mult m3">R3 ×3</b>
        <b className="mult mf">FINAL ×5</b>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------- round intro
export function RoundIntro({ v }: { v: HostView }) {
  return (
    <div className="round-intro">
      <motion.div className="round-wipe" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.45, ease: 'easeOut' }} />
      <motion.h1 className="round-title" initial={{ x: '-120%', skewX: -20 }} animate={{ x: 0, skewX: -8 }} transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 16 }}>
        {roundName(v.round)}
      </motion.h1>
      <motion.div className="mult-badge" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 8 }} transition={{ delay: 0.8, type: 'spring', stiffness: 260, damping: 12 }}>
        ×{v.multiplier}
        <small>points</small>
      </motion.div>
      <motion.p className="round-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
        {v.round === 1 && 'Ease in. Nobody’s judging you yet.'}
        {v.round === 2 && 'Double points. Stop holding back.'}
        {v.round === 3 && 'Triple points. Say the thing you shouldn’t.'}
      </motion.p>
    </div>
  );
}

// ---------------------------------------------------------------- writing
export function Writing({ v }: { v: HostView }) {
  const done = new Set(v.writing?.done ?? []);
  const isFinal = v.phase === 'finalWriting';
  return (
    <div className="writing">
      <div className="writing-head">
        <div>
          <motion.h1 className="big-head" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            {isFinal ? 'Everyone answers this one' : 'Check your phones'}
          </motion.h1>
          <p className="sub-head">{isFinal ? 'Same prompt for all. 5,000 points on the line.' : 'Two prompts each. Be funny, be fast, be a little bit wrong.'}</p>
        </div>
        <TimerRing timer={v.timer} size="calc(var(--u) * 12)" paused={v.paused} />
      </div>
      {isFinal && v.final && (
        <motion.div className="prompt-banner final" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          {v.final.prompt}
        </motion.div>
      )}
      <div className="writing-body">
        <div className="writers">
          {v.players.map((p, i) => {
            const d = done.has(p.id);
            return (
              <motion.div key={p.id} className={`writer ${d ? 'done' : ''} ${p.connected ? '' : 'offline'}`} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.06 }}>
                <motion.div animate={d ? { y: [0, -30, 0], rotate: [0, 360] } : { rotate: [-4, 4, -4] }} transition={d ? { duration: 0.6 } : { duration: 0.5, repeat: Infinity }}>
                  <Avatar id={p.avatar} size="100%" mood={d ? 'happy' : 'idle'} />
                </motion.div>
                <span className="writer-name">{p.name}</span>
                <span className="writer-status">{d ? 'Done' : p.connected ? 'writing…' : 'away'}</span>
              </motion.div>
            );
          })}
        </div>
        <div className="writing-mascot">
          <Mascot mood={done.size === v.players.length ? 'happy' : 'idle'} size="100%" />
          <div className="speech">{done.size} of {v.writing?.total ?? v.players.length} done</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- matchup
export function Matchup({ v }: { v: HostView }) {
  const m = v.matchup!;
  const players = byId(v);
  const result = v.phase === 'matchupResult';
  const [a, b] = m.answers;
  const winner = result && a.points !== null && b.points !== null && a.points !== b.points ? (a.points! > b.points! ? 0 : 1) : null;
  const tie = result && winner === null && !m.forfeit;
  const total = (a.votes ?? 0) + (b.votes ?? 0);

  return (
    <div className="matchup">
      <div className="matchup-top">
        <span className="matchup-count">{roundName(v.round)} · Matchup {m.index + 1} of {m.count}</span>
        <motion.div className="prompt-banner" initial={{ y: -120, rotate: -4 }} animate={{ y: 0, rotate: -1 }} transition={{ type: 'spring', stiffness: 180, damping: 14 }}>
          {m.prompt}
        </motion.div>
      </div>
      <div className="vs-row">
        {[a, b].map((ans, i) => (
          <AnswerCard key={ans.key} ans={ans} side={i as 0 | 1} result={result} winner={winner} total={total} players={players} forfeit={m.forfeit} />
        ))}
        <motion.div className="vs-badge" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 1.5, type: 'spring', stiffness: 400, damping: 10 }}>
          VS
        </motion.div>
      </div>
      <div className="matchup-bottom">
        {v.phase === 'reveal' && (
          <motion.p className="hint-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>
            Who wrote this? Nobody knows…
          </motion.p>
        )}
        {v.phase === 'vote' && (
          <>
            <VoteDots voted={m.voted} eligible={m.eligible} />
            <span className="hint-line">Vote on your phone</span>
            <TimerRing timer={v.timer} size="calc(var(--u) * 9)" paused={v.paused} />
          </>
        )}
        {result && (
          <motion.div className="result-callout" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.6, type: 'spring' }}>
            {m.forfeit ? 'Win by forfeit. Someone choked.' : tie ? (total === 0 ? 'Nobody voted. Brutal.' : 'Dead even.') : a.sweep || b.sweep ? 'Clean sweep!' : `${players[[a, b][winner!].authorId!]?.name ?? '???'} takes it!`}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function AnswerCard({ ans, side, result, winner, total, players, forfeit }: { ans: AnswerView; side: 0 | 1; result: boolean; winner: 0 | 1 | null; total: number; players: Record<string, PublicPlayer>; forfeit: boolean }) {
  const author = ans.authorId ? players[ans.authorId] : null;
  const pct = total ? Math.round(((ans.votes ?? 0) / total) * 100) : 0;
  const isWinner = winner === side;
  const isLoser = winner !== null && winner !== side;
  return (
    <motion.div
      className={`answer-card side-${side} ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''}`}
      initial={{ x: side === 0 ? '-140%' : '140%', rotate: side === 0 ? -20 : 20, opacity: 0 }}
      animate={{ x: 0, rotate: side === 0 ? -2 : 2, opacity: 1, scale: isWinner ? 1.06 : isLoser ? 0.94 : 1 }}
      transition={{ delay: result ? 0 : side === 0 ? 0.3 : 1.0, type: 'spring', stiffness: 160, damping: 15 }}
    >
      <div className="answer-text">{ans.text ?? <span className="no-answer">(they wrote nothing)</span>}</div>
      {result && (
        <>
          <motion.div className="vote-meter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <motion.div className="vote-fill" initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ delay: 0.5, duration: 0.9, ease: 'easeOut' }} />
            <span>
              {ans.votes} vote{ans.votes === 1 ? '' : 's'}
              {total > 0 && ` · ${pct}%`}
            </span>
          </motion.div>
          {author && (
            <motion.div className="author" initial={{ y: 60, opacity: 0, scale: 0.5 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 12 }}>
              <Avatar id={author.avatar} size="calc(var(--u) * 7)" mood={isWinner ? 'happy' : isLoser ? 'sad' : ans.text ? 'wink' : 'shock'} />
              <span className="author-name">{author.name}</span>
              <span className="points-pop">
                +<CountUp to={ans.points ?? 0} delay={1.2} duration={1} />
              </span>
            </motion.div>
          )}
          {ans.sweep && (
            <motion.div className="stamp" initial={{ scale: 4, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: -14 }} transition={{ delay: 1.4, type: 'spring', stiffness: 300, damping: 14 }}>
              CLEAN<br />SWEEP!
            </motion.div>
          )}
          {forfeit && ans.text && (
            <motion.div className="stamp alt" initial={{ scale: 4, opacity: 0 }} animate={{ scale: 1, opacity: 1, rotate: 10 }} transition={{ delay: 1.4 }}>
              BY<br />FORFEIT
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}

function VoteDots({ voted, eligible }: { voted: number; eligible: number }) {
  return (
    <div className="vote-dots" aria-label={`${voted} of ${eligible} votes in`}>
      {Array.from({ length: eligible }, (_, i) => (
        <motion.span key={i} className={`vdot ${i < voted ? 'in' : ''}`} animate={i < voted ? { scale: [1, 1.6, 1] } : {}} transition={{ duration: 0.4 }} />
      ))}
      <span className="vote-count">{voted}/{eligible} votes</span>
    </div>
  );
}

// ---------------------------------------------------------------- scoreboard
export function Scoreboard({ v, title }: { v: HostView; title?: string }) {
  const prev = v.prevScores ?? {};
  const gains = v.gains ?? {};
  const [after, setAfter] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAfter(true), 1400);
    return () => clearTimeout(t);
  }, []);
  const rows = useMemo(() => {
    const list = v.players.map((p) => ({ ...p, before: prev[p.id] ?? 0 }));
    return [...list].sort((a, b) => (after ? b.score - a.score : b.before - a.before));
  }, [after, v.players]);
  const max = Math.max(1, ...v.players.map((p) => p.score));
  return (
    <div className="scoreboard">
      <motion.h1 className="big-head" initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        {title ?? `${roundName(v.round)} standings`}
      </motion.h1>
      <div className="score-rows">
        {rows.map((p, i) => (
          <motion.div key={p.id} layout transition={{ layout: { type: 'spring', stiffness: 200, damping: 22 } }} className={`score-row ${i === 0 && after ? 'leader' : ''}`} initial={{ x: -400, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
            <span className="score-rank">{i + 1}</span>
            <Avatar id={p.avatar} size="calc(var(--u) * 5)" mood={after && (gains[p.id] ?? 0) > 0 ? 'happy' : 'idle'} />
            <span className="score-name">{p.name}</span>
            <div className="score-bar">
              <motion.div className="score-bar-fill" initial={{ scaleX: p.before / max }} animate={{ scaleX: after ? p.score / max : p.before / max }} transition={{ duration: 1.2 }} />
            </div>
            <AnimatePresence>
              {after && (gains[p.id] ?? 0) > 0 && (
                <motion.span className="gain-chip" initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }}>
                  +{fmt(gains[p.id])}
                </motion.span>
              )}
            </AnimatePresence>
            <span className="score-num">{after ? <CountUp from={p.before} to={p.score} duration={1.2} /> : fmt(p.before)}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- final
export function FinalIntro({ v }: { v: HostView }) {
  return (
    <div className="final-intro">
      <motion.h1 className="final-title" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 220, damping: 10 }}>
        THE FINAL LASH
      </motion.h1>
      <motion.p className="round-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
        One prompt. Everybody answers. Everybody votes. <b>5,000 points</b> up for grabs.
      </motion.p>
      <motion.div className="prompt-banner final" initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.8, type: 'spring' }}>
        {v.final?.prompt}
      </motion.div>
    </div>
  );
}

export function FinalBoard({ v }: { v: HostView }) {
  const f = v.final!;
  const players = byId(v);
  const result = v.phase === 'finalResult';
  const maxVotes = result ? Math.max(0, ...f.answers.map((a) => a.votes ?? 0)) : 0;
  const cols = f.answers.length <= 4 ? 2 : f.answers.length <= 6 ? 3 : f.answers.length <= 8 ? 4 : 5;
  return (
    <div className="final-board">
      <div className="final-top">
        <div className="prompt-banner final small">{f.prompt}</div>
        {!result && <TimerRing timer={v.timer} size="calc(var(--u) * 8)" paused={v.paused} />}
      </div>
      <div className="final-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {f.answers.map((a, i) => {
          const author = a.authorId ? players[a.authorId] : null;
          const top = result && maxVotes > 0 && a.votes === maxVotes;
          return (
            <motion.div key={a.key} className={`final-card fc-${i % 5} ${top ? 'top' : ''}`} initial={{ y: 80, opacity: 0, rotate: i % 2 ? 6 : -6 }} animate={{ y: 0, opacity: 1, rotate: i % 2 ? 1 : -1, scale: top ? 1.05 : 1 }} transition={{ delay: result ? 0 : 0.2 + i * 0.25, type: 'spring' }}>
              <span className="final-letter">{String.fromCharCode(65 + i)}</span>
              <p>{a.text}</p>
              {result && author && (
                <motion.div className="final-author" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.15 }}>
                  <Avatar id={author.avatar} size="calc(var(--u) * 4.4)" mood={top ? 'happy' : 'idle'} />
                  <span className="fa-name">{author.name}</span>
                  <span className="fa-votes">{a.votes} vote{a.votes === 1 ? '' : 's'}</span>
                  <span className="fa-pts">+<CountUp to={a.points ?? 0} delay={0.8 + i * 0.15} /></span>
                </motion.div>
              )}
              {top && <span className="crown-tag"><Crown size="calc(var(--u) * 4)" /></span>}
            </motion.div>
          );
        })}
      </div>
      {!result && (
        <div className="matchup-bottom">
          <VoteDots voted={f.voted} eligible={f.eligible} />
          <span className="hint-line">Vote for your favourite — just not your own!</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- game over
export function GameOver({ v }: { v: HostView }) {
  const hasHighlights = (v.results?.highlights?.length ?? 0) > 0;
  const [show, setShow] = useState<'podium' | 'highlights'>('podium');
  useEffect(() => {
    if (!hasHighlights) return;
    const t = setTimeout(() => setShow('highlights'), 10000);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.div key={show} style={{ height: '100%' }} initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -60 }} transition={{ duration: 0.35 }}>
        {show === 'podium' ? <Podium v={v} onHighlights={hasHighlights ? () => setShow('highlights') : undefined} /> : <Highlights v={v} onPodium={() => setShow('podium')} />}
      </motion.div>
    </AnimatePresence>
  );
}

function EndButtons({ toggle }: { toggle?: { label: string; on: () => void } }) {
  return (
    <div className="go-buttons">
      <Btn big onClick={() => emit('host:playAgain')}>Play Again</Btn>
      {toggle && <Btn variant="secondary" onClick={toggle.on}>{toggle.label}</Btn>}
      <Btn variant="secondary" onClick={() => emit('host:backToLobby')}>Game Selection</Btn>
      <Btn variant="ghost" onClick={() => newRoom()}>New Room</Btn>
    </div>
  );
}

function Highlights({ v, onPodium }: { v: HostView; onPodium: () => void }) {
  const players = byId(v);
  const hl = v.results!.highlights;
  return (
    <div className="highlights">
      <motion.h1 className="go-title" initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>Highlights of the night</motion.h1>
      <div className="hl-grid">
        {hl.map((h, i) => {
          const p = h.playerId ? players[h.playerId] : null;
          return (
            <motion.div key={h.title} className={`hl-card ${h.quote ? 'quote' : ''} fc-${i % 5}`} initial={{ y: 80, opacity: 0, rotate: i % 2 ? 4 : -4 }} animate={{ y: 0, opacity: 1, rotate: i % 2 ? 1 : -1 }} transition={{ delay: 0.3 + i * 0.35, type: 'spring', stiffness: 180, damping: 15 }}>
              <span className="hl-title">{h.title}</span>
              {h.quote && (
                <div className="hl-quote">
                  <small>{h.quote.prompt}</small>
                  <b>“{h.quote.text}”</b>
                </div>
              )}
              <div className="hl-who">
                {p && <Avatar id={p.avatar} size="calc(var(--u) * 4.4)" mood="happy" />}
                <div>
                  {p && <b>{p.name}</b>}
                  <span>{h.value}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <EndButtons toggle={{ label: 'Podium', on: onPodium }} />
    </div>
  );
}

function Podium({ v, onHighlights }: { v: HostView; onHighlights?: () => void }) {
  const r = v.results!;
  const players = byId(v);
  const ranked = r.ranking.map((x) => ({ ...x, p: players[x.id] })).filter((x) => x.p);
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const winners = r.winnerIds.map((id) => players[id]).filter(Boolean);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const ts = [setTimeout(() => setStage(1), 600), setTimeout(() => setStage(2), 2200), setTimeout(() => setStage(3), 3600)];
    return () => ts.forEach(clearTimeout);
  }, []);
  return (
    <div className="gameover">
      {stage >= 2 && <Confetti bursts={5} />}
      <motion.h1 className="go-title" initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        {winners.length > 1 ? 'A tie at the top' : 'And the winner is…'}
      </motion.h1>
      <div className="podium">
        {podium.map((x) => {
          const h = x.rank === 1 ? 7.5 : x.rank === 2 ? 5 : 3.5;
          return (
            <div key={x.id} className={`podium-col rank-${x.rank}`}>
              <motion.div className="podium-avatar" initial={{ y: -500, opacity: 0 }} animate={stage >= (x.rank === 1 ? 2 : 1) ? { y: 0, opacity: 1 } : {}} transition={{ type: 'spring', stiffness: 180, damping: 12 }}>
                {x.rank === 1 && <motion.span className="crown" initial={{ y: -80, rotate: -30 }} animate={stage >= 2 ? { y: 0, rotate: -8 } : {}} transition={{ delay: 0.5, type: 'spring' }}><Crown size="calc(var(--u) * 5)" /></motion.span>}
                <Avatar id={x.p.avatar} size="calc(var(--u) * 8.5)" mood={x.rank === 1 ? 'happy' : 'wink'} bob={x.rank === 1} />
                <span className="podium-name">{x.p.name}</span>
                <span className="podium-score"><CountUp to={x.score} duration={1.5} delay={0.4} /></span>
              </motion.div>
              <motion.div className="podium-block" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.2, duration: 0.6 }} style={{ height: `calc(var(--u) * ${h})` }}>
                {x.rank}
              </motion.div>
            </div>
          );
        })}
      </div>
      <div className="winner-slot">
      <AnimatePresence>
        {stage >= 2 && (
          <motion.div className="winner-title" initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}>
            {winners.map((w) => w.name).join(' & ')} — <i>{r.winnerTitle}</i>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      <div className="go-slot">
      {stage >= 3 && (
        <motion.div className="go-bottom" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}>
          <div className="awards">
            {r.awards.map((a) => (
              <div key={a.title} className="award">
                <Avatar id={players[a.playerId]?.avatar ?? 0} size="calc(var(--u) * 4)" mood="wink" />
                <div>
                  <b>{a.title}</b>
                  <span>{players[a.playerId]?.name} · {a.blurb}</span>
                </div>
              </div>
            ))}
          </div>
          {ranked.length > 3 && (
            <div className="also-ran">
              {ranked.slice(3).map((x) => (
                <span key={x.id}>#{x.rank} {x.p.name} · {fmt(x.score)}</span>
              ))}
            </div>
          )}
          <EndButtons toggle={onHighlights && { label: 'Highlights', on: onHighlights }} />
        </motion.div>
      )}
      </div>
    </div>
  );
}
