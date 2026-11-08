import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { AVATAR_COUNT, MAX_ANSWER, MAX_NAME, gameMeta, type PeekResult, type PlayerView } from '../../../shared/types';
import { SCREENS } from '../games/registry';
import { sfx, unlockAudio, vibrate } from '../audio';
import { AVATARS, Avatar, Mascot } from '../components/Avatar';
import { Btn, CountUp, Logo, SoundControls, TimerBar, themeForRound } from '../components/ui';
import { navigate } from '../App';
import { clearNotice, emit, getSession, joinRoom, leaveRoom, useStore } from '../net';

const NAME_KEY = 'comedyclash.name';
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

export function PlayerApp({ initialCode }: { initialCode: string }) {
  const { view, connected, notice } = useStore();
  const session = getSession();

  let body;
  if (notice && !view) {
    body = (
      <div className="phone-center">
        <Mascot mood="sad" size={150} />
        <h2>{notice}</h2>
        <Btn big onClick={() => (clearNotice(), navigate('/join'))}>Join another game</Btn>
      </div>
    );
  } else if (session?.role === 'player' && (!view || view.role !== 'player')) {
    body = (
      <div className="phone-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="spinner" />
        <h2>{connected ? 'Rejoining your game…' : 'Connecting…'}</h2>
        <button className="link-btn" onClick={() => leaveRoom()}>Cancel</button>
      </div>
    );
  } else if (view?.role === 'player') {
    return <PlayerScreen v={view} connected={connected} />;
  } else {
    body = <JoinFlow initialCode={initialCode} />;
  }
  return <div className="phone theme-menu">{body}</div>;
}

