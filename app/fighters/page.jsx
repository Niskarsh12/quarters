'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import GameMarquee from '../../components/game-marquee';
import { NearRecovery, NearStake, StakeSelect, useNearConfig } from '../../components/near-stake';
import { GAMES } from '../../lib/arcade.mjs';
import { ROSTER, SPECIALS, STAGE, STEP, botInput, createFight, stepFight } from '../../lib/fighters.mjs';
import { drawProjectile, drawSpecial } from './effects';
import './fighters.css';

const ids = Object.keys(ROSTER);
const cabinet = GAMES.find(game => game.id === 'fighters');
const keys = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', ArrowDown: 'guard', KeyS: 'guard',
  KeyZ: 'light', KeyX: 'heavy', KeyC: 'special',
};

const asset = id => '/assets/fighters/' + id + '.png';

function Portrait({ id, label, pose = 0 }) {
  return <div className="fighter-portrait" role="img" aria-label={label || ROSTER[id].name}
    style={{ backgroundImage: 'url(' + asset(id) + ')', backgroundPositionX: pose * 20 + '%' }} />;
}

function Arena({ fight, matchRef, online, index, controls, onRematch, onExit, waitingForRematch, stake, command }) {
  const canvas = useRef(null);
  const held = useRef(new Map());
  const [soundOn, setSoundOn] = useState(false);
  const audio = useRef(null);
  const soundEnabled = useRef(false);
  function toggleSound() {
    if (soundEnabled.current) {
      soundEnabled.current = false;
      setSoundOn(false);
      return;
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio.current ??= new Audio();
    audio.current.resume().catch(() => {});
    soundEnabled.current = true;
    setSoundOn(true);
  }
  function update() {
    const actions = [...held.current.values()];
    controls.current.move = Number(actions.includes('right')) - Number(actions.includes('left'));
    controls.current.guard = actions.includes('guard');
  }
  function press(id, action) {
    held.current.set(id, action);
    if (action === 'jump') controls.current.jump = true;
    if (['light', 'heavy', 'special'].includes(action)) controls.current.attack = action;
    update();
  }
  function release(id) {
    held.current.delete(id);
    update();
  }
  useEffect(() => {
    function down(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('input,textarea,select')) return;
      if (!keys[event.code]) return;
      event.preventDefault();
      if (!event.repeat) press(event.code, keys[event.code]);
    }
    function up(event) { release(event.code); }
    function clear() {
      held.current.clear();
      Object.assign(controls.current, { move: 0, guard: false, attack: null, jump: false });
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      clear();
    };
  }, [controls]);

  useEffect(() => {
    const ctx = canvas.current.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const stage = new Image();
    stage.src = asset('forge');
    const sprites = Object.fromEntries(ids.map(id => {
      const image = new Image();
      image.src = asset(id);
      return [id, image];
    }));
    let frame;
    let health = [];
    let matchRound = 0;
    let spark = null;
    function draw(time) {
      const data = matchRef.current;
      ctx.fillStyle = '#21152b';
      ctx.fillRect(0, 0, STAGE.width, STAGE.height);
      if (stage.naturalWidth) ctx.drawImage(stage, 0, 0, STAGE.width, STAGE.height);
      if (data) {
        if (matchRound !== data.round) health = [];
        matchRound = data.round;
        data.actors.forEach((fighter, n) => {
          const x = Math.round(fighter.x);
          const fallen = fighter.hp === 0 && data.knockoutFrame != null;
          const fall = fallen ? Math.min(1, (data.frame - data.knockoutFrame) / 19) : 0;
          const y = STAGE.floor - Math.round(fighter.y * (1 - fall));
          const source = sprites[fighter.id];
          const special = fighter.attack?.type === 'special' ? SPECIALS[fighter.id] : null;
          const attacking = fighter.attack && fighter.attack.age >= (special ? special.active - 2 : fighter.attack.type === 'light' ? 4 : 9);
          const pose = fighter.stun || fighter.guard ? 5 : attacking ? Number(fighter.attack.type !== 'light') + 3
            : fighter.y > 0 ? 2 : fighter.walk ? Math.floor(time / 95) % 2 : 0;
          ctx.fillStyle = '#160f19aa';
          ctx.beginPath();
          ctx.ellipse(x, STAGE.floor + 2, 31, 5, 0, 0, 2 * Math.PI);
          ctx.fill();
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(fighter.facing, 1);
          if (source.naturalWidth) {
            const bob = !pose && !fighter.stun ? Math.floor(time / 160) % 2 : 0;
            if (fallen) {
              ctx.translate(0, -34 * fall);
              ctx.rotate(-fall * Math.PI / 2);
              ctx.drawImage(source, 5 * 160, 0, 160, 144, -80, -133 + 49 * fall, 160, 144);
            } else {
              ctx.drawImage(source, pose * 160, 0, 160, 144, -80, -133 - bob, 160, 144);
              if (special) drawSpecial(ctx, fighter, special.active);
            }
          }
          ctx.restore();
          if (health[n] > fighter.hp) {
            spark = { x: x - fighter.facing * 12, y: y - 57, time };
            if (soundEnabled.current && audio.current?.state === 'running') {
              const tone = audio.current.createOscillator();
              const gain = audio.current.createGain();
              const now = audio.current.currentTime;
              tone.type = 'triangle';
              tone.frequency.setValueAtTime(185, now);
              tone.frequency.exponentialRampToValueAtTime(49, now + .09);
              gain.gain.setValueAtTime(.13, now);
              gain.gain.exponentialRampToValueAtTime(.001, now + .12);
              tone.connect(gain).connect(audio.current.destination);
              tone.start();
              tone.stop(now + .13);
            }
          }
          health[n] = fighter.hp;
        });
        for (const p of data.projectiles) {
          drawProjectile(ctx, p.x, STAGE.floor - p.y, p.dx, data.frame);
        }
        if (spark && time - spark.time < 130) {
          ctx.strokeStyle = '#fff2a0';
          ctx.lineWidth = 3;
          for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4;
            const r = 5 + (time - spark.time) / 9;
            ctx.beginPath();
            ctx.moveTo(spark.x + Math.cos(angle) * r, spark.y + Math.sin(angle) * r);
            ctx.lineTo(spark.x + Math.cos(angle) * (r + 8), spark.y + Math.sin(angle) * (r + 8));
            ctx.stroke();
          }
        }
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      audio.current?.close().catch(() => {});
    };
  }, [matchRef]);

  function touch(action, label) {
    return <button key={action} type="button" onPointerDown={event => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      press(event.pointerId, action);
    }} onPointerUp={event => release(event.pointerId)} onLostPointerCapture={event => release(event.pointerId)}>{label}</button>;
  }

  const done = fight.winner !== null;
  return <section className="duel">
    <div className="duel-toolbar"><button onClick={onExit}>← Fighter select</button><span>{online ? 'Online versus' : 'CPU practice'} · The Forge</span><button onClick={toggleSound}>{soundOn ? 'Sound on' : 'Sound off'}</button></div>
    <div className="fight-frame">
      <canvas ref={canvas} width={STAGE.width} height={STAGE.height} aria-label="The Forge fighting arena" />
      <div className="fight-hud">
        {fight.actors.map((fighter, i) => <div className={'fight-health side-' + i} key={i}>
          <div className="health-name"><strong>{ROSTER[fighter.id].name}</strong><small>{index === i ? 'You' : online ? 'Rival' : 'CPU'}</small></div>
          <div className="health-track"><i style={{ width: fighter.hp / ROSTER[fighter.id].hp * 100 + '%' }} /></div>
          <div className="fight-secondary"><span className="round-pips" aria-label={fight.wins[i] + ' rounds won'}>{[0, 1].map(round => <i key={round} data-won={fight.wins[i] > round} />)}</span><div className="meter-track" aria-label="Special meter"><i style={{ width: fighter.meter + '%' }} /></div></div>
        </div>)}
        <div className="fight-clock"><strong>{Math.ceil(fight.roundFrames / 60)}</strong><span>Round {fight.round}</span></div>
      </div>
      {fight.banner > 0 && !done && <div className="round-call">{fight.result || (fight.banner > 51 ? 'Round ' + fight.round : fight.banner > 25 ? 'Ready?' : 'FIGHT!')}</div>}
      {done && <div className="duel-result"><p>{fight.wins.join(' – ')} · Match result</p><h2>{fight.winner < 0 ? 'Draw' : fight.winner === index ? 'You win!' : ROSTER[fight.ids[fight.winner]].name + ' wins'}</h2>{!stake && <button className="fighter-primary" disabled={waitingForRematch} onClick={onRematch}>{waitingForRematch ? 'Waiting for rival' : 'Rematch'}</button>}<button onClick={onExit}>Fighter select</button></div>}
    </div>
    {done && stake && <NearStake stake={stake} action={command} finished/>}
    <div className="fight-controls" aria-label="Touch controls">
      <div>{touch('left', '←')}{touch('right', '→')}{touch('jump', 'Jump')}{touch('guard', 'Block')}</div>
      <div>{touch('light', 'Light')}{touch('heavy', 'Heavy')}{touch('special', 'Special')}</div>
    </div>
    <p className="key-guide"><kbd>←</kbd> <kbd>→</kbd> Move · <kbd>↑</kbd> Jump · <kbd>↓</kbd> Block · <kbd>Z</kbd> Light · <kbd>X</kbd> Heavy · <kbd>C</kbd> Special</p>
  </section>;
}

