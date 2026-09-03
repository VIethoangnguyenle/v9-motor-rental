const list=await (await fetch('http://localhost:9222/json/list')).json();
const ws=new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
let id=0;const p=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
await new Promise(r=>ws.onopen=r);
const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true})).result?.result?.value;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await send('Page.enable');await send('Runtime.enable');
for(const W of [390,1280]){
  await send('Emulation.setDeviceMetricsOverride',{width:W,height:780,deviceScaleFactor:1,mobile:W<800});
  await send('Page.navigate',{url:'http://localhost:3003/staff'});await wait(3200);
  console.log(`  ${W}px:`, await ev(`(()=>{
    const wrap=document.querySelector('.overflow-x-auto');
    const t=document.querySelector('table');
    if(!t) return 'không thấy bảng';
    const ths=[...t.querySelectorAll('thead th')].map(th=>th.textContent.trim()||'(nút)');
    const btns=[...t.querySelectorAll('tbody button')].map(b=>b.textContent.trim());
    const vis=[...t.querySelectorAll('tbody button')].filter(b=>{
      const r=b.getBoundingClientRect(); return r.left>=0 && r.right<=${W};}).length;
    return 'th trong DOM: ['+ths.join(', ')+'] · '
      +'wrap '+(wrap?wrap.clientWidth+'/'+wrap.scrollWidth+(wrap.scrollWidth>wrap.clientWidth?' ⚠️ CUỘN NGANG':''):'-')
      +' · nút trong tbody: '+btns.length+' ['+btns.join(',')+'] · nằm trong khung nhìn: '+vis;
  })()`));
}
ws.close();
