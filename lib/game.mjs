import { direction, kickoff, stepFootball, STEP_MS } from './football.mjs';
import { randomUUID } from 'node:crypto';
import { depositStake, slashLosers } from './staking.mjs';
import { MODES, isMode } from './modes.mjs';
import { initStakeSeat, publicStake, requireStakeReady, settleStake } from './near-escrow.mjs';
export const CLASSES = { w: ['knight','archer','mage','barbarian','rogue'], b: ['boss','orc','goblin','skeleton','dark-mage'] };
export const MATCH_MS = 180_000;
export const EXTRA_MS = 30_000;
const fail = message => { throw new Error(message); };
export function createRoom(code, now=Date.now(), mode='football') {
  if (!isMode(mode)) fail('Choose a supported game.');
  return { code, mode, players:[], host:null, phase:'lobby', match:null, deadline:null,  ledger:{deposits:{},payouts:{},settled:false,mock:true}, createdAt:now, touchedAt:now, demo:false, winner:null, reason:null };
}
export function join(room, { name, side, role, chooseOpen = false }, now=Date.now()) {
  if(room.phase!=='lobby') fail('This raid has already started. Create a new room.');
  if(!CLASSES[side]?.includes(role)) fail('Choose a valid class.');
  if(room.players.some(p=>p.role===role)) {
    if(!chooseOpen) fail('That class has already been chosen.');
    role=CLASSES[side].find(candidate=>!room.players.some(p=>p.role===candidate));
    if(!role) {
      side=side==='w'?'b':'w';
      role=CLASSES[side].find(candidate=>!room.players.some(p=>p.role===candidate));
    }
    if(!role) fail('All ten seats are filled.');
  }
  name=String(name||'').trim().slice(0,24);
  if(!name) fail('Enter a player name.');
  const player={id:randomUUID(),token:randomUUID(),name,side,role,ready:false,bot:false};
  initStakeSeat(room,player);
  room.players.push(player); room.host ||= player.id; room.touchedAt=now;
  return player;
}
export function authorize(room, token) {
  return room.players.find(p=>p.token===token && !p.bot) || fail('Your seat could not be found. Rejoin the room.');
}
export function ready(room, player, now=Date.now()) {
  if(room.phase!=='lobby') fail('The raid has already started.');
  requireStakeReady(room,player);
  player.ready=true;
  if(!room.stake) depositStake(room,player);
  maybeStart(room,now);
}
function maybeStart(room, now) {
  if(room.stake && now>=room.stake.expiresAt) return;
  if(room.players.length===10 && room.players.every(p=>p.ready)) { room.phase='clash'; room.deadline=now+2500; }
}
export function fillBots(room, player, now=Date.now()) {
  if(room.phase!=='lobby'||player.id!==room.host) fail('Only the host can fill an open lobby.');
  if(room.stake && room.players.length<2) fail('Invite at least one friend for a Testnet match. Solo practice is free.');
  const humans = room.players.filter(p=>!p.bot);
  for(const side of ['w','b']) {
    const other=side==='w'?'b':'w';
    const team=humans.filter(p=>p.side===side);
    const move=team.length-Math.ceil(humans.length/2);
    if(move<=0) continue;
    const open=CLASSES[other].filter(role=>!room.players.some(p=>p.role===role));
    team.slice(-move).forEach((p,index)=>{p.side=other;p.role=open[index];});
  }
  room.demo=true;
  for(const side of ['w','b']) for(const role of CLASSES[side]) {
    if(room.players.some(p=>p.role===role)) continue;
    const bot=join(room,{name:role.replaceAll('-',' ')+' · bot',side,role},now);
    bot.bot=true; bot.ready=true;
    if(!room.stake) depositStake(room,bot);
  }
  // Human players must still explicitly ready themselves.
  maybeStart(room,now);
}
export function setInput(room, player, controls, now = Date.now()) {
  if (room.phase !== 'battle') return;
  const { x, y, kick } = controls;
  if (!(Number.isFinite(x) && Number.isFinite(y)) || Math.abs(x) > 1 || Math.abs(y) > 1 || typeof kick !== 'boolean') {
    fail('Invalid movement input.');
  }
  const [dx, dy] = direction(x, y);
  const previous = room.match.inputs.get(player.id);
  room.match.inputs.set(player.id, {
    x: dx, y: dy, kick: kick || Boolean(previous?.kick && previous.until >= now), until: now + 250,
  });
}

function finish(room, winner, reason) {
  room.phase = 'finished';
  room.winner = winner;
  room.reason = reason;
  room.deadline = null;
  if(room.stake) settleStake(room, winner ? room.players.filter(player=>player.side===winner) : []);
  else slashLosers(room, winner);
}

export function retryStake(room) {
  if(room.phase!=='finished'||!room.stake) fail('Settlement starts after the match.');
  settleStake(room, room.winner ? room.players.filter(player=>player.side===room.winner) : []);
}

export function tick(room, now = Date.now()) {
  if (room.phase === 'clash' && now >= room.deadline) {
    const start = room.deadline;
    room.phase = 'battle';
    room.deadline = start + MATCH_MS;
    room.match = { mode: room.mode || 'football', score: { w: 0, b: 0 }, overtime: false, lastStep: start, reset: 0, inputs: new Map() };
    kickoff(room.match, room.players, start);
  }
  if (room.phase !== 'battle') return;
  const match = room.match;
  const until = Math.min(now, room.deadline);
  // Never replay a long backlog or extend the match clock after a server stall.
  match.lastStep = Math.max(match.lastStep, until - 125);
  while (match.lastStep + STEP_MS <= until) {
    match.lastStep += STEP_MS;
    const scorer = stepFootball(match, match.inputs, match.lastStep);
    if (!scorer) continue;
    match.score[scorer]++;
    if (match.overtime) {
      finish(room, scorer, MODES[match.mode || 'football'].tieBreak);
      return;
    }
    const rules = MODES[match.mode || 'football'];
    if (match.score[scorer] >= rules.target) {
      finish(room, scorer, `First to ${rules.target} ${rules.unit}`);
      return;
    }
    match.inputs.clear();
    kickoff(match, room.players, match.lastStep);
  }
  if (now < room.deadline) return;
  if (match.score.w !== match.score.b) {
    finish(room, match.score.w > match.score.b ? 'w' : 'b', 'Full time');
  } else if (match.overtime || now >= room.deadline + EXTRA_MS) {
    finish(room, null, 'Full time · draw');
  } else {
    match.overtime = true;
    match.lastStep = room.deadline;
    room.deadline += EXTRA_MS;
    match.inputs.clear();
    kickoff(match, room.players, match.lastStep);
  }
}

export function snapshot(room, player, now = Date.now()) {
  tick(room, now);
  const { code, host, phase, demo, players, match, deadline, winner, reason, ledger } = room;
  const pitch = match && {
    score: match.score,
    overtime: match.overtime,
    reset: match.reset,
    kickoffUntil: match.kickoffUntil,
    ball: match.ball,
    actors: match.actors.map(({ id, side, role, x, y, dx, dy, fx, kickAt }) => ({ id, side, role, x, y, dx, dy, fx, kickAt })),
  };
  return { code, host, mode: room.mode || 'football', me: player.id, phase, demo, deadline, winner, reason, ledger, pitch, serverNow: now,
    stake: publicStake(room,player), players: players.map(({ token, stakeSeat, nearAccount, ...seat }) => ({...seat, funded: Boolean(nearAccount)})) };
}
