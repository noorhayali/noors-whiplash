import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { HostView, PlayerView } from '../../../shared/types';
import { sfx, vibrate } from '../audio';
import { Avatar } from '../components/Avatar';
import { Btn, TimerRing } from '../components/ui';
import { emit, socket } from '../net';
import { byId, GameIntro, PhoneLookUp } from './common';

type Stroke = { c: number; w: number; p: number[] };
const W = 1200;
const H = 900; // 4:3 board; stroke coords are 0..1000 on each axis

function paint(ctx: CanvasRenderingContext2D, s: Stroke, colors: string[], widths: number[], from = 0) {
  ctx.strokeStyle = colors[s.c] ?? '#000';
  ctx.fillStyle = colors[s.c] ?? '#000';
  ctx.lineWidth = (widths[s.w] ?? 6) * 1.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = s.p;
  if (pts.length === 2 && from === 0) {
    ctx.beginPath();
    ctx.arc((pts[0] * W) / 1000, (pts[1] * H) / 1000, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  const start = Math.max(0, from - 2);
  ctx.moveTo((pts[start] * W) / 1000, (pts[start + 1] * H) / 1000);
  for (let i = start + 2; i + 1 < pts.length; i += 2) ctx.lineTo((pts[i] * W) / 1000, (pts[i + 1] * H) / 1000);
  ctx.stroke();
}

function redraw(canvas: HTMLCanvasElement | null, strokes: Stroke[], colors: string[], widths: number[]) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, W, H);
  for (const s of strokes) paint(ctx, s, colors, widths);
}

/** TV board: full state from the server, plus live deltas streamed while the artist draws. */
function Board({ strokes, colors, widths }: { strokes: Stroke[]; colors: string[]; widths: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const local = useRef<Stroke[]>([]);
  useEffect(() => {
    local.current = strokes.map((s) => ({ ...s, p: [...s.p] }));
    redraw(ref.current, local.current, colors, widths);
  }, [strokes]);
  useEffect(() => {
    const on = (d: any) => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      if (d.t === 's') {
        const s = { c: d.c, w: d.w, p: [...d.p] };
        local.current.push(s);
        paint(ctx, s, colors, widths);
      } else if (d.t === 'm') {
        const s = local.current[local.current.length - 1];
        if (!s) return;
        const from = s.p.length;
        s.p.push(...d.p);
        paint(ctx, s, colors, widths, from);
      } else if (d.t === 'u') {
        local.current.pop();
        redraw(ref.current, local.current, colors, widths);
      } else if (d.t === 'c') {
        local.current = [];
        redraw(ref.current, local.current, colors, widths);
      }
    };
    socket.on('draw', on);
    return () => void socket.off('draw', on);
  }, [colors, widths]);
  return <canvas ref={ref} width={W} height={H} className="doodle-board" />;
}

