import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FullscreenButton, HostApp } from './host/HostApp';
import { PlayerApp } from './player/PlayerApp';
import { Avatar, SvgDefs } from './components/Avatar';
import { Btn, Logo, SoundControls, Stage } from './components/ui';
import { createRoom, getSession, useStore } from './net';
import { GAME_LIST } from '../../shared/types';
import { startMusic, unlockAudio } from './audio';

export function navigate(path: string) {
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const f = () => setPath(location.pathname);
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  // Returning to "/" with a live session → send them back into their game.
  useEffect(() => {
    const s = getSession();
    if (path === '/' && s) navigate(s.role === 'host' ? '/host' : '/join');
  }, [path]);

  let page;
  if (path.startsWith('/host')) page = <HostApp />;
  else if (path.startsWith('/join')) page = <PlayerApp initialCode={path.split('/')[2]?.toUpperCase() ?? ''} />;
  else page = <Landing />;
  return (
    <>
      <SvgDefs />
      {page}
    </>
  );
}

const GAMES = GAME_LIST.map((g) => ({ ...g, players: `${g.minPlayers}–${g.maxPlayers} players`, ready: true }));

function Landing() {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { connected } = useStore();
  const isPhone = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;

  const host = async (gameId: string) => {
    setBusy(true);
    setError('');
    unlockAudio();
    const ack = await createRoom(gameId);
    setBusy(false);
    if (!ack.ok) return setError(ack.error ?? 'Could not create a room.');
    navigate('/host');
  };

  useEffect(() => {
    const kick = () => (unlockAudio(), startMusic('menu'));
    window.addEventListener('pointerdown', kick, { once: true });
    startMusic('menu');
    return () => window.removeEventListener('pointerdown', kick);
  }, []);

  return (
    <Stage theme="menu" className="landing">
      <div className="topbar">
        <span className={`conn-dot ${connected ? 'on' : ''}`} title={connected ? 'Connected' : 'Connecting…'} />
        <div className="topbar-right">
          <SoundControls />
          <FullscreenButton />
        </div>
      </div>
      <AnimatePresence mode="wait">
        {!picking ? (
          <motion.div key="home" className="landing-home" exit={{ opacity: 0, scale: 0.9 }}>
            <div className="landing-hero">
              <Logo size={0.85} />
              <div className="landing-cast">
                {[2, 0, 7, 9, 5].map((id, i) => (
                  <motion.div key={id} initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 + i * 0.12, type: 'spring', stiffness: 220, damping: 14 }}>
                    <Avatar id={id} size="100%" bob mood={i === 2 ? 'shock' : 'idle'} />
                  </motion.div>
                ))}
              </div>
            </div>
            <motion.p className="landing-tag" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}>
              The party game where your friends find out how unwell you are.
            </motion.p>
            <motion.div className={`landing-buttons ${isPhone ? 'phone-first' : ''}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.25 }}>
              <Btn big onClick={() => setPicking(true)}>Play Game</Btn>
              <Btn big variant="secondary" onClick={() => navigate('/join')}>Join Game</Btn>
            </motion.div>
            <p className="landing-help">Open <b>Play Game</b> on a TV or laptop. Everyone else taps <b>Join Game</b> on their phone.</p>
          </motion.div>
        ) : (
          <motion.div key="pick" className="game-select" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h1 className="section-title">Pick a game</h1>
            <div className="game-grid">
              {GAMES.map((g, i) => (
                <motion.button
                  key={g.id}
                  className={`game-card card-${g.color} ${g.ready ? '' : 'locked'}`}
                  disabled={!g.ready || busy}
                  initial={{ opacity: 0, y: 40, rotate: i % 2 ? 3 : -3 }}
                  animate={{ opacity: 1, y: 0, rotate: i % 2 ? 1 : -1 }}
                  transition={{ delay: i * 0.08, type: 'spring' }}
                  whileHover={g.ready ? { scale: 1.04, rotate: 0 } : undefined}
                  whileTap={g.ready ? { scale: 0.97 } : undefined}
                  onClick={() => g.ready && host(g.id)}
                >
                  <span className="game-card-name">{g.name}</span>
                  <span className="game-card-tag">{g.tag}</span>
                  <span className="game-card-meta">{g.players}{g.time ? ` · ${g.time}` : ''}</span>
                  {g.ready ? <span className="game-card-cta">{busy ? 'Opening…' : 'Start a room ▶'}</span> : <span className="game-card-soon">Coming soon</span>}
                </motion.button>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <Btn variant="ghost" onClick={() => setPicking(false)}>← Back</Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </Stage>
  );
}
