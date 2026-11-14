'use client';

import { useEffect, useRef, useState } from 'react';
import { FIELD, direction } from '../lib/football.mjs';
import { MODES } from '../lib/modes.mjs';
import { useGame } from './game-context';

const COLORS = { w: '#73e3d0', b: '#ff907b' };
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

function drawField(ctx, tile, mode) {
  const ice = mode === 'hockey';
  ctx.fillStyle = '#15141b';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.fillStyle = '#292831';
  ctx.fillRect(32, 24, 576, 312);
  ctx.fillStyle = ice ? '#b2d8e5' : '#404044';
  ctx.fillRect(48, 40, 544, 280);
  for (let x = 48; x < 592; x += 16) {
    for (let y = 40; y < 320; y += 16) {
      const height = Math.min(16, 320 - y);
      if (!ice && tile.naturalWidth) ctx.drawImage(tile, 0, 0, 16, height, x, y, 16, height);
      ctx.fillStyle = ice ? ((x + y) % 48 ? '#edfaff16' : '#4e879316') : (Math.floor((x - 48) / 68) % 2) ? '#8b9a7b16' : '#81918535';
      ctx.fillRect(x, y, 16, height);
    }
  }
  ctx.strokeStyle = ice ? '#476e92' : '#a9b0a280';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 40, 544, 280);
  ctx.strokeRect(48, 105, 72, 150);
  ctx.strokeRect(520, 105, 72, 150);
  ctx.beginPath();
  ctx.moveTo(320, 40);
  ctx.lineTo(320, 320);
  ctx.moveTo(320, 219);
  ctx.arc(320, 180, 39, Math.PI / 2, 2.5 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = '#aaa99e';
  ctx.fillRect(318, 178, 4, 4);
  for (const [side, x] of [['w', 26], ['b', 592]]) {
    ctx.fillStyle = '#27272d';
    ctx.fillRect(x, 137, 22, 86);
    ctx.strokeStyle = COLORS[side];
    ctx.strokeRect(x, 137, 22, 86);
    ctx.fillStyle = '#ffffff26';
    for (let y = 143; y < 223; y += 7) ctx.fillRect(x + 2, y, 18, 1);
  }
  for (const x of [69, 193, 320, 447, 571]) {
    for (const y of [21, 333]) {
      ctx.fillStyle = '#85532f';
      ctx.fillRect(x - 5, y + 1, 10, 8);
      ctx.fillStyle = '#e48743';
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = '#ffcf75';
      ctx.fillRect(x - 2, y - 6, 4, 8);
    }
  }
}

function drawPlayer(ctx, actor, position, sprite, mine, tick, serverNow) {
  const x = Math.round(position.x);
  const y = Math.round(position.y);
  const stride = actor.dx || actor.dy ? Math.floor(tick / 95) % 4 : 0;
  const kicking = serverNow - actor.kickAt < 130;
  ctx.fillStyle = '#14131b';
  ctx.fillRect(x - 10, y + 2, 20, 5);
  ctx.fillStyle = COLORS[actor.side];
  ctx.fillRect(x - 8, y + 5, 16, 2);
  if (mine) {
    ctx.fillStyle = '#fff5dc';
    ctx.fillRect(x - 3, y - 30, 7, 3);
    ctx.fillRect(x - 1, y - 27, 3, 2);
  }
  if (!sprite?.naturalWidth) {
    ctx.fillStyle = COLORS[actor.side];
    ctx.fillRect(x - 8, y - 17, 16, 19);
    return;
  }
  ctx.save();
  ctx.translate(x + (kicking ? Math.sign(actor.fx) * 3 : 0), y - (stride === 1 || stride === 3 ? 2 : 0));
  if (actor.fx < 0) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -15, -25, 30, 30);
  ctx.restore();
}