// ---------------------------------------------------------------- join
function JoinFlow({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode.slice(0, 4));
  const [peek, setPeek] = useState<PeekResult | null>(null);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [avatar, setAvatar] = useState<number>(() => Math.floor(Math.random() * AVATAR_COUNT));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { connected } = useStore();

  useEffect(() => {
    setError('');
    if (code.length !== 4 || !connected) return setPeek(null);
    emit<PeekResult>('room:peek', { code }).then((ack) => {
      if (!ack.ok) return setError(ack.error ?? 'Room not found.');
      const p = ack.data!;
      if (!p.joinable) return setError('That room is full.');
      setPeek(p);
      if (p.takenAvatars.includes(avatar)) {
        const free = [...Array(AVATAR_COUNT).keys()].find((a) => !p.takenAvatars.includes(a));
        if (free !== undefined) setAvatar(free);
      }
    });
  }, [code, connected]);

  const submit = async () => {
    unlockAudio();
    setBusy(true);
    setError('');
    const ack = await joinRoom(code, name, avatar);
    setBusy(false);
    if (!ack.ok) return setError(ack.error ?? 'Could not join.');
    localStorage.setItem(NAME_KEY, name.trim());
    history.replaceState({}, '', `/join/${ack.data!.code}`);
    sfx('join');
    vibrate(40);
  };

  return (
    <div className="join-flow">
      <div className="join-logo" onClick={() => navigate('/')}>
        <Logo size={1.05} />
      </div>
      <label className="field">
        <span>Room code</span>
        <input
          className="code-input"
          value={code}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABCD"
          maxLength={4}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
        />
      </label>
      <AnimatePresence>
        {peek && (
          <motion.div className="join-details" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
            {peek.inProgress && <p className="spicy-note">A game is already going. Jump in now: you start on 0 points and play from the next round.</p>}
            {peek.spicy && <p className="spicy-note"><span className="tag-18">18+</span> This room is using the spicy deck.</p>}
            <label className="field">
              <span>Nickname</span>
              <input value={name} maxLength={MAX_NAME} placeholder="Your name" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="field">
              <span>Pick your character</span>
              <div className="avatar-picker">
                {AVATARS.map((a, i) => {
                  const taken = peek.takenAvatars.includes(i);
                  return (
                    <motion.button
                      key={i}
                      className={`avatar-opt ${avatar === i ? 'picked' : ''} ${taken ? 'taken' : ''}`}
                      disabled={taken}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => (setAvatar(i), sfx('click'), vibrate(10))}
                      aria-label={`${a.name}${taken ? ' (taken)' : ''}`}
                    >
                      <Avatar id={i} size="100%" mood={avatar === i ? 'happy' : 'idle'} />
                    </motion.button>
                  );
                })}
              </div>
            </div>
            <Btn big disabled={!name.trim() || busy} onClick={submit}>
              {busy ? 'Joining…' : 'Join the show!'}
            </Btn>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="error">{error}</p>}
      {!connected && <p className="muted">Connecting to the server…</p>}
      {!peek && !error && <p className="muted">Enter the 4-letter code shown on the TV.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- in-game
function PlayerScreen({ v, connected }: { v: PlayerView; connected: boolean }) {
  const G = v.gameId === 'comedy-clash' ? null : SCREENS[v.gameId];
  const theme = v.phase === 'lobby' ? 'menu' : v.phase === 'gameOver' ? 'win' : G ? G.theme : themeForRound(v.round);
  const timed = ['writing', 'finalWriting', 'vote', 'finalVote', 'lie', 'pick', 'draw', 'answer'].includes(v.phase);
  const prevPhase = useRef(v.phase);
  useEffect(() => {
    if (prevPhase.current !== v.phase && ['writing', 'finalWriting', 'vote', 'finalVote', 'lie', 'pick', 'answer', 'choose', 'draw'].includes(v.phase)) vibrate([30, 40, 30]);
    prevPhase.current = v.phase;
  }, [v.phase]);

  return (
    <div className={`phone theme-${theme}`}>
      <header className="phone-bar">
        <Avatar id={v.me.avatar} size={38} />
        <div className="pb-name">
          <b>{v.me.name}</b>
          <span>{v.me.score.toLocaleString()} pts</span>
        </div>
        <span className="pb-code">{v.code}</span>
        <SoundControls compact />
      </header>
      {timed && <TimerBar timer={v.timer} />}
      {v.paused && v.hostConnected && connected && v.phase !== 'lobby' && <div className="phone-banner paused">Game paused by the host</div>}
      {(!v.hostConnected || !connected) && (
        <div className="phone-banner">{!connected ? 'Reconnecting…' : 'The TV disconnected. Game paused until it’s back.'}</div>
      )}
      <AnimatePresence mode="wait">
        <motion.main key={`${v.phase}-${v.round}-${v.vote?.prompt ?? ''}`} className="phone-main" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.22 }}>
          <PhoneBody v={v} />
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

function PhoneBody({ v }: { v: PlayerView }) {
  const G = v.gameId === 'comedy-clash' ? null : SCREENS[v.gameId];
  if (G && !['lobby', 'scoreboard', 'gameOver'].includes(v.phase)) return <G.Phone v={v} />;
  switch (v.phase) {
    case 'lobby':
      return <PhoneLobby v={v} />;
    case 'intro':
      return <LookUp title="The show is starting!" sub="Rules are on the TV." mood="happy" />;
    case 'roundIntro':
      return <LookUp title={`Round ${v.round}`} sub={`Points ×${v.multiplier}. Get ready to write!`} mood="wink" />;
    case 'finalIntro':
      return <LookUp title="The Final Lash" sub="Everyone gets the same prompt. Biggest points of the night." mood="shock" />;
    case 'writing':
    case 'finalWriting':
      return <WritePanel v={v} />;
    case 'reveal':
      return v.vote?.reason === 'author' ? (
        <LookUp title="That’s YOUR answer up there!" sub="Act natural. Do not make eye contact." mood="shock" />
      ) : (
        <LookUp title="Matchup incoming…" sub={v.vote?.prompt} mood="idle" />
      );
    case 'vote':
    case 'finalVote':
      return <VotePanel v={v} />;
    case 'matchupResult':
      return <LookUp title="Results on the TV!" sub={`You have ${v.me.score.toLocaleString()} points.`} mood="wink" />;
    case 'scoreboard':
      return <Standing v={v} label={G ? 'Scores are on the TV' : `Round ${v.round} done!`} />;
    case 'finalResult':
      return <Standing v={v} label="Final votes are in!" />;
    case 'gameOver':
      return <PhoneGameOver v={v} />;
  }
}

function PhoneLobby({ v }: { v: PlayerView }) {
  const n = v.players.filter((p) => p.connected).length;
  const vip = v.players.find((p) => p.isVip);
  return (
    <div className="phone-center lobby-phone">
      <motion.div initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
        <Avatar id={v.me.avatar} size={150} bob mood="happy" />
      </motion.div>
      <Rename name={v.me.name} />
      <p className="muted">Up next: <b>{gameMeta(v.gameId).name}</b>. {n} player{n === 1 ? '' : 's'} here.</p>
      {v.me.isVip ? (
        <div className="vip-box">
          <span className="vip">VIP</span>
          {v.canStart ? (
            <Btn big onClick={() => emit('game:start')}>Everybody’s in — start!</Btn>
          ) : (
            <p>You can start once {Math.max(0, v.minPlayers - n)} more {v.minPlayers - n === 1 ? 'player joins' : 'players join'}.</p>
          )}
        </div>
      ) : (
        <p className="waiting-dots">Waiting for {vip ? `${vip.name} (VIP)` : 'the host'} to start<span>.</span><span>.</span><span>.</span></p>
      )}
      <button className="link-btn" onClick={() => leaveRoom()}>Leave room</button>
    </div>
  );
}

function LookUp({ title, sub, mood = 'idle' }: { title: string; sub?: string; mood?: 'idle' | 'happy' | 'shock' | 'wink' | 'sad' }) {
  return (
    <div className="phone-center">
      <Mascot mood={mood} size={140} />
      <h1>{title}</h1>
      {sub && <p className="lookup-sub">{sub}</p>}
      <p className="muted tv-hint">Eyes on the TV</p>
    </div>
  );
}

function WritePanel({ v }: { v: PlayerView }) {
  const prompts = v.writing?.prompts ?? [];
  const current = prompts.find((p) => p.answer === null);
  const done = prompts.filter((p) => p.answer !== null).length;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  if (!current && prompts.length === 0)
    return (
      <div className="phone-center">
        <Avatar id={v.me.avatar} size={110} mood="wink" bob />
        <h1>You made it!</h1>
        <p className="lookup-sub">This round’s prompts were already handed out. You’ll get yours next round, and you can still vote.</p>
      </div>
    );
  if (!current)
    return (
      <div className="phone-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1, rotate: [0, -10, 10, 0] }} className="lock-icon"><Avatar id={v.me.avatar} size={110} mood="happy" /></motion.div>
        <h1>Locked in!</h1>
        <p className="muted">Waiting for the slow typers…</p>
        <div className="my-answers">
          {prompts.map((p) => (
            <div key={p.id} className="my-answer">
              <small>{p.text}</small>
              <b>{p.answer}</b>
            </div>
          ))}
        </div>
      </div>
    );

  const text = drafts[current.id] ?? '';
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ack = await emit('game:action', { type: 'submit', promptId: current.id, text });
    setSending(false);
    if (!ack.ok) return setError(ack.error ?? 'Could not send.');
    setError('');
    sfx('submit');
    vibrate(25);
  };

  return (
    <div className="write-panel" key={current.id}>
      {prompts.length > 1 && <span className="step-chip">Prompt {done + 1} of {prompts.length}</span>}
      <motion.div className="prompt-card" initial={{ rotate: -6, scale: 0.8 }} animate={{ rotate: -1, scale: 1 }} transition={{ type: 'spring' }}>
        {current.text}
      </motion.div>
      <textarea
        className="answer-input"
        value={text}
        maxLength={MAX_ANSWER}
        placeholder="Type something you’ll regret…"
        autoFocus
        rows={3}
        enterKeyHint="send"
        onChange={(e) => setDrafts({ ...drafts, [current.id]: e.target.value.replace(/\n/g, '') })}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), send())}
      />
      <div className="answer-meta">
        <span className={text.length > MAX_ANSWER - 10 ? 'warn' : ''}>{text.length}/{MAX_ANSWER}</span>
      </div>
      {error && <p className="error">{error}</p>}
      <Btn big disabled={!text.trim() || sending} onClick={send}>
        {sending ? 'Sending…' : 'Send it'}
      </Btn>
    </div>
  );
}

