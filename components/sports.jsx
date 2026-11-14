'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import FootballPitch from './football-pitch';
import {GameProvider,useGame} from './game-context';
import GameMarquee from './game-marquee';
import { NearRecovery, NearStake, StakeSelect, useNearConfig } from './near-stake';
import { GAMES } from '../lib/arcade.mjs';
import { MODES } from '../lib/modes.mjs';
const roles={w:['knight','archer','mage','barbarian','rogue'],b:['boss','orc','goblin','skeleton','dark-mage']};
const weapons={knight:'Sword & shield',archer:'Longbow',mage:'Crystal staff',barbarian:'Battle axe',rogue:'Dagger',boss:'Demon king',orc:'War cleaver',goblin:'Shiv',skeleton:'Bone blade','dark-mage':'Cursed staff'};
const label=s=>s==='w'?'Heroes':'Monsters';
const title=s=>s.replaceAll('-',' ');
function Sprite({role,className=''}){return <img className={'sprite '+className} src={'/assets/sprites/'+role+'/sheet.png'} alt={title(role)} draggable="false"/>;}
function World({game,selected,onPick}){
 const battling=game&&game.phase!=='lobby';
 return <div className={'world '+(battling?'raiding':'')}>
  {['w','b'].map(side=><section className={'realm '+(side==='w'?'grass':'dungeon')} key={side} aria-label={label(side)+' environment'}>
   <div className="realm-heading"><span>{side==='w'?'The expedition':'The dungeon'}</span><b>{side==='w'?'Heroes':'Monsters'}</b></div>
   <div className="scenery" aria-hidden="true">{side==='w'?<><i className="tree tree-one"/><i className="tree tree-two"/><i className="mountain"/></>:<><i className="arch"/><i className="torch left"/><i className="torch right"/></>}</div>
   <div className="characters">{roles[side].map(role=>{
    const p=game?.players.find(p=>p.role===role);const mine=Boolean(p && p.id===game?.me);
    return <button key={role} className={'character '+(selected===role||mine?'selected':'')+(p?' occupied':'')} disabled={!!game} onClick={()=>onPick?.(side,role)} aria-pressed={selected===role||mine} title={weapons[role]}>
     <Sprite role={role}/><strong>{title(role)}</strong><small>{p?(p.ready?'Ready · ':'')+p.name:game?'Open seat':weapons[role]}</small>{mine&&<span className="you">You</span>}
    </button>;
   })}</div>
  </section>)}
  <div className="world-divider" aria-hidden="true">VS</div>
 </div>;
}
function Entry({mode}){
 const {action,busy}=useGame();const [side,setSide]=useState('w'),[role,setRole]=useState('knight'),[name,setName]=useState(''),[code,setCode]=useState('');
 const [stake,setStake]=useState('0');
 const config=useNearConfig();
 const cabinet=GAMES.find(game=>game.id===mode);
 return <>
  <GameMarquee game={cabinet}/>
  <h2 className="sports-picker-title">Choose your player</h2>
  <World selected={role} onPick={(s,r)=>{setSide(s);setRole(r);}}/>
  <div className="sports-entry">
   <label>Player name<input value={name} onChange={e=>setName(e.target.value)} maxLength={24} placeholder="What shall we call you?" autoComplete="nickname"/></label>
   <div><h2>Start a match</h2><p>Play solo with nine bots, or invite friends and fill any open seats in the lobby.</p>
    <div className="sports-actions">
     <button className="primary" disabled={busy||!name.trim()} onClick={()=>action('create',{name,side,role,mode,cpu:true})}>Play with bots</button>
     <button disabled={busy||!name.trim()} onClick={()=>action('create',{name,side,role,mode,stake})}>Create friend room</button>
    </div>
    <StakeSelect config={config} stake={stake} onChange={setStake}/>
   </div>
   <form className="join-form" onSubmit={e=>{e.preventDefault();action('join',{name,side,role,mode,code,chooseOpen:true});}}><label>Room code<input value={code} onChange={e=>setCode(e.target.value.toUpperCase().trim())} maxLength={6} placeholder="ROOM CODE"/></label><button disabled={busy||!name.trim()||code.length!==6}>Join room</button></form>
  </div>
  <NearRecovery config={config}/>
  <div className="rules"><p><b>Score target or full time</b>The match ends at the score target or after three minutes. A tie goes to 30 seconds of sudden death.</p><p><b>Testnet prizes</b>Human winners split the NEAR pot. Draws return every stake.</p></div>
 </>;
}
function Lobby(){
 const {game,action,busy}=useGame();const me=game.players.find(p=>p.id===game.me);const [copied,setCopied]=useState(false);
 const humans=game.players.filter(p=>!p.bot);
 const bots=game.players.length-humans.length;
 return <><div className="room-heading"><div><p className="eyebrow">Match lobby</p><h1>{MODES[game.mode].name}</h1><p>{humans.length} human · {bots} bots · {10-game.players.length} open</p><p>Heroes: {humans.filter(p=>p.side==='w').length} human · Monsters: {humans.filter(p=>p.side==='b').length} human</p></div><button onClick={async()=>{try{await navigator.clipboard.writeText(game.code);setCopied(true);}catch{setCopied(false);}}}>Room <b>{game.code}</b> · {copied?'Copied':'Copy code'}</button></div>
 <World game={game}/>
 {game.stake&&<NearStake stake={game.stake} action={action}/>}
 <div className="lobby-controls"><div><h2>{me.ready?'Your '+title(me.role)+' is ready.':'Ready to enter, '+me.name+'?'}</h2><p>{game.stake?'All humans must confirm their stakes and ready up.':'Free room · 0 NEAR · No wallet required.'}</p></div><button className="primary" disabled={busy||me.ready||Boolean(game.stake&&!game.stake.account)} onClick={()=>action('ready')}>{me.ready?'Ready':'Ready up'}</button></div>
 <div className="lobby-footer"><button disabled={busy} onClick={()=>action('leave')}>Leave lobby</button>{game.host===game.me&&<button disabled={busy||game.players.length===10||Boolean(game.stake&&humans.length<2)} onClick={()=>action('fill')}>Balance teams and fill with bots</button>}<p>{game.stake&&humans.length<2?'Invite at least one friend for a staked match.':'Invite friends before adding bots. The host can then balance the human players across both teams.'}</p></div>
 </>;
}
function Victory(){const {game,reset,action}=useGame();return <section className="victory"><div className="victory-cast">{roles[game.winner||'w'].map(role=><Sprite key={role} role={role}/>)}</div><p className="eyebrow">{game.reason} · {game.pitch.score.w}–{game.pitch.score.b}</p><h1>{game.winner==='w'?'HEROES WIN':game.winner==='b'?'MONSTERS WIN':'DRAW'}</h1>{game.stake?<NearStake stake={game.stake} action={action} finished/>:<p>Free match · 0 NEAR</p>}<button className="primary" onClick={reset}>Back to lobby →</button></section>;}
function Screen({mode}){const {game,error,connected,reset}=useGame();useEffect(()=>{window.scrollTo(0,0);},[game?.phase]);return <main className="sports-page"><nav className="cabinet-nav"><Link href="/">← Dungeon Stake</Link><span>{game?.stake?'NEAR Testnet':'Free play · NEAR Testnet'}</span></nav>{error&&<div role="alert" className="error">{error}{!connected&&<button onClick={reset}>Return to entrance</button>}</div>}{!connected&&game&&<p role="status">Connection interrupted. Reconnecting…</p>}{!game?<Entry mode={mode}/>:game.phase==='lobby'?<Lobby/>:game.phase==='clash'?<><World game={game}/><div className="clash" role="status"><h1>{MODES[game.mode].start}</h1></div></>:game.phase==='battle'?<FootballPitch/>:<Victory/>}</main>;}
export default function Sports({mode}){return <GameProvider key={mode} mode={mode}><Screen mode={mode}/></GameProvider>;}
