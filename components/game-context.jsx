'use client';
import {createContext,useContext,useEffect,useRef,useState} from 'react';
const Context=createContext(null);
export const useGame=()=>useContext(Context);
export function GameProvider({children}) {
 const [game,setGame]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(true);
 const seat=useRef(null), revision=useRef(0);
 useEffect(()=>{
  try {seat.current=JSON.parse(sessionStorage.getItem('dungeon-seat')||'null');}catch{}
  let stopped=false,running=false;
  async function poll(){
   if(!seat.current||running)return; running=true; const version=revision.current;
   try {
    const response=await fetch('/api/room?code='+seat.current.code,{headers:{Authorization:'Bearer '+seat.current.token},cache:'no-store'});
    const data=await response.json(); if(!response.ok)throw new Error(data.error);
    if(!stopped&&version===revision.current){setGame(data);setConnected(true);}
   }catch(e){if(!stopped){setConnected(false);setError(e.message);}}finally{running=false;}
  }
  poll();const id=setInterval(poll,700);return()=>{stopped=true;clearInterval(id);};
 },[]);
 async function action(action,payload={}){
  if(busy)return; setBusy(true);setError('');revision.current++;
  try {
   const response=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json',...(seat.current?{Authorization:'Bearer '+seat.current.token}:{})},body:JSON.stringify({code:seat.current?.code,...payload,action})});
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   if(data.left){seat.current=null;sessionStorage.removeItem('dungeon-seat');setGame(null);return true;}
   if(data.token){seat.current={code:data.code,token:data.token};sessionStorage.setItem('dungeon-seat',JSON.stringify(seat.current));delete data.token;}
   revision.current++;setGame(data);setConnected(true);return true;
  }catch(e){setError(e.message);return false;}finally{setBusy(false);}
 }
 function reset(){seat.current=null;revision.current++;sessionStorage.removeItem('dungeon-seat');setGame(null);setError('');setConnected(true);}
 return <Context.Provider value={{game,error,busy,connected,action,reset}}>{children}</Context.Provider>;
}
