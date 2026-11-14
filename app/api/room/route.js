import { newRoom, getRoom } from '../../../lib/rooms.mjs';
import { join, authorize, ready, fillBots, setInput, snapshot, tick, retryStake } from '../../../lib/game.mjs';
import { confirmDeposit, stakeFor, verifiedNearConfig } from '../../../lib/near-escrow.mjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const respond=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request) {
  try { const room=getRoom(new URL(request.url).searchParams.get('code')); return respond(snapshot(room,authorize(room,request.headers.get('authorization')?.replace('Bearer ','')))); }
  catch(e) { return respond({error:e.message},400); }
}
export async function POST(request) {
  try {
    const origin=request.headers.get('origin');
    // Next's internal request URL may use 0.0.0.0 even when the browser uses localhost.
    if(origin && new URL(origin).host!==request.headers.get('host')) return respond({error:'Cross-origin actions are not accepted.'},403);
    const raw=await request.text(); if(raw.length>4096) return respond({error:'Request too large.'},413);
    const body=JSON.parse(raw); let room,player,token;
    if(body.action==='create'||body.action==='join') {
      const stake=body.action==='create' ? stakeFor(body.cpu===true ? '0' : body.stake) : null;
      if(stake && !(await verifiedNearConfig()).enabled) throw new Error('The Testnet escrow is unavailable.');
      room=body.action==='create'?newRoom(body.mode):getRoom(body.code);
      if(body.action==='create') room.stake=stake;
      if(body.action==='join'&&room.stake&&Date.now()>=room.stake.expiresAt) throw new Error('This paid lobby expired.');
      if (body.action==='join' && body.mode && room.mode!==body.mode) {
        return respond({error:'This invite is for the other sports cabinet.'},400);
      }
      player=join(room,body); token=player.token;
      if (body.action==='create' && body.cpu===true) {
        fillBots(room,player);
        ready(room,player);
      }
    } else {
      room=getRoom(body.code); player=authorize(room,request.headers.get('authorization')?.replace('Bearer ','')); tick(room);
      switch(body.action) {
        case 'ready': ready(room,player); break;
        case 'fill': fillBots(room,player); break;
        case 'deposit':
          if(room.phase!=='lobby') throw new Error('This match has already started.');
          await confirmDeposit(room,player,body.account);
          break;
        case 'settle': retryStake(room); break;
        case 'input': setInput(room, player, body); break;
        case 'leave':
          if(room.phase!=='lobby') throw new Error('A raid in progress cannot be abandoned here.');
          for(const departing of room.players.filter(p=>p.id===player.id||p.bot)) delete room.ledger.deposits[departing.id];
          room.players=room.players.filter(p=>p.id!==player.id&&!p.bot);
          room.demo=false;
          if(room.host===player.id) room.host=room.players.find(p=>!p.bot)?.id||null;
          return respond({left:true});
        default: throw new Error('Unknown room action.');
      }
    }
    return respond({...snapshot(room,player),...(token?{token}:{})});
  } catch(e) { return respond({error:e.message},400); }
}