function VotePanel({ v }: { v: PlayerView }) {
  const vote = v.vote;
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!vote) return <LookUp title="Watch the TV!" />;
  const isFinal = v.phase === 'finalVote';

  if (vote.reason === 'author' && !isFinal)
    return (
      <div className="phone-center">
        <Mascot mood="shock" size={130} />
        <h1>This one’s yours!</h1>
        <p className="lookup-sub">Everyone else is voting on your answer right now. Keep a straight face.</p>
      </div>
    );
  if (vote.reason === 'noAnswers') return <LookUp title="Nothing to vote for" sub="Nobody else answered. Awkward!" mood="sad" />;

  const cast = async (key: string) => {
    if (!vote.canVote || pending) return;
    setPending(key);
    const ack = await emit('game:action', { type: 'vote', choice: key });
    if (!ack.ok) {
      setPending(null);
      setError(ack.error ?? 'Vote failed.');
      return;
    }
    sfx('vote');
    vibrate(30);
  };
  const chosen = vote.votedFor ?? pending;

  return (
    <div className="vote-panel">
      <p className="vote-prompt">{vote.prompt}</p>
      <h2 className="vote-head">{chosen ? 'Vote locked in' : vote.canVote ? 'Which is funnier?' : 'Watch the TV!'}</h2>
      <div className={`vote-options ${isFinal ? 'many' : ''}`}>
        {vote.options.map((o, i) => (
          <motion.button
            key={o.key}
            className={`vote-btn vb-${i % 5} ${chosen === o.key ? 'chosen' : ''} ${chosen && chosen !== o.key ? 'faded' : ''} ${o.mine ? 'mine' : ''}`}
            disabled={o.mine || !vote.canVote || !!pending}
            onClick={() => cast(o.key)}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileTap={{ scale: 0.95 }}
          >
            {o.text}
            {o.mine && <span className="mine-tag">yours</span>}
          </motion.button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Standing({ v, label }: { v: PlayerView; label: string }) {
  return (
    <div className="phone-center">
      <p className="muted">{label}</p>
      <motion.div className="rank-big" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
        {ordinal(v.me.rank)}
      </motion.div>
      <p className="lookup-sub">place with <b><CountUp to={v.me.score} /></b> points</p>
      {(v.lastGain ?? 0) > 0 && <p className="gain-line">+{v.lastGain!.toLocaleString()} this round</p>}
    </div>
  );
}

function PhoneGameOver({ v }: { v: PlayerView }) {
  const r = v.results;
  const myRank = r?.ranking.find((x) => x.id === v.me.id)?.rank ?? v.me.rank;
  const won = r?.winnerIds.includes(v.me.id);
  const award = r?.awards.find((a) => a.playerId === v.me.id);
  useEffect(() => {
    if (won) vibrate([80, 60, 80, 60, 200]);
  }, []);
  return (
    <div className="phone-center">
      <Avatar id={v.me.avatar} size={130} mood={won ? 'happy' : myRank <= 3 ? 'wink' : 'sad'} bob />
      <h1>{won ? 'You won.' : `You placed ${ordinal(myRank)}`}</h1>
      {won && r && <p className="award-line">{r.winnerTitle}</p>}
      {award && (
        <p className="award-line">
          {award.title}
          <small>{award.blurb}</small>
        </p>
      )}
      <p className="lookup-sub">{v.me.score.toLocaleString()} points</p>
      {(r?.highlights ?? []).some((h) => h.playerId === v.me.id) && (
        <div className="my-highlights">
          {r!.highlights.filter((h) => h.playerId === v.me.id).map((h) => (
            <div key={h.title} className="my-hl">
              <b>{h.title}</b>
              <small>{h.quote ? `“${h.quote.text}” · ` : ''}{h.value}</small>
            </div>
          ))}
        </div>
      )}
      {v.me.isVip ? (
        <Btn big onClick={() => emit('game:playAgain')}>Play again</Btn>
      ) : (
        <p className="muted">Waiting to see if you’re all playing again…</p>
      )}
      <button className="link-btn" onClick={() => leaveRoom()}>Leave room</button>
    </div>
  );
}

function Rename({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const [err, setErr] = useState('');
  if (!editing)
    return (
      <button className="name-edit" onClick={() => (setVal(name), setEditing(true))}>
        <h1>You’re in, {name}</h1>
        <small>Tap to change your name</small>
      </button>
    );
  const save = async () => {
    const ack = await emit('player:rename', { name: val });
    if (!ack.ok) return setErr(ack.error ?? 'Could not rename.');
    localStorage.setItem(NAME_KEY, val.trim());
    setErr('');
    setEditing(false);
  };
  return (
    <div style={{ width: '100%' }}>
      <div className="rename-row">
        <input value={val} maxLength={MAX_NAME} autoFocus onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button onClick={save}>Save</button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
