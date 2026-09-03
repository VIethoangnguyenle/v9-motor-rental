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
  // Đo CẢ HAI hình dạng — bảng lẫn thẻ — chứ không trả sớm khi không thấy
  // `<table>`. Trả sớm từng làm probe này thành no-op ở đúng bề rộng mà nó cần
  // gác: `<table>` biến mất ở 390px SAU khi bug #2 được sửa (hình dạng thẻ thay
  // thế), và bản trả-sớm chỉ nói "không thấy bảng" thay vì đo tiếp thẻ.
  // Scope vào `#main` (landmark nội dung của `AppShell`) để không đếm nhầm
  // `<ul>`/`<button>` của nav sang cùng khối.
  console.log(`  ${W}px:`, await ev(`(()=>{
    const main = document.querySelector('#main') ?? document;
    const wrap = main.querySelector('.overflow-x-auto');
    const fmtWrap = wrap
      ? wrap.clientWidth + '/' + wrap.scrollWidth + (wrap.scrollWidth > wrap.clientWidth ? ' ⚠️ CUỘN NGANG' : '')
      : '-';
    const visibleCount = (btns) => btns.filter(b => {
      const r = b.getBoundingClientRect();
      return r.left >= 0 && r.right <= ${W};
    }).length;

    const t = main.querySelector('table');
    if (t) {
      const ths = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim() || '(nút)');
      const btns = [...t.querySelectorAll('tbody button')];
      return 'HÌNH DẠNG bảng · th trong DOM: [' + ths.join(', ') + '] · '
        + 'wrap ' + fmtWrap
        + ' · nút trong tbody: ' + btns.length + ' [' + btns.map(b => b.textContent.trim()).join(',') + ']'
        + ' · nằm trong khung nhìn: ' + visibleCount(btns);
    }

    const cardList = main.querySelector('ul');
    if (!cardList) return 'HÌNH DẠNG không xác định — không thấy <table> lẫn <ul> trong #main';
    const btns = [...cardList.querySelectorAll('button')];
    const cardCount = cardList.querySelectorAll(':scope > li').length;
    return 'HÌNH DẠNG thẻ · số thẻ: ' + cardCount + ' · '
      + 'wrap ' + fmtWrap
      + ' · nút trong thẻ: ' + btns.length + ' [' + btns.map(b => b.textContent.trim()).join(',') + ']'
      + ' · nằm trong khung nhìn: ' + visibleCount(btns);
  })()`));
}
ws.close();
