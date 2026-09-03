const list=await (await fetch('http://localhost:9222/json/list')).json();
const ws=new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
let id=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
await new Promise(r=>ws.onopen=r);
const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await send('Page.enable');await send('Runtime.enable');
const REPORT=`(()=>{
  const d=document.querySelector('dialog[open]'); if(!d) return 'KHÔNG mở được dialog';
  const sc=[...d.querySelectorAll('*')].find(e=>e.scrollHeight-e.clientHeight>8 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  const hit=()=>{let dead=[],tot=0;
    d.querySelectorAll('button,a[href]').forEach(b=>{const r=b.getBoundingClientRect(); if(r.height<8) return; tot++;
      const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      if(!(el===b||b.contains(el))) dead.push((b.textContent||'').trim().slice(0,14)||'✕');});
    return {tot,dead};};
  const a=hit(); if(sc) sc.scrollTop=sc.scrollHeight; const b=hit();
  return 'thừa '+(sc?(sc.scrollHeight-sc.clientHeight):0)+'px cuộn · chưa cuộn: '+a.dead.length+'/'+a.tot
    +(a.dead.length?' ['+a.dead.join(',')+']':'')+' · cuộn hết: '+b.dead.length+'/'+b.tot
    +(b.dead.length?' ['+b.dead.join(',')+']':' ✅');
})()`;
for (const W of [390,360]) {
  await send('Emulation.setDeviceMetricsOverride',{width:W,height:780,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:'http://localhost:3003/'});await wait(2900);
  await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Thêm')?.click()`);await wait(1600);
  console.log(`  ${W} sheet "Thêm":`, await ev(REPORT));
  await send('Page.navigate',{url:'http://localhost:3003/calendar'});await wait(3200);
  await ev(`document.querySelector('.overflow-x-auto button')?.click()`);await wait(2300);
  console.log(`  ${W} sheet chi tiết đơn:`, await ev(REPORT));
}
ws.close();
