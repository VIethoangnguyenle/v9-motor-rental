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
  if(!s) return 'KHÔNG thấy nút "Tạo đơn"';
  const r=s.getBoundingClientRect();
  const x=r.left+r.width/2;
  // Quét theo KÍCH THƯỚC THẬT của nút (đọc bằng getBoundingClientRect ngay lúc
  // chạy), không chốt toạ độ tuyệt đối — bản trước hardcode y=705..749 (vị trí
  // nút TRƯỚC khi Task 3 chuyển nó vào footer của Modal); nút đổi chỗ thì ba
  // điểm đó chỉ còn đo một khoảng trống, không đo cái nút, và luôn báo miss dù
  // nút bấm tốt. Hai điểm sát MÉP (0.02/0.98) là nơi nhạy với vùng chết nhất —
  // thanh nav hay dialog che một phần đáy/đỉnh nút sẽ lộ ra ở đó trước tiên;
  // giữa nút gần như luôn trúng nên không nói lên điều gì.
  const fracs=[0.02,0.15,0.5,0.85,0.98];
  const out=['nút "Tạo đơn": top='+Math.round(r.top)+' bottom='+Math.round(r.bottom)+' height='+Math.round(r.height)];
  for(const f of fracs){
    const y=r.top+f*r.height;
    const el=document.elementFromPoint(x,y);
    const hitsBtn = el===s || s.contains(el);
    out.push('  y='+Math.round(y)+' (f='+f+') → '+(el?'<'+el.tagName.toLowerCase()+'>':'null')
      +(hitsBtn?'  ✅ trúng nút':'  ❌ KHÔNG trúng nút'));
  }
  const dlg=s.closest('dialog');
  out.push('  dialog: '+(dlg? 'có, open='+dlg.open+' modal='+(dlg.matches(':modal')) : 'không'));
  return out.join('\\n');
})()`));
ws.close();