export default function FootballPitch() {
  const { game, controls, connected } = useGame();
  const canvas = useRef(null);
  const latest = useRef(game);
  const [seconds, setSeconds] = useState(180);
  const [waiting, setWaiting] = useState(false);
  const pressed = useRef(new Set());
  const touch = useRef(new Set());
  const { pitch, me, mode } = game;
  const rules = MODES[mode];
  const side = game.players.find(player => player.id === me).side;
  const sendDirection = () => {
    const has = key => touch.current.has(key) || [...pressed.current].some(code => KEYS[code] === key);
    const [x, y] = direction(Number(has('right')) - Number(has('left')), Number(has('down')) - Number(has('up')));
    Object.assign(controls.current, { x, y });
  };

  useEffect(() => { latest.current = game; }, [game]);
  useEffect(() => {
    function clear() {
      pressed.current.clear();
      touch.current.clear();
      Object.assign(controls.current, { x: 0, y: 0, kick: false });
    }
    function down(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('button,input,a')) return;
      if (KEYS[event.code]) {
        event.preventDefault();
        pressed.current.add(event.code);
        sendDirection();
      } else if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) controls.current.kick = true;
      }
    }
    function up(event) {
      if (pressed.current.delete(event.code)) sendDirection();
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    canvas.current.focus({ preventScroll: true });
    return () => {
      clear();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [controls]);

  useEffect(() => {
    const ctx = canvas.current.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const field = document.createElement('canvas');
    field.width = FIELD.width;
    field.height = FIELD.height;
    const base = field.getContext('2d');
    base.imageSmoothingEnabled = false;
    const tile = new Image();
    tile.onload = () => drawField(base, tile, mode);
    tile.src = '/assets/sprites/dark-stone-floor/sheet.png';
    drawField(base, tile, mode);
    const sprites = {};
    for (const { role } of latest.current.players) {
      sprites[role] = new Image();
      sprites[role].src = '/assets/sprites/' + role + '/sheet.png';
    }
    let frame, previous, current, arrival = 0;
    function paint(time) {
      const state = latest.current;
      if (state !== current) {
        previous = current?.pitch.reset === state.pitch.reset ? current : state;
        current = state;
        arrival = time;
      }
      const elapsed = time - arrival;
      const duration = Math.max(1, current.serverNow - previous.serverNow);
      const fraction = Math.min(1, elapsed / duration);
      const interpolate = (from, to) => ({ x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction });
      const now = current.serverNow + elapsed;
      ctx.drawImage(field, 0, 0);
      const actors = current.pitch.actors.map((actor, index) => ({ actor, position: interpolate(previous.pitch.actors[index], actor) }));
      actors.sort((a, b) => a.position.y - b.position.y);
      for (const { actor, position } of actors) drawPlayer(ctx, actor, position, sprites[actor.role], actor.id === me, time, now);
      const ball = interpolate(previous.pitch.ball, current.pitch.ball);
      const x = Math.round(ball.x), y = Math.round(ball.y);
      ctx.fillStyle = '#121218';
      ctx.fillRect(x - 6, y - 4, 12, mode === 'hockey' ? 7 : 10);
      ctx.fillStyle = mode === 'hockey' ? '#555875' : '#fff2c1';
      ctx.fillRect(x - 4, y - 3, 8, mode === 'hockey' ? 4 : 8);
      ctx.fillStyle = mode === 'hockey' ? '#919bb5' : '#aa7749';
      ctx.fillRect(x - 1, y - 2, 3, 2);
      frame = requestAnimationFrame(paint);
    }
    frame = requestAnimationFrame(paint);
    const clock = setInterval(() => {
      if (!current) return;
      const now = current.serverNow + performance.now() - arrival;
      setSeconds(Math.max(0, Math.ceil((current.deadline - now) / 1000)));
      setWaiting(current.pitch.kickoffUntil > now);
    }, 100);
    return () => { tile.onload = null; cancelAnimationFrame(frame); clearInterval(clock); };
  }, [me, mode]);

  function touchButton(key, text, label) {
    function release() { touch.current.delete(key); sendDirection(); }
    return <button type="button" aria-label={label} onPointerDown={event => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      touch.current.add(key);
      sendDirection();
    }} onPointerUp={release} onLostPointerCapture={release}>{text}</button>;
  }

  return <section className="football" aria-label={rules.name + ' match'}>
    <div className="match-score">
      <div className="team-score heroes"><span>Heroes</span><strong>{pitch.score.w}</strong></div>
      <div className="match-time"><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong><span>{pitch.overtime ? rules.tieBreak : `First to ${rules.target} ${rules.unit}`}</span></div>
      <div className="team-score monsters"><strong>{pitch.score.b}</strong><span>Monsters</span></div>
    </div>
    <div className="pitch-frame">
      <canvas ref={canvas} width={FIELD.width} height={FIELD.height} tabIndex={0} aria-label={rules.name + '. Use WASD or arrow keys to move and Space to ' + rules.action.toLowerCase() + '.'} />
      {(waiting || !connected) && <div className="pitch-status" role="status">{connected ? rules.start : 'Reconnecting…'}</div>}
    </div>
    <div className="match-instructions">
      <strong className={side === 'w' ? 'heroes' : 'monsters'}>{side === 'w' ? 'Heroes' : 'Monsters'} · {side === 'w' ? 'attack right' : 'attack left'}</strong>
      <span className="keyboard-help"><kbd>WASD</kbd> or arrows to move · <kbd>Space</kbd> to {rules.action.toLowerCase()}</span>
    </div>
    <div className="touch-controls">
      <div className="direction-pad">
        {touchButton('up', '↑', 'Move up')}
        {touchButton('left', '←', 'Move left')}
        {touchButton('down', '↓', 'Move down')}
        {touchButton('right', '→', 'Move right')}
      </div>
      <button className="primary" onPointerDown={event => { event.preventDefault(); controls.current.kick = true; }}>{rules.action}</button>
    </div>
  </section>;
}
