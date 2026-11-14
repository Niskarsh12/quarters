import { randomBytes } from 'node:crypto';
import { createRoom, tick } from './game.mjs';
const store=globalThis.__dungeonFootballRooms ||= { rooms:new Map() };
if(!store.timer) {
  store.timer=setInterval(()=>{
    const now=Date.now();
    for(const [code,room] of store.rooms) {
      if(now-room.touchedAt>7200000) store.rooms.delete(code);
      else tick(room,now);
    }
  },1000 / 60);
  store.timer.unref?.();
}
export function newRoom(mode) {
  if(store.rooms.size>=100) throw new Error('The demo server is full. Try again later.');
  let code; do { code=randomBytes(3).toString('hex').toUpperCase(); } while(store.rooms.has(code));
  const room=createRoom(code, Date.now(), mode); store.rooms.set(code,room); return room;
}
export function getRoom(code) {
  const room=store.rooms.get(String(code).toUpperCase());
  if(!room) throw new Error('Room not found. Check the invite code or create a new raid.');
  room.touchedAt=Date.now(); return room;
}