export function DoodleHost({ v }: { v: HostView }) {
  const d = v.data ?? {};
  const players = byId(v.players);
  const artist = d.artist ? players[d.artist] : null;
  switch (v.phase) {
    case 'intro':
      return (
        <GameIntro
          name="DOODLE DUEL"
          rules={[
            { art: [7], title: 'Draw', text: 'Everyone takes a turn drawing a secret (and usually filthy) word on their phone.' },
            { art: [1, 10], title: 'Guess', text: 'Everyone else types guesses. The faster you get it, the more points.' },
            { art: [6, 4, 11], title: 'Score', text: 'Up to 1,000 for guessing fast. The artist gets 250 for every right guess.' },
          ]}
          strip={<span>No letters, no numbers. Just your shameful art skills.</span>}
        />
      );
    case 'choose':
      return (
        <div className="round-intro">
          <span className="matchup-count">Turn {v.round} of {v.totalRounds}</span>
          {artist && (
            <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }}>
              <Avatar id={artist.avatar} size="calc(var(--u) * 20)" bob mood="wink" />
            </motion.div>
          )}
          <h1 className="big-head">{artist?.name ?? 'Someone'} is picking a word…</h1>
          <p className="round-sub" style={{ marginTop: 0 }}>Everyone else: get your guessing thumbs ready.</p>
        </div>
      );
    case 'draw':
    case 'reveal': {
      const reveal = v.phase === 'reveal';
      return (
        <div className="doodle">
          <div className="doodle-left">
            <div className="doodle-head">
              {artist && <Avatar id={artist.avatar} size="calc(var(--u) * 5)" mood={reveal ? 'happy' : 'idle'} />}
              <span><b>{artist?.name}</b> {reveal ? 'drew' : 'is drawing'}</span>
              <span className="matchup-count">Turn {v.round} of {v.totalRounds}</span>
            </div>
            <div className="doodle-frame">
              <Board strokes={d.strokes ?? []} colors={d.colors} widths={d.widths} />
              <AnimatePresence>
                {reveal && (
                  <motion.div className="doodle-word" initial={{ scale: 3, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: -4 }}>
                    {d.word}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {!reveal && <div className="doodle-hint">{(d.hint ?? '').split('').map((c: string, i: number) => <span key={i} className={c === ' ' ? 'gap' : ''}>{c === ' ' ? '' : c}</span>)}</div>}
          </div>
          <div className="doodle-right">
            {!reveal && <TimerRing timer={v.timer} size="calc(var(--u) * 9)" paused={v.paused} />}
            <div className="doodle-correct">
              <span className="fib-col-label">{reveal ? `Got it · artist earns +${d.artistPoints}` : 'Got it'}</span>
              {d.correct.length === 0 && <span className="muted">nobody yet</span>}
              {d.correct.map((c: any) => players[c.id] && (
                <motion.div key={c.id} className="feed-item correct" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                  <Avatar id={players[c.id].avatar} size="calc(var(--u) * 3)" mood="happy" />
                  <b>{players[c.id].name}</b>
                  <span className="gain-chip">+{c.pts}</span>
                </motion.div>
              ))}
            </div>
            {!reveal && (
              <div className="doodle-feed">
                <span className="fib-col-label">Guesses</span>
                <AnimatePresence initial={false}>
                  {[...d.feed].reverse().filter((f: any) => f.kind !== 'correct').slice(0, 7).map((f: any) => players[f.pid] && (
                    <motion.div key={f.id} className={`feed-item ${f.kind}`} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
                      <Avatar id={players[f.pid].avatar} size="calc(var(--u) * 2.6)" />
                      <span>{f.kind === 'close' ? <i>{players[f.pid].name} is so close…</i> : <><b>{players[f.pid].name}:</b> {f.text}</>}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      );
    }
  }
  return null;
}

// ---------------- phone ----------------
export function DoodlePhone({ v }: { v: PlayerView }) {
  const d = v.data ?? {};
  const artistName = v.players.find((p) => p.id === d.artist)?.name ?? 'Someone';
  switch (v.phase) {
    case 'intro':
      return <PhoneLookUp title="Doodle Duel" sub="Rules are on the TV. Stretch your drawing finger." mood="wink" />;
    case 'choose':
      if (!d.isArtist) return <PhoneLookUp title={`${artistName} is choosing`} sub="Get ready to guess." />;
      return (
        <div className="phone-center">
          <h1>Your turn to draw</h1>
          <p className="lookup-sub">Pick a word. Only you can see these.</p>
          {d.choices.map((w: string, i: number) => (
            <Btn key={w} big variant={i ? 'secondary' : 'primary'} onClick={() => emit('game:action', { type: 'choose', index: i })}>
              {w}
            </Btn>
          ))}
        </div>
      );
    case 'draw':
      return d.isArtist ? <DrawPad key={v.round} v={v} /> : <GuessPad key={v.round} v={v} />;
    case 'reveal':
      return (
        <PhoneLookUp title={`It was “${d.word}”`} sub={d.isArtist ? `${d.correctCount} ${d.correctCount === 1 ? 'person' : 'people'} got your masterpiece.` : d.gotIt ? `You got it for +${d.myPoints}.` : 'You missed it.'} mood={d.gotIt || (d.isArtist && d.correctCount) ? 'happy' : 'sad'} />
      );
  }
  return null;
}

function GuessPad({ v }: { v: PlayerView }) {
  const d = v.data;
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'close' | 'wrong' | 'err'; text: string } | null>(null);
  const artistName = v.players.find((p) => p.id === d.artist)?.name ?? 'The artist';
  if (d.gotIt)
    return (
      <PhoneLookUp title="You got it!" sub={`+${d.myPoints} points. Now enjoy watching everyone else struggle.`} mood="happy" />
    );
  const send = async () => {
    if (!text.trim()) return;
    const ack = await emit<{ correct: boolean; close?: boolean }>('game:action', { type: 'guess', text });
    if (!ack.ok) return setMsg({ kind: 'err', text: ack.error ?? 'Try again' });
    if (ack.data?.correct) {
      sfx('score');
      vibrate([40, 40, 80]);
    } else {
      setMsg(ack.data?.close ? { kind: 'close', text: 'So close!' } : { kind: 'wrong', text: `Not “${text}”` });
      vibrate(15);
    }
    setText('');
  };
  return (
    <div className="write-panel">
      <span className="step-chip">{artistName} is drawing</span>
      <div className="doodle-hint hint-phone">{(d.hint ?? '').split('').map((c: string, i: number) => <span key={i} className={c === ' ' ? 'gap' : ''}>{c === ' ' ? '' : c}</span>)}</div>
      <p className="lookup-sub" style={{ textAlign: 'center' }}>Look at the TV and guess</p>
      <div className="rename-row">
        <input value={text} maxLength={40} placeholder="Your guess…" autoFocus enterKeyHint="send" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button onClick={send}>Guess</button>
      </div>
      {msg && <p className={`guess-msg ${msg.kind}`}>{msg.text}</p>}
    </div>
  );
}

function DrawPad({ v }: { v: PlayerView }) {
  const d = v.data;
  const colors: string[] = d.colors;
  const widths: number[] = d.widths;
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>((d.strokes ?? []).map((s: Stroke) => ({ ...s, p: [...s.p] })));
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  const buf = useRef<number[]>([]);
  const drawing = useRef(false);

  useEffect(() => redraw(ref.current, strokes.current, colors, widths), []);
  useEffect(() => {
    const t = setInterval(() => {
      if (buf.current.length) {
        socket.emit('draw', { t: 'm', p: buf.current });
        buf.current = [];
      }
    }, 60);
    return () => clearInterval(t);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)];
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    if (buf.current.length) socket.emit('draw', { t: 'm', p: buf.current });
    buf.current = [];
    const [x, y] = pos(e);
    const s = { c: color, w: width, p: [x, y] };
    strokes.current.push(s);
    paint(ref.current!.getContext('2d')!, s, colors, widths);
    socket.emit('draw', { t: 's', c: color, w: width, p: [x, y] });
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const s = strokes.current[strokes.current.length - 1];
    const [x, y] = pos(e);
    const lx = s.p[s.p.length - 2];
    const ly = s.p[s.p.length - 1];
    if (Math.abs(x - lx) + Math.abs(y - ly) < 4) return;
    const from = s.p.length;
    s.p.push(x, y);
    buf.current.push(x, y);
    paint(ref.current!.getContext('2d')!, s, colors, widths, from);
    if (buf.current.length >= 380) {
      socket.emit('draw', { t: 'm', p: buf.current });
      buf.current = [];
    }
  };
  const up = () => (drawing.current = false);
  const undo = () => {
    if (buf.current.length) socket.emit('draw', { t: 'm', p: buf.current }), (buf.current = []);
    strokes.current.pop();
    redraw(ref.current, strokes.current, colors, widths);
    socket.emit('draw', { t: 'u' });
  };
  const clear = () => {
    buf.current = [];
    strokes.current = [];
    redraw(ref.current, strokes.current, colors, widths);
    socket.emit('draw', { t: 'c' });
  };

  return (
    <div className="draw-pad">
      <div className="draw-word">Draw: <b>{d.word}</b></div>
      <canvas ref={ref} width={W} height={H} className="draw-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="draw-tools">
        <div className="swatches">
          {colors.map((c, i) => (
            <button key={c} className={`swatch ${i === color ? 'on' : ''}`} style={{ background: c }} aria-label={`colour ${i + 1}`} onClick={() => setColor(i)} />
          ))}
        </div>
        <div className="draw-actions">
          {widths.map((w, i) => (
            <button key={w} className={`size ${i === width ? 'on' : ''}`} onClick={() => setWidth(i)} aria-label={`brush ${i + 1}`}>
              <span style={{ width: 6 + i * 7, height: 6 + i * 7 }} />
            </button>
          ))}
          <button className="tool" onClick={undo}>Undo</button>
          <button className="tool" onClick={clear}>Clear</button>
        </div>
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>{d.correctCount} guessed it so far · no letters allowed</p>
      </div>
    </div>
  );
}
