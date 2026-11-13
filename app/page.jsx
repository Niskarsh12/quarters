'use client';
import {useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {GameProvider,useGame} from '../components/game-context';
const Chessboard=dynamic(()=>import('react-chessboard').then(m=>m.Chessboard),{ssr:false,loading:()=> <div className="board-loading">Unfolding the battlefield…</div>});
const roles={w:['knight','archer','mage','barbarian','rogue'],b:['boss','orc','goblin','skeleton','dark-mage']};
const weapons={knight:'Sword & shield',archer:'Longbow',mage:'Crystal staff',barbarian:'Battle axe',rogue:'Dagger',boss:'Demon king',orc:'War cleaver',goblin:'Shiv',skeleton:'Bone blade','dark-mage':'Cursed staff'};
const label=s=>s==='w'?'Heroes':'Enemies';
const title=s=>s.replaceAll('-',' ');
function Sprite({role,className=''}){return <img className={'sprite '+className} src={'/assets/sprites/'+role+'/sheet.png'} alt={title(role)} draggable="false"/>;}
function Clock({ms}){return <span className="clock">{Math.floor(Math.max(0,ms)/60000)}:{String(Math.floor(Math.max(0,ms)/1000)%60).padStart(2,'0')}</span>;}
function World({game,selected,onPick}){
 const battling=game&&game.phase!=='lobby';
 return <div className={'world '+(battling?'raiding':'')}>
  {['w','b'].map(side=><section className={'realm '+(side==='w'?'grass':'dungeon')} key={side} aria-label={label(side)+' environment'}>
   <div className="realm-heading"><span>{side==='w'?'The expedition':'The dungeon'}</span><b>{side==='w'?'White pieces':'Black pieces'}</b></div>
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
function Entry(){
 const {action,busy}=useGame();const [side,setSide]=useState('w'),[role,setRole]=useState('knight'),[name,setName]=useState(''),[code,setCode]=useState('');
 return <>
  <div className="intro"><div><p className="eyebrow">A ten-player chess raid</p><h1>Five minds.<br/><em>One move.</em></h1></div><p>Storm the dungeon. Or defend its throne.<br/>Choose your class, rally your team, and turn<br className="desktop"/> sixty seconds of debate into one decisive move.</p></div>
  <World selected={role} onPick={(s,r)=>{setSide(s);setRole(r);}}/>
  <div className="entry-panel"><div className="your-class"><Sprite role={role}/><div><span>Your class</span><h2>{title(role)}</h2><p>{label(side)} · {weapons[role]}</p></div></div>
   <form onSubmit={e=>{e.preventDefault();action('create',{name,side,role});}} className="entry-form"><label>Player name<input value={name} onChange={e=>setName(e.target.value)} maxLength={24} required placeholder="What shall we call you?" autoComplete="nickname"/></label><button className="primary" disabled={busy||!name.trim()}>Create a raid <span>→</span></button></form>
   <form className="join-form" onSubmit={e=>{e.preventDefault();action('join',{name,side,role,code});}}><label>Have an invite?<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ROOM CODE" aria-label="Room code"/></label><button disabled={busy||!name.trim()||code.length!==6}>Join room</button></form>
  </div>
  <div className="rules"><p><b>01 / Pick your side</b>Five unique classes on each team. Every voice counts equally.</p><p><b>02 / Call your move</b>Discuss and vote. The most popular legal move plays every 60 seconds.</p><p><b>03 / Take the throne</b>Checkmate wins. All stakes and payouts are pretend coins.</p></div>
 </>;
}
function Lobby(){
 const {game,action,busy}=useGame();const me=game.players.find(p=>p.id===game.me);const [copied,setCopied]=useState(false);
 return <><div className="room-heading"><div><p className="eyebrow">Gather your party</p><h1>The gates await.</h1><p>{game.players.filter(p=>p.ready).length}/10 ready · All ten players must lock in.</p></div><button onClick={async()=>{try{await navigator.clipboard.writeText(game.code);setCopied(true);}catch{setCopied(false);}}}>Room <b>{game.code}</b> · {copied?'Copied':'Copy code'}</button></div>
 <World game={game}/>
 <div className="lobby-controls"><div><h2>{me.ready?'Your '+title(me.role)+' is ready.':'Ready to enter, '+me.name+'?'}</h2><p>Entry: 100 mock coins · Prize pool: {Object.values(game.ledger.deposits).reduce((a,b)=>a+b,0)} mock coins · $0 value</p></div><button className="primary" disabled={busy||me.ready} onClick={()=>action('ready')}>{me.ready?'Locked in':'Ready · lock mock stake'}</button></div>
 <div className="lobby-footer"><button disabled={busy} onClick={()=>action('leave')}>Leave lobby</button>{game.host===game.me&&<button disabled={busy||game.players.length===10} onClick={()=>action('fill')}>Fill empty seats with demo bots</button>}<p>Invite friends with the room code. Separate browsers share this lobby.</p></div>
 </>;
}
function Battle(){
 const {game,action,busy}=useGame();const me=game.players.find(p=>p.id===game.me),active=me.side===game.active;
 const [move,setMove]=useState(''),[chat,setChat]=useState(''),[now,setNow]=useState(Date.now()),[width,setWidth]=useState(480);
 const board=useRef(null),offset=useRef(0);
 useEffect(()=>{offset.current=game.serverNow-Date.now();},[game.serverNow]);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(id);},[]);
 useEffect(()=>{if(!board.current)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.floor(entry.contentRect.width)));observer.observe(board.current);return()=>observer.disconnect();},[]);
 const seconds=Math.min(60,Math.max(0,Math.ceil((game.deadline-now-offset.current)/1000)));
 const last=game.history.at(-1);
 return <><div className="battle-heading"><div><p className="eyebrow">Raid {game.code} · Turn {game.turn}</p><h1>{game.active==='w'?'The heroes deliberate.':'The dungeon answers.'}</h1></div><div className={'turn-clock '+(seconds<=10?'urgent':'')}><strong>{seconds}<small>s</small></strong><span>to lock the move</span></div></div>
 <div className="battle-grid"><aside className="roster"><h2>Your party</h2>{game.players.filter(p=>p.side===me.side).map(p=><div key={p.id} className="roster-row"><Sprite role={p.role}/><div><b>{p.name}</b><small>{title(p.role)}{p.id===me.id?' · You':''}</small></div></div>)}<div className="team-clocks"><p>Heroes’ time <Clock ms={game.banks.w}/></p><p>Enemies’ time <Clock ms={game.banks.b}/></p></div><p className="muted">Ten minutes per team. The 60-second voting window counts against it.</p><p className="pot">1,000 <span>mock coins in the vault</span></p></aside>
 <section className="board-section"><div className="board-caption"><span>{me.side==='w'?'Enemy lines':'Hero lines'}</span><b>{game.check?'King in check':'Team-voted chess'}</b></div><div ref={board} className="chess-frame"><Chessboard id="raid-board" position={game.fen} boardWidth={width} boardOrientation={me.side==='w'?'white':'black'} arePiecesDraggable={false} customDarkSquareStyle={{backgroundColor:'#68735b'}} customLightSquareStyle={{backgroundColor:'#e6dcc0'}} customBoardStyle={{borderRadius:0}} animationDuration={180} customSquareStyles={last?{[last.from]:{backgroundColor:'#bda65c'},[last.to]:{backgroundColor:'#d3bd78'}}:{}}/></div><div className="board-caption"><span>{label(me.side)} · You play {me.side==='w'?'white':'black'}</span><span>Moves resolve on the server</span></div>{last&&<p className="last-move"><b>{last.san}</b> {last.method} · {last.votes} votes</p>}</section>
 <aside className="strategy"><h2>{active?'Your move. Together.':'Watch the other side.'}</h2><p>{active?'Propose a legal move. You can change your vote until time runs out.':'Your team’s voting and chat open on your turn.'}</p><form onSubmit={async e=>{e.preventDefault();if(await action('vote',{move,turn:game.turn}))setMove('');}}><label>Vote your move <span>Standard algebraic notation</span><div className="inline-input"><input aria-label="Vote your move" value={move} onChange={e=>setMove(e.target.value)} placeholder="e4, Nf3, O-O…" maxLength={12} disabled={!active||busy}/><button className="primary" disabled={!active||busy||!move.trim()}>Vote</button></div></label></form>
 {game.myVote&&active&&<p className="vote-confirm" role="status">Your vote: <b>{game.myVote}</b></p>}
 <div className="vote-list">{Object.entries(game.votes).sort((a,b)=>b[1]-a[1]).map(([m,n])=><button key={m} disabled={!active||busy} onClick={()=>action('vote',{move:m,turn:game.turn})}><strong>{m}</strong><span className="vote-track"><i style={{width:n*20+'%'}}/></span><span>{n}/5</span></button>)}{!Object.keys(game.votes).length&&<p className="muted">{active?'No proposals yet. Start the conversation.':'Enemy votes stay private.'}</p>}</div>
 <div className="team-chat"><h3>Party chat <span>Only your team</span></h3><div className="chat-messages" aria-live="polite">{game.chat.length?game.chat.slice(-15).map(m=><p key={m.id}><b>{m.name}</b> {m.text}</p>):<p className="muted">A plan beats five guesses. Talk it through here.</p>}</div><form onSubmit={async e=>{e.preventDefault();if(await action('chat',{text:chat}))setChat('');}}><input aria-label="Team chat message" placeholder={active?'Tell your team the plan…':'Chat opens on your turn'} disabled={!active||busy} value={chat} onChange={e=>setChat(e.target.value)} maxLength={240}/><button disabled={!active||busy||!chat.trim()} aria-label="Send message">Send</button></form></div>
 {game.demo&&game.host===game.me&&<button className="advance" disabled={busy} onClick={()=>action('advance')}>Demo: resolve this turn now →</button>}
 </aside></div><details className="move-log"><summary>Raid chronicle · {game.history.length} moves</summary><div>{game.history.map(m=><span key={m.turn}>{m.turn}. {m.san}</span>)}</div></details></>;
}
function Victory(){const {game,reset}=useGame();const me=game.players.find(p=>p.id===game.me);return <section className="victory"><div className="victory-cast">{roles[game.winner||'w'].map(role=><Sprite key={role} role={role}/>)}</div><p className="eyebrow">{game.reason}</p><h1>{game.winner==='w'?'HEROES WIN':game.winner==='b'?'BOSS WINS':'HONORS EVEN'}</h1><p>{game.winner?'Five minds claimed the throne.':'A drawn battle. Every mock stake is returned.'}</p><div className="reward"><strong>{game.ledger.payouts[me.id]||0}</strong><span>mock coins returned to you · no real money</span></div><button className="primary" onClick={reset}>Gather another party →</button><details><summary>View mock settlement</summary>{game.players.map(p=><p key={p.id}>{p.name}: {game.ledger.payouts[p.id]||0} mock coins</p>)}</details></section>;}
function Screen(){const {game,error,connected,reset}=useGame();useEffect(()=>{window.scrollTo(0,0);},[game?.phase]);return <main><header><a href="/" className="wordmark"><svg width="32" height="38" viewBox="0 0 32 38" aria-hidden="true"><path fill="currentColor" d="M3 2h6v6h4V2h6v6h4V2h6v12l-5 4v12h5v6H3v-6h5V18l-5-4z"/></svg><div>Dungeon Stake<small>Kings & Knights</small></div></a><div className="header-note">Phase 1 <b>Mock stakes only</b></div></header>{error&&<div role="alert" className="error">{error}{!connected&&<button onClick={reset}>Return to entrance</button>}</div>}{!connected&&game&&<p role="status">Connection interrupted. Reconnecting…</p>}{!game?<Entry/>:game.phase==='lobby'?<Lobby/>:game.phase==='clash'?<><World game={game}/><div className="clash" role="status"><p>The gates are breached</p><h1>RAID RESOLUTION:<br/>CHESS BATTLE</h1><span>Five voices. One king. No turning back.</span></div></>:game.phase==='battle'?<Battle/>:<Victory/>}<footer><span>A game of coordination, courage, and very loud opinions.</span><span>No wallet required · No real assets</span></footer></main>;}
export default function Page(){return <GameProvider><Screen/></GameProvider>;}
