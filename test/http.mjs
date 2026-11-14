import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:3000';
async function post(body,token,expected=200){const r=await fetch(base+'/api/room',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
let host=await post({action:'create',name:'Test Knight',side:'w',role:'knight'});
let enemy=await post({action:'join',name:'Test Boss',side:'b',role:'boss',code:host.code});
const ht=host.token,et=enemy.token,code=host.code;
await post({action:'join',name:'Duplicate',side:'w',role:'knight',code},undefined,400);
await post({action:'ready',code},'invalid',400);
await post({action:'fill',code},et,400);
host=await post({action:'fill',code},ht);assert.equal(host.players.length,10);
host=await post({action:'ready',code},ht);assert.equal(host.phase,'lobby');
enemy=await post({action:'ready',code},et);assert.equal(enemy.phase,'clash');
await new Promise(r=>setTimeout(r,3000));
host=await (await fetch(base+'/api/room?code='+code,{headers:{Authorization:'Bearer '+ht}})).json();assert.equal(host.phase,'battle');
assert.equal(host.pitch.actors.length, 10);
await post({action:'input',code,x:5,y:0,kick:false},ht,400);
await new Promise(resolve=>setTimeout(resolve,950));
const before = await post({action:'input',code,x:1,y:0,kick:false},ht);
await new Promise(resolve=>setTimeout(resolve,120));
const observed = await post({action:'input',code,x:0,y:0,kick:false},et);
assert.ok(observed.pitch.actors.find(actor=>actor.id===host.me).x > before.pitch.actors.find(actor=>actor.id===host.me).x);
assert.ok(!JSON.stringify(observed).includes(ht));
const practice=await post({action:'create',name:'Solo Skater',side:'w',role:'knight',mode:'hockey',cpu:true});
assert.equal(practice.mode,'hockey');
assert.equal(practice.phase,'clash');
assert.equal(practice.players.length,10);
assert.equal(practice.players.filter(player=>player.bot).length,9);
const hockey=await post({action:'create',name:'Host Skater',side:'w',role:'knight',mode:'hockey'});
await post({action:'join',name:'Wrong cabinet',side:'b',role:'boss',code:hockey.code,mode:'football'},undefined,400);
const guest=await post({action:'join',name:'Guest Skater',side:'b',role:'boss',code:hockey.code,mode:'hockey'});
assert.equal(guest.players.length,2);
const third=await post({action:'join',name:'Third Skater',side:'w',role:'knight',code:hockey.code,mode:'hockey',chooseOpen:true});
const fourth=await post({action:'join',name:'Fourth Skater',side:'w',role:'knight',code:hockey.code,mode:'hockey',chooseOpen:true});
const mixed=await post({action:'fill',code:hockey.code},hockey.token);
assert.deepEqual(['w','b'].map(side=>mixed.players.filter(player=>!player.bot&&player.side===side).length),[2,2]);
for(const token of [hockey.token,guest.token,third.token]) {
  assert.equal((await post({action:'ready',code:hockey.code},token)).phase,'lobby');
}
assert.equal((await post({action:'ready',code:hockey.code},fourth.token)).phase,'clash');
const config=await (await fetch(base+'/api/near')).json();
assert.equal(config.network,'testnet');
if(!config.enabled) {
  await post({action:'create',name:'Paid',side:'w',role:'knight',mode:'hockey',stake:'0.01'},undefined,400);
}
console.log('HTTP integration passed: friend rooms, invite validation, player movement, and solo Hockey with nine bots.');
