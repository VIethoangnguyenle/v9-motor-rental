const list = await (await fetch('http://localhost:9222/json/list')).json();
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
let id=0; const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
await new Promise(r=>ws.onopen=r);
const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value;
await send('Page.enable');await send('Runtime.enable');
for (const w of [390, 1280]) {
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:780,deviceScaleFactor:1,mobile:w<800});
  await send('Page.navigate',{url:'http://localhost:3003/calendar'});
  await new Promise(r=>setTimeout(r,3000));
  console.warn(w+'px:', await ev(`(()=>{
    const grid=document.querySelector('.overflow-x-auto');
    const g=grid.getBoundingClientRect();
    const cols=grid.querySelectorAll('thead th, [role=columnheader]').length;
    return 'lưới bắt đầu ở y='+Math.round(g.top)+'px  ('+Math.round(g.top/780*100)+'% màn hình dùng cho phần đầu) · '
      + 'hiện '+grid.clientWidth+' / cần '+grid.scrollWidth+'px · cột tiêu đề: '+cols;
  })()`));
}
ws.close();
