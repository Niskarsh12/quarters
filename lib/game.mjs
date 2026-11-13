import { Chess } from 'chess.js';
import { randomUUID, randomInt } from 'node:crypto';
import { depositStake, slashLosers } from './staking.mjs';
export const CLASSES = { w: ['knight','archer','mage','barbarian','rogue'], b: ['boss','orc','goblin','skeleton','dark-mage'] };
export const TURN_MS = 60_000;
export const TEAM_MS = 600_000;
const fail = message => { throw new Error(message); };
export function createRoom(code, now=Date.now()) {
  return { code, players:[], host:null, phase:'lobby', chess:new Chess(), votes:{}, chat:[], history:[], turn:0, deadline:null, startedAt:null, banks:{w:TEAM_MS,b:TEAM_MS}, ledger:{deposits:{},payouts:{},settled:false,mock:true}, createdAt:now, touchedAt:now, demo:false, winner:null, reason:null };
}
export function join(room, { name, side, role }, now=Date.now()) {
  if(room.phase!=='lobby') fail('This raid has already started. Create a new room.');
  if(!CLASSES[side]?.includes(role)) fail('Choose a valid class.');
  if(room.players.some(p=>p.role===role)) fail('That class has already been chosen.');
  name=String(name||'').trim().slice(0,24);
  if(!name) fail('Enter a player name.');
  const player={id:randomUUID(),token:randomUUID(),name,side,role,ready:false,bot:false};
  room.players.push(player); room.host ||= player.id; room.touchedAt=now;
  return player;
}
export function authorize(room, token) {
  return room.players.find(p=>p.token===token && !p.bot) || fail('Your seat could not be found. Rejoin the room.');
}
export function ready(room, player, now=Date.now()) {
  if(room.phase!=='lobby') fail('The raid has already started.');
  player.ready=true; depositStake(room,player);
  if(room.players.length===10 && room.players.every(p=>p.ready)) { room.phase='clash'; room.deadline=now+2500; }
}
export function fillBots(room, player, now=Date.now()) {
  if(room.phase!=='lobby'||player.id!==room.host) fail('Only the host can fill an open lobby.');
  room.demo=true;
  for(const side of ['w','b']) for(const role of CLASSES[side]) {
    if(room.players.some(p=>p.role===role)) continue;
    const bot=join(room,{name:role.replaceAll('-',' ')+' · bot',side,role},now);
    bot.bot=true; bot.ready=true; depositStake(room,bot);
  }
  // Human players must still explicitly ready themselves.
  if(room.players.every(p=>p.ready)) ready(room,player,now);
}
function startTurn(room, now) {
  room.phase='battle'; room.startedAt=now; room.votes={}; room.turn++;
  room.deadline=now+Math.min(TURN_MS,room.banks[room.chess.turn()]);
  if(room.demo) {
    const legal=room.chess.moves();
    const suggested=legal.filter(m=>/^[NBe]|[+#]/.test(m));
    const move=(suggested.length?suggested:legal)[randomInt((suggested.length?suggested:legal).length)];
    for(const p of room.players.filter(p=>p.bot && p.side===room.chess.turn())) room.votes[p.id]=move;
  }
}
export function vote(room, player, move, turn, now=Date.now()) {
  tick(room,now);
  if(room.phase!=='battle'||player.side!==room.chess.turn()) fail('Wait for your team’s turn.');
  if(turn!==room.turn) fail('That turn has ended. Vote on the current position.');
  if(typeof move!=='string'||move.length>12) fail('Enter a legal move, such as e4 or Nf3.');
  const check=new Chess(room.chess.fen()); let candidate;
  try { candidate=check.move(move.trim(),{strict:true}); } catch { fail('That move is not legal. Use SAN, such as e4 or Nf3.'); }
  room.votes[player.id]=candidate.san;
}
export function sendChat(room, player, text, now=Date.now()) {
  if(room.phase!=='battle'||player.side!==room.chess.turn()) fail('Team chat opens on your turn.');
  text=String(text||'').trim().slice(0,240); if(!text) fail('Write a message first.');
  if(player.lastChat && now-player.lastChat<800) fail('Please wait a moment before sending again.');
  player.lastChat=now; room.chat.push({id:randomUUID(),name:player.name,side:player.side,text,at:now}); room.chat=room.chat.slice(-100);
}
export function finish(room,winner,reason) {
  if(room.phase==='finished') return;
  room.phase='finished'; room.winner=winner; room.reason=reason; room.deadline=null;
  slashLosers(room,winner);
}
export function resolveTurn(room, now=Date.now(), choose=randomInt) {
  if(room.phase!=='battle') return;
  const side=room.chess.turn();
  room.banks[side]=Math.max(0,room.banks[side]-Math.max(0,now-room.startedAt));
  if(room.banks[side]===0) { finish(room,side==='w'?'b':'w','Team clock expired'); return; }
  const legal=room.chess.moves(); const counts={};
  for(const [id,move] of Object.entries(room.votes)) if(legal.includes(move)&&room.players.some(p=>p.id===id&&p.side===side)) counts[move]=(counts[move]||0)+1;
  const highest=Math.max(0,...Object.values(counts));
  const candidates=highest ? Object.keys(counts).filter(m=>counts[m]===highest).sort() : legal;
  if(!candidates.length) { finish(room,null,'Draw'); return; }
  const selected=candidates[choose(candidates.length)];
  const played=room.chess.move(selected);
  room.history.push({turn:room.turn,side,san:played.san,votes:highest,method:highest?'Team vote':'Random legal fallback',from:played.from,to:played.to});
  if(room.chess.isCheckmate()) finish(room,side,'Checkmate');
  else if(room.chess.isGameOver()) finish(room,null,'Draw — chess rules');
  else startTurn(room,now);
}
export function tick(room, now=Date.now()) {
  if(room.phase==='lobby' && room.players.length===10 && room.players.every(p=>p.ready)) { room.phase='clash'; room.deadline=now+2500; }
  if(room.phase==='clash'&&now>=room.deadline) startTurn(room,room.deadline);
  // Deadlines stay authoritative even if the event loop or polling was delayed.
  while(room.phase==='battle'&&now>=room.deadline) resolveTurn(room,room.deadline);
}
export function snapshot(room, player, now=Date.now()) {
  tick(room,now);
  const active=room.chess.turn(), counts={};
  if(player.side===active) for(const move of Object.values(room.votes)) counts[move]=(counts[move]||0)+1;
  const banks={...room.banks}; if(room.phase==='battle') banks[active]=Math.max(0,banks[active]-(now-room.startedAt));
  return {code:room.code,host:room.host,me:player.id,phase:room.phase,demo:room.demo,players:room.players.map(({token,lastChat,...p})=>p),fen:room.chess.fen(),active,check:room.chess.isCheck(),turn:room.turn,deadline:room.deadline,serverNow:now,banks,votes:counts,myVote:room.votes[player.id]||null,chat:room.chat.filter(m=>m.side===player.side),history:room.history,winner:room.winner,reason:room.reason,ledger:room.ledger};
}
