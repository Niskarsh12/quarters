import { newRoom, getRoom } from '../../../lib/rooms.mjs';
import { join, authorize, ready, fillBots, vote, sendChat, snapshot, resolveTurn, tick } from '../../../lib/game.mjs';
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
      room=body.action==='create'?newRoom():getRoom(body.code);
      player=join(room,body); token=player.token;
    } else {
      room=getRoom(body.code); player=authorize(room,request.headers.get('authorization')?.replace('Bearer ','')); tick(room);
      switch(body.action) {
        case 'ready': ready(room,player); break;
        case 'fill': fillBots(room,player); break;
        case 'vote': vote(room,player,body.move,body.turn); break;
        case 'chat': sendChat(room,player,body.text); break;
        case 'advance':
          if(!room.demo||room.host!==player.id) throw new Error('Only the demo host can fast-forward.');
          resolveTurn(room); break;
        case 'leave':
          if(room.phase!=='lobby') throw new Error('A raid in progress cannot be abandoned here.');
          room.players=room.players.filter(p=>p.id!==player.id); delete room.ledger.deposits[player.id];
          if(room.host===player.id) room.host=room.players.find(p=>!p.bot)?.id||null;
          return respond({left:true});
        default: throw new Error('Unknown room action.');
      }
    }
    return respond({...snapshot(room,player),...(token?{token}:{})});
  } catch(e) { return respond({error:e.message},400); }
}
