import { motion } from 'framer-motion';
import { useState } from 'react';
import type { HostView, PlayerView } from '../../../shared/types';
import { sfx, vibrate } from '../audio';
import { Avatar } from '../components/Avatar';
import { TimerRing } from '../components/ui';
import { emit } from '../net';
import { byId, GameIntro, PhoneLookUp, StatusRow, TextAction, VoteDots } from './common';

export function WhoHost({ v }: { v: HostView }) {
  const d = v.data ?? {};
  const players = byId(v.players);
  switch (v.phase) {
    case 'intro':
      return (
        <GameIntro
          name="WHO DUNNIT?"
          rules={[
            { art: [4, 8], title: 'Answer', text: 'Everyone answers a question on their phone. One secret impostor got a DIFFERENT question.' },
            { art: [9], title: 'Argue', text: 'The answers go up on the TV. Interrogate each other. The impostor has to bluff.' },
            { art: [6, 1, 3], title: 'Accuse', text: 'Vote for the faker. +1,000 if you’re right. If the impostor escapes, they get +2,500.' },
          ]}
          strip={<span>The impostor doesn’t know they’re the impostor until the answers go up.</span>}
        />
      );
    case 'roundIntro':
      return (
        <div className="round-intro">
          <motion.div className="round-wipe" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.45 }} />
          <motion.h1 className="round-title" initial={{ x: '-120%' }} animate={{ x: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 16 }}>
            Round {v.round}
          </motion.h1>
          <motion.p className="round-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
            Somebody in this room is about to get a different question.
          </motion.p>
        </div>
      );
    case 'answer':
      return (
        <div className="writing">
          <div className="writing-head">
            <div>
              <span className="matchup-count">Round {v.round} of {v.totalRounds}</span>
              <h1 className="big-head">Answer on your phone</h1>
              <p className="sub-head">Keep it short. A number, a word, a phrase.</p>
            </div>
            <TimerRing timer={v.timer} size="calc(var(--u) * 11)" paused={v.paused} />
          </div>
          <StatusRow players={v.players} done={new Set(d.answered ?? [])} doneLabel="Answered" />
        </div>
      );
    case 'reveal':
    case 'vote':
    case 'result': {
      const result = v.phase === 'result';
      const voting = v.phase === 'vote';
      const max = result ? Math.max(0, ...Object.values<number>(d.tally ?? {})) : 0;
      return (
        <div className="who">
          <div className="who-top">
            <span className="matchup-count">The question was</span>
            <motion.div className="prompt-banner" initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{d.crewQuestion}</motion.div>
          </div>
          <div className="who-grid" style={{ gridTemplateColumns: `repeat(${v.players.length <= 4 ? v.players.length : v.players.length <= 6 ? 3 : v.players.length <= 8 ? 4 : 5}, 1fr)` }}>
            {v.players.map((p, i) => {
              const imp = result && p.id === d.impostor;
              const votes = d.tally?.[p.id] ?? 0;
              return (
                <motion.div key={p.id} className={`who-card fc-${i % 5} ${imp ? 'impostor' : ''} ${result && !imp ? 'dim' : ''}`} initial={{ y: 60, opacity: 0, rotate: i % 2 ? 4 : -4 }} animate={{ y: 0, opacity: 1, rotate: imp ? 0 : i % 2 ? 1 : -1, scale: imp ? 1.08 : 1 }} transition={{ delay: result ? 0 : 0.15 * i }}>
                  <Avatar id={p.avatar} size="calc(var(--u) * 6)" mood={imp ? (d.caught ? 'sad' : 'happy') : result ? 'idle' : 'shock'} />
                  <span className="who-name">{p.name}</span>
                  <span className="who-answer">{d.answers?.[p.id] ?? <i className="muted">no answer</i>}</span>
                  {result && votes > 0 && <span className={`who-votes ${votes === max ? 'top' : ''}`}>{votes} vote{votes === 1 ? '' : 's'}</span>}
                  {imp && (
                    <motion.span className="stamp" initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1, rotate: -10 }} transition={{ delay: 0.8 }}>
                      IMPOSTOR
                    </motion.span>
                  )}
                </motion.div>
              );
            })}
          </div>
          <div className="matchup-bottom">
            {v.phase === 'reveal' && <span className="hint-line">Discuss. Someone here is lying.</span>}
            {voting && (
              <>
                <VoteDots voted={d.voted} eligible={d.eligible} />
                <span className="hint-line">Argue it out, then vote on your phone</span>
                <TimerRing timer={v.timer} size="calc(var(--u) * 8)" paused={v.paused} />
              </>
            )}
            {result && (
              <motion.div className="who-verdict" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2, type: 'spring' }}>
                <b>{players[d.impostor]?.name} {d.caught ? 'got caught!' : 'got away with it!'}</b>
                <span>Their question: “{d.impQuestion}”</span>
              </motion.div>
            )}
          </div>
        </div>
      );
    }
  }
  return null;
}

