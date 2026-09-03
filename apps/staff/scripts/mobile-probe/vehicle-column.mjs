const list=await (await fetch('http://localhost:9222/json/list')).json();
const ws=new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
let id=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
await new Promise(r=>ws.onopen=r);
const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:780,deviceScaleFactor:1,mobile:true});
await send('Page.navigate',{url:'http://localhost:3003/calendar'});await wait(3200);
console.warn(await ev(`(()=>{
  const wrap=document.querySelector('.overflow-x-auto');
  const cells=[...wrap.querySelectorAll('*')].filter(e=>/sticky/.test(e.className||'')&&/z-10/.test(e.className||''));
  const rows=cells.map(c=>({t:c.textContent.trim(), need:c.scrollWidth, has:c.clientWidth}));
  const max=Math.max(...rows.map(r=>r.need));
  const dayCol=wrap.querySelector('.grid')?.children?.[2]?.getBoundingClientRect().width;
  return [
   ...rows.map(r=>'  '+r.t.padEnd(20)+' cần '+r.need+'px'+(r.need>r.has?' ⚠️':' ✅')),
   '  ── rộng nhất cần: '+max+'px (đang cấp 88px)',
   '  ── cột ngày hiện rộng: '+Math.round(dayCol||0)+'px',
   '  ── nếu nới cột xe lên '+max+'px: tổng lưới '+wrap.scrollWidth+' → '+(wrap.scrollWidth+(max-88))+'px, khung nhìn '+wrap.clientWidth+'px'
  ].join('\\n');
})()`));
ws.close();
