import { AnimatePresence, motion } from 'framer-motion';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HostView } from '../../../shared/types';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../../shared/types';
import { sfx, startMusic, stopMusic, unlockAudio, type MusicTheme } from '../audio';
import { Avatar, Mascot } from '../components/Avatar';
import { Btn, Logo, SoundControls, Stage, themeForRound, useAudioPrefs, type Theme } from '../components/ui';
import { navigate } from '../App';
import { clearNotice, createRoom, emit, getSession, leaveRoom, newRoom, useStore } from '../net';
import { FinalBoard, FinalIntro, GameOver, Intro, Matchup, RoundIntro, Scoreboard, Writing } from './phases';

export function HostApp() {
  const { view, connected, notice } = useStore();
  const session = getSession();
  const audio = useAudioPrefs();

  if (notice && !view)
    return (
      <Stage theme="menu">
        <div className="center-msg">
          <Mascot mood="sad" size={220} />
          <h1>{notice}</h1>
          <Btn big onClick={() => newRoom()}>Start a new room</Btn>
          <Btn variant="ghost" onClick={() => (clearNotice(), navigate('/'))}>Main menu</Btn>
        </div>
      </Stage>
    );

  if (!session || session.role !== 'host')
    return (
      <Stage theme="menu">
        <div className="center-msg">
          <Logo size={0.7} />
          <h1>No room open on this screen</h1>
          <Btn big onClick={() => (unlockAudio(), createRoom().then(() => navigate('/host')))}>Create a room</Btn>
          <Btn variant="ghost" onClick={() => navigate('/')}>Main menu</Btn>
        </div>
      </Stage>
    );

  if (!view || view.role !== 'host')
    return (
      <Stage theme="menu">
        <div className="center-msg">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} className="spinner" />
          <h2>{connected ? 'Setting up the stage…' : 'Connecting to the server…'}</h2>
        </div>
      </Stage>
    );

  return (
    <>
      <HostScreen v={view} />
      {!audio.ready && (
        <button className="sound-unlock" onClick={() => unlockAudio()}>
          Click anywhere to turn on sound
        </button>
      )}
      {!connected && <div className="offline-banner">Reconnecting to the server…</div>}
    </>
  );
}

function useHostAudio(v: HostView) {
  const prev = useRef<HostView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    // Music follows the show.
    const theme: MusicTheme | null =
      v.phase === 'lobby' ? 'menu'
      : v.phase === 'gameOver' ? null
      : v.phase === 'vote' || v.phase === 'finalVote' ? 'tense'
      : v.round >= 4 ? 'final'
      : (`round${Math.max(1, v.round)}` as MusicTheme);
    if (theme) startMusic(theme);
    else stopMusic();

    if (!p) return;
    if (v.players.length > p.players.length) sfx('join');
    if (v.phase !== p.phase) {
      if (v.phase === 'reveal') sfx('whoosh');
      if (v.phase === 'intro' || v.phase === 'roundIntro' || v.phase === 'finalIntro') sfx('reveal');
      if (v.phase === 'matchupResult') {
        sfx('reveal');
        if (v.matchup?.answers.some((a) => a.sweep)) setTimeout(() => sfx('sweep'), 1300);
        else setTimeout(() => sfx('score'), 1300);
      }
      if (v.phase === 'finalResult') setTimeout(() => sfx('score'), 900);
      if (v.phase === 'scoreboard') sfx('score');
      if (v.phase === 'finalVote') sfx('whoosh');
      if (v.phase === 'gameOver') setTimeout(() => sfx('victory'), 1200);
    }
    if ((v.writing?.done.length ?? 0) > (p.writing?.done.length ?? 0)) sfx('submit');
    if (v.matchup && p.matchup && v.matchup.voted > p.matchup.voted) sfx('vote');
    if (v.final && p.final && v.final.voted > p.final.voted) sfx('vote');
  }, [v]);
}

function HostScreen({ v }: { v: HostView }) {
  useHostAudio(v);
  const theme: Theme = v.phase === 'lobby' ? 'menu' : v.phase === 'gameOver' ? 'win' : themeForRound(v.round);
  const skippable = ['intro', 'roundIntro', 'reveal', 'matchupResult', 'scoreboard', 'finalIntro', 'finalResult'].includes(v.phase);
  const key = v.phase === 'reveal' || v.phase === 'vote' || v.phase === 'matchupResult' ? `m-${v.round}-${v.matchup?.index}` : v.phase === 'finalVote' || v.phase === 'finalResult' ? 'finalboard' : `${v.phase}-${v.round}`;
  const [menu, setMenu] = useState(false);

  return (
    <Stage theme={theme} className="host">
      <div className="topbar">
        {v.phase !== 'lobby' && (
          <div className="room-chip">
            Room <b>{v.code}</b>
          </div>
        )}
        <div className="topbar-right">
          {skippable && (
            <button className="chip-btn" onClick={() => emit('host:skip')}>
              Skip
            </button>
          )}
          <SoundControls />
          <button className="icon-btn" aria-label="Room menu" onClick={() => setMenu(!menu)}>☰</button>
        </div>
        {menu && (
          <motion.div className="host-menu" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            {v.phase !== 'lobby' && <button onClick={() => (emit('host:backToLobby'), setMenu(false))}>End game → lobby</button>}
            <button onClick={() => (newRoom(), setMenu(false))}>Start a new room</button>
            <button onClick={() => leaveRoom().then(() => navigate('/'))}>Close room & exit</button>
          </motion.div>
        )}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={key} className="host-phase" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }} transition={{ duration: 0.35 }}>
          {v.phase === 'lobby' && <Lobby v={v} />}
          {v.phase === 'intro' && <Intro v={v} />}
          {v.phase === 'roundIntro' && <RoundIntro v={v} />}
          {(v.phase === 'writing' || v.phase === 'finalWriting') && <Writing v={v} />}
          {(v.phase === 'reveal' || v.phase === 'vote' || v.phase === 'matchupResult') && <Matchup v={v} />}
          {v.phase === 'scoreboard' && <Scoreboard v={v} />}
          {v.phase === 'finalIntro' && <FinalIntro v={v} />}
          {(v.phase === 'finalVote' || v.phase === 'finalResult') && <FinalBoard v={v} />}
          {v.phase === 'gameOver' && <GameOver v={v} />}
        </motion.div>
      </AnimatePresence>
      {v.paused && v.phase !== 'lobby' && <div className="paused-banner">Paused</div>}
    </Stage>
  );
}