export default function Fighters() {
  const [selected, setSelected] = useState('knight');
  const [opponent, setOpponent] = useState('rogue');
  const [showMove, setShowMove] = useState(false);
  const [code, setCode] = useState('');
  const [room, setRoom] = useState(null);
  const [fight, setFight] = useState(null);
  const [practice, setPractice] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stake, setStake] = useState('0');
  const near = useNearConfig();
  const controls = useRef({ move: 0, guard: false, jump: false, attack: null });
  const matchRef = useRef(null);
  const seat = useRef(null);
  const session = useRef(0);
  const stats = ROSTER[selected];

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('dungeon-fighter-seat') || 'null');
      if (saved) {
        seat.current = saved;
        setRoom({ code: saved.code });
      }
    } catch {}
  }, []);

  function applyFight(data) {
    matchRef.current = data;
    setFight(data ? { ...data } : null);
  }

  function startPractice() {
    setError('');
    setPractice(true);
    applyFight(createFight([selected, opponent]));
  }

  function consume() {
    const input = { ...controls.current };
    controls.current.jump = false;
    controls.current.attack = null;
    return input;
  }

  useEffect(() => {
    if (!practice) return;
    let raf;
    let last = performance.now();
    let nextHud = last;
    function simulate(now) {
      last = Math.max(last, now - 100);
      const data = matchRef.current;
      if (data?.winner === null) {
        while (now - last >= STEP) {
          last += STEP;
          stepFight(data, [data.banner ? controls.current : consume(), botInput(data)]);
        }
        if (now >= nextHud || data.winner !== null) {
          setFight({ ...data });
          nextHud = now + 40;
        }
      }
      raf = requestAnimationFrame(simulate);
    }
    raf = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(raf);
  }, [practice]);

  async function request(action, fields = {}, signal) {
    const response = await fetch('/api/fighters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(seat.current ? { Authorization: 'Bearer ' + seat.current.token } : {}) },
      body: JSON.stringify({ action, code: seat.current?.code, ...fields }),
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }

  async function command(action, fields) {
    const generation = ++session.current;
    setError('');
    setBusy(true);
    try {
      const result = await request(action, fields, AbortSignal.timeout(5000));
      if (generation !== session.current) return;
      if (result.token) {
        seat.current = { code: result.code, token: result.token };
        sessionStorage.setItem('dungeon-fighter-seat', JSON.stringify(seat.current));
      }
      setRoom(result);
      applyFight(result.fight);
      return true;
    } catch (failure) {
      if (generation === session.current) setError(failure.message);
    } finally {
      if (generation === session.current) setBusy(false);
    }
  }

  const joined = Boolean(room);
  useEffect(() => {
    if (!joined) return;
    let stopped = false;
    let timer;
    async function sync() {
      const generation = session.current;
      try {
        const result = await request('sync', { input: consume() }, AbortSignal.timeout(3000));
        if (!stopped && session.current === generation) {
          setRoom(result);
          applyFight(result.fight);
          setError('');
        }
      } catch (failure) {
        if (!stopped && session.current === generation) setError(failure.message);
      }
      if (!stopped) timer = setTimeout(sync, matchRef.current?.winner === null ? 38 : 450);
    }
    sync();
    return () => { stopped = true; clearTimeout(timer); };
  }, [joined]);

  function exit() {
    session.current++;
    seat.current = null;
    sessionStorage.removeItem('dungeon-fighter-seat');
    setRoom(null);
    setError('');
    setBusy(false);
    setPractice(false);
    applyFight(null);
  }

  return <main className="fighters-page">
    <nav className="cabinet-nav"><Link href="/">← Dungeon Stake</Link><span>Dungeon Fighters</span></nav>
    {error && <p className="cabinet-error" role="alert">{error}</p>}
    {fight ? <Arena fight={fight} matchRef={matchRef} online={joined} controls={controls} index={room?.index ?? 0} stake={room?.stake} command={command}
      waitingForRematch={joined && (busy || room.seats[room.index]?.ready)}
      onExit={exit} onRematch={() => joined ? command('ready') : startPractice()} /> : room ? (
      <section className="versus-room">
        <h1>Versus lobby</h1>
        <p>Share this code with a friend.</p>
        <div className="room-code">{room.code}</div>
        <div className="versus-seats">{[0, 1].map(i => <div key={i}>
          {room.seats?.[i] ? <><Portrait id={room.seats[i].fighter} /><strong>{ROSTER[room.seats[i].fighter].name}</strong><small>{room.seats[i].ready ? 'Ready' : room.index === i ? 'You' : 'Joined'}</small></> : <span>Waiting for challenger</span>}
        </div>)}</div>
        {room.stake && <NearStake stake={room.stake} action={command}/>}
        <button className="fighter-primary" disabled={busy || !room.seats || room.seats[room.index]?.ready || Boolean(room.stake && !room.stake.account)} onClick={() => command('ready')}>{room.seats?.[room.index]?.ready ? 'Waiting for opponent' : 'Ready to fight'}</button>
        <button disabled={busy} onClick={() => room.seats ? command('leave').then(left => { if (left) exit(); }) : exit()}>Leave lobby</button>
      </section>
    ) : (
      <section className="fighter-select">
        <GameMarquee game={cabinet}/>
        <div className="select-stage">
          <div className="fighter-focus"><Portrait id={selected} pose={showMove ? 4 : 0} label={showMove ? stats.name + ' performing ' + stats.move : stats.name} /><div><p>{stats.style}</p><h2>{stats.name}</h2><button type="button" aria-pressed={showMove} onClick={() => setShowMove(!showMove)}><kbd>C</kbd> {stats.move} · {showMove ? 'Show stance' : 'Preview pose'}</button></div></div>
          <div className="fighter-selection">
            <h2>Choose your fighter</h2>
            <div className="roster-grid">{ids.map(id => <button key={id} aria-pressed={id === selected} onClick={() => setSelected(id)}><Portrait id={id} /><strong>{ROSTER[id].name}</strong></button>)}</div>
            <div className="cabinet-actions">
              <label>CPU opponent<select value={opponent} onChange={event => setOpponent(event.target.value)}>{ids.map(id => <option key={id} value={id}>{ROSTER[id].name}</option>)}</select></label>
              <button className="fighter-primary" onClick={startPractice}>Fight CPU</button>
              <button disabled={busy} onClick={() => command('create', { fighter: selected, stake })}>Create online room</button>
              <form onSubmit={event => { event.preventDefault(); command('join', { fighter: selected, code }); }}>
                <input aria-label="Invite code" placeholder="Invite code" value={code} maxLength={6} onChange={event => setCode(event.target.value.toUpperCase())} />
                <button disabled={busy || code.trim().length !== 6}>Join</button>
              </form>
            </div>
            <StakeSelect config={near} stake={stake} onChange={setStake}/>
          </div>
        </div>
        <NearRecovery config={near}/>
      </section>
    )}
  </main>;
}
