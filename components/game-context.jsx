'use client';
import {createContext,useContext,useEffect,useRef,useState} from 'react';
const Context=createContext(null);
export const useGame=()=>useContext(Context);
export function GameProvider({children,mode}) {
 const storageKey='dungeon-seat-'+mode;
 const [game,setGame]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(true);
 const seat=useRef(null), revision=useRef(0);
 const phase=useRef(null);
 const controls=useRef({x:0,y:0,kick:false});
 useEffect(()=>{
  try {seat.current=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
  let stopped=false,running=false,timer,connectionError=false;
  async function poll(){
   if(!seat.current||running)return; running=true; const version=revision.current;
   try {
    const current=seat.current;
    const headers={Authorization:'Bearer '+current.token};
    const playing=phase.current==='battle';
    const input=playing ? {...controls.current} : null;
    if (playing) controls.current.kick=false;
    const signal=AbortSignal.timeout(4000);
    const response=playing
      ? await fetch('/api/room',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'input',code:current.code,...input}),signal})
      : await fetch('/api/room?code='+current.code,{headers,cache:'no-store',signal});
    const data=await response.json(); if(!response.ok)throw new Error(data.error);
    if(!stopped&&version===revision.current){
     phase.current=data.phase;setGame(data);setConnected(true);
     if(connectionError){connectionError=false;setError('');}
    }
   }catch(e){if(!stopped&&version===revision.current){connectionError=true;setConnected(false);setError(e.message);}}finally{running=false;}
  }
  async function schedule(){
   await poll();
   if(!stopped)timer=setTimeout(schedule,connectionError?650:phase.current==='battle'?45:phase.current==='clash'?130:650);
  }
  schedule();return()=>{stopped=true;clearTimeout(timer);};
 },[storageKey]);
 async function action(action,payload={}){
  if(busy)return; setBusy(true);setError('');revision.current++;
  try {
   const response=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json',...(seat.current?{Authorization:'Bearer '+seat.current.token}:{})},body:JSON.stringify({code:seat.current?.code,...payload,action})});
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   if(data.left){revision.current++;seat.current=null;phase.current=null;sessionStorage.removeItem(storageKey);setGame(null);return true;}
   if(data.token){seat.current={code:data.code,token:data.token};sessionStorage.setItem(storageKey,JSON.stringify(seat.current));delete data.token;}
   revision.current++;phase.current=data.phase;setGame(data);setConnected(true);return true;
  }catch(e){setError(e.message);return false;}finally{setBusy(false);}
 }
 function reset(){seat.current=null;phase.current=null;revision.current++;sessionStorage.removeItem(storageKey);setGame(null);setError('');setConnected(true);}
 return <Context.Provider value={{game,error,busy,connected,action,reset,controls}}>{children}</Context.Provider>;
}