function useJoinUrl(code: string) {
  const [base, setBase] = useState(location.origin);
  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then((info: { publicUrl: string | null; lan: string[] }) => {
        if (info.publicUrl) setBase(info.publicUrl.replace(/\/$/, ''));
        else if (['localhost', '127.0.0.1'].includes(location.hostname) && info.lan[0])
          setBase(`${location.protocol}//${info.lan[0]}${location.port ? ':' + location.port : ''}`);
      })
      .catch(() => {});
  }, []);
  return { base, full: `${base}/join/${code}` };
}

function Lobby({ v }: { v: HostView }) {
  const { base, full } = useJoinUrl(v.code);
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(full, { margin: 1, width: 480, color: { dark: '#1b1035', light: '#ffffff' } }).then(setQr);
  }, [full]);
  const slots = useMemo(() => Array.from({ length: MAX_PLAYERS }, (_, i) => v.players[i] ?? null), [v.players]);
  const need = Math.max(0, MIN_PLAYERS - v.players.filter((p) => p.connected).length);

  return (
    <div className="lobby">
      <div className="lobby-left">
        <div className="lobby-logo">
          <Logo size={0.42} />
          {v.settings.spicy && <span className="tag-18">18+</span>}
        </div>
        <div className="join-card">
          <div className="join-step">
            <span className="join-label">Go to</span>
            <span className="join-url">{base.replace(/^https?:\/\//, '')}</span>
          </div>
          <div className="join-step">
            <span className="join-label">Enter code</span>
            <div className="code-tiles">
              {v.code.split('').map((ch, i) => (
                <motion.span key={i} className="code-tile" initial={{ rotateX: 90 }} animate={{ rotateX: 0, rotate: i % 2 ? 3 : -3 }} transition={{ delay: 0.2 + i * 0.12, type: 'spring' }}>
                  {ch}
                </motion.span>
              ))}
            </div>
          </div>
          <div className="qr-wrap">
            {qr && <img src={qr} alt={`QR code to join room ${v.code}`} className="qr" />}
            <span>or scan to join</span>
          </div>
        </div>
      </div>
      <div className="lobby-right">
        <div className="lobby-heading">
          <h2>Players</h2>
          <span className="count-badge">{v.players.length} / {MAX_PLAYERS}</span>
        </div>
        <div className="player-grid">
          {slots.map((p, i) => (
            <div key={p?.id ?? `empty-${i}`} className={`slot ${p ? 'filled' : 'empty'}`}>
              <AnimatePresence>
                {p ? (
                  <motion.div className={`slot-player ${p.connected ? '' : 'offline'}`} initial={{ y: -260, scale: 0.4, rotate: -30 }} animate={{ y: 0, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 13 }}>
                    <Avatar id={p.avatar} size="72%" bob mood="happy" />
                    <span className="slot-name">
                      {p.isVip && <span className="vip">VIP</span>}
                      {p.name}
                    </span>
                    {!p.connected && <span className="slot-off">reconnecting…</span>}
                    <button className="kick" title={`Remove ${p.name}`} onClick={() => emit('host:kick', { playerId: p.id })}>×</button>
                  </motion.div>
                ) : (
                  <span className="slot-wait">?</span>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <div className="lobby-footer">
          <div className="setting">
            Content
            <div className="toggle">
              <button className={v.settings.spicy ? 'on' : ''} onClick={() => emit('host:settings', { spicy: true })}>Spicy 18+</button>
              <button className={!v.settings.spicy ? 'on' : ''} onClick={() => emit('host:settings', { spicy: false })}>Family</button>
            </div>
          </div>
          <label className="setting">
            Answer time
            <select value={v.settings.writingSeconds} onChange={(e) => emit('host:settings', { writingSeconds: Number(e.target.value) })}>
              {[45, 60, 90, 120].map((s) => (
                <option key={s} value={s}>{s} seconds</option>
              ))}
            </select>
          </label>
          <Btn big disabled={!v.canStart} onClick={() => emit('game:start')}>
            {v.canStart ? 'Everybody’s in! ▶' : `Need ${need} more player${need === 1 ? '' : 's'}`}
          </Btn>
          {v.canStart && <span className="lobby-hint">The VIP can also start from their phone.</span>}
        </div>
      </div>
    </div>
  );
}