export function WhoPhone({ v }: { v: PlayerView }) {
  const d = v.data ?? {};
  switch (v.phase) {
    case 'intro':
      return <PhoneLookUp title="Who Dunnit?" sub="Rules are on the TV. Trust no one." mood="shock" />;
    case 'roundIntro':
      return <PhoneLookUp title={`Round ${v.round}`} sub="Your question is coming…" />;
    case 'answer':
      return (
        <TextAction
          key={v.round}
          type="answer"
          max={40}
          label={`Round ${v.round} of ${v.totalRounds}`}
          prompt={d.question}
          placeholder="Your answer…"
          done={!!d.myAnswer}
          doneView={<PhoneLookUp title="Answer locked" sub={`You said: “${d.myAnswer}”. Act natural.`} mood="wink" />}
        />
      );
    case 'reveal':
    case 'vote':
      return <WhoVote v={v} />;
    case 'result':
      return (
        <PhoneLookUp
          title={d.wasImpostor ? (d.caught ? 'Busted.' : 'You got away with it!') : d.caught ? 'Impostor caught!' : 'The impostor escaped.'}
          sub={d.wasImpostor ? undefined : `It was ${v.players.find((p) => p.id === d.impostor)?.name ?? '???'}.`}
          mood={(d.wasImpostor && !d.caught) || (!d.wasImpostor && d.caught) ? 'happy' : 'sad'}
        />
      );
  }
  return null;
}

function WhoVote({ v }: { v: PlayerView }) {
  const d = v.data;
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const imp = d.secret === 'impostor';
  const chosen = d.myVote ?? pending;
  const accuse = async (id: string) => {
    if (!d.canVote || pending) return;
    setPending(id);
    const ack = await emit('game:action', { type: 'accuse', target: id });
    if (!ack.ok) return setPending(null), setError(ack.error ?? 'Could not vote.');
    sfx('vote');
    vibrate(30);
  };
  return (
    <div className="vote-panel">
      <motion.div className={`secret-card ${imp ? 'imp' : ''}`} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }}>
        {imp ? (
          <>
            <b>Psst. YOU are the impostor.</b>
            <span>Everyone else answered: “{d.crewQuestion}”. Blend in.</span>
          </>
        ) : (
          <>
            <b>You’re crew.</b>
            <span>Find who answered a different question.</span>
          </>
        )}
      </motion.div>
      {v.phase === 'reveal' ? (
        <p className="lookup-sub" style={{ textAlign: 'center' }}>Answers are on the TV. Voting opens in a moment…</p>
      ) : (
        <>
          <h2 className="vote-head">{chosen ? 'Accusation locked' : 'Who’s the faker?'}</h2>
          <div className="vote-options many">
            {v.players.filter((p) => p.id !== v.me.id).map((p, i) => (
              <motion.button key={p.id} className={`vote-btn who-btn vb-${i % 5} ${chosen === p.id ? 'chosen' : ''} ${chosen && chosen !== p.id ? 'faded' : ''}`} disabled={!d.canVote || !!pending} onClick={() => accuse(p.id)} whileTap={{ scale: 0.95 }}>
                <Avatar id={p.avatar} size={40} />
                {p.name}
              </motion.button>
            ))}
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
