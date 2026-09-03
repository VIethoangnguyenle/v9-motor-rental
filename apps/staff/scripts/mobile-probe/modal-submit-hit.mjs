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
await send('Page.navigate',{url:'http://localhost:3003/'});await wait(3000);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Lên đơn'))?.click()`);
await wait(2500);
console.log(await ev(`(()=>{
  const s=[...document.querySelectorAll('button')].find(b=>/Tạo đơn/.test(b.textContent));
  const r=s.getBoundingClientRect(); const x=r.left+r.width/2; const out=[];
  for(const y of [r.top+4, r.top+12, 720, 727, 735, r.bottom-4]){
    const el=document.elementFromPoint(x,y);
    const hitsBtn = el===s || s.contains(el);
    out.push('  y='+Math.round(y)+' → '+(el?'<'+el.tagName.toLowerCase()+'>':'null')
      +(hitsBtn?'  ✅ trúng nút':'  ❌ KHÔNG trúng nút'));
  }
  const dlg=s.closest('dialog');
  out.push('  dialog: '+(dlg? 'có, open='+dlg.open+' modal='+(dlg.matches(':modal')) : 'không'));
  return out.join('\\n');
})()`));
ws.close();
