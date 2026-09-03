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

// Quét theo LƯỚI 5×5 (cùng năm phân suất cho cả x lẫn y), không chỉ một
// đường thẳng đứng qua tâm nút — một đường tâm bỏ sót vùng chết theo CHIỀU
// NGANG (sibling tràn sang, hay padding của chân panel đẩy nút lệch trái/phải).
// Toạ độ luôn đọc từ `getBoundingClientRect()` NGAY LÚC CHẠY, không chốt số —
// bản trước hardcode y=705..749 (vị trí nút TRƯỚC khi Task 3 chuyển nó vào
// footer của Modal) nên báo miss cố định chẳng liên quan gì tới vị trí thật.
//
// MIN_EDGE_PX kẹp điểm quét cách mép ÍT NHẤT ngần đó — không có nó thì bốn GÓC
// của lưới rơi vào chính góc BO TRÒN của nút (`rounded-card` = 6px, mọi nút
// trong hệ này). Đo tay trên nút `✕`/`Lưu` hẹp của `rental-detail-sheet.tsx`
// xác nhận: cách mép 1px thỉnh thoảng vẫn trượt, cách 2px luôn trúng ở bo góc
// 6px — 3px là biên an toàn. Nút "Tạo đơn" đủ rộng nên không bị lộ (kẹp không
// đổi kết quả ở đây), nhưng giữ cùng một công thức với `sheet-actions.mjs` để
// hai probe không âm thầm lệch tiêu chí.
const SCAN = `(()=>{
  const s=[...document.querySelectorAll('button')].find(b=>/Tạo đơn/.test(b.textContent));
  if(!s) return {error:'KHÔNG thấy nút "Tạo đơn"'};
  const r=s.getBoundingClientRect();
  const fracs=[0.02,0.15,0.5,0.85,0.98];
  const MIN_EDGE_PX=3;
  const clamp=(v,lo,hi)=>Math.min(Math.max(v,lo),hi);
  const points=[];
  for(const fy of fracs){
    for(const fx of fracs){
      const x=r.left+clamp(fx*r.width, MIN_EDGE_PX, r.width-MIN_EDGE_PX);
      const y=r.top+clamp(fy*r.height, MIN_EDGE_PX, r.height-MIN_EDGE_PX);
      const el=document.elementFromPoint(x,y);
      const hit = el===s || s.contains(el);
      points.push({
        fx, fy, x:Math.round(x), y:Math.round(y),
        tag: el ? el.tagName.toLowerCase()+(el.id?'#'+el.id:'') : 'null',
        hit,
      });
    }
  }
  const dlg=s.closest('dialog');
  return {
    rect:{top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),height:Math.round(r.height)},
    points,
    dialog: dlg ? {open:dlg.open, modal:dlg.matches(':modal')} : null,
  };
})()`;

function render(result) {
  if (result.error) return result.error;
  const { rect } = result;
  const out = [
    'nút "Tạo đơn": top=' + rect.top + ' bottom=' + rect.bottom +
      ' left=' + rect.left + ' right=' + rect.right +
      ' (' + rect.width + 'x' + rect.height + ')',
  ];
  let dead = 0;
  for (const pt of result.points) {
    if (!pt.hit) dead++;
    const mark = pt.hit ? '✅ trúng nút' : '❌ KHÔNG trúng nút';
    out.push(
      '  (fx=' + pt.fx + ',fy=' + pt.fy + ') x=' + pt.x + ' y=' + pt.y +
        ' → <' + pt.tag + '>  ' + mark,
    );
  }
  out.push('  tổng: ' + dead + '/' + result.points.length + ' điểm trượt');
  if (result.dialog) out.push('  dialog: có, open=' + result.dialog.open + ' modal=' + result.dialog.modal);
  return out.join('\n');
}

const selfTest = process.argv.includes('--self-test');

if (!selfTest) {
  console.warn(render(await ev(SCAN)));
} else {
  // Bằng chứng phải CHẠY LẠI ĐƯỢC, không phải tường thuật một lần rồi xoá đi:
  // tự chèn một lớp che lên 30% đáy nút, khẳng định probe báo TRƯỢT ở đó, rồi
  // gỡ lớp che và khẳng định probe báo TRÚNG lại toàn bộ. Hai chiều — một
  // probe luôn báo trượt vô dụng y như một probe không bao giờ báo.
  console.warn('== --self-test bước 1/3: TRƯỚC khi che (kỳ vọng: 0 điểm trượt) ==');
  const before = await ev(SCAN);
  console.warn(render(before));
  const beforeMiss = before.points.filter((pt) => !pt.hit).length;

  await ev(`(()=>{
    const s=[...document.querySelectorAll('button')].find(b=>/Tạo đơn/.test(b.textContent));
    const r=s.getBoundingClientRect();
    const dlg=s.closest('dialog');
    const fake=document.createElement('div');
    fake.id='self-test-overlay';
    fake.style.position='fixed';
    fake.style.left=r.left+'px';
    fake.style.top=(r.top+r.height*0.7)+'px';
    fake.style.width=r.width+'px';
    fake.style.height=(r.height*0.3)+'px';
    fake.style.background='red';
    fake.style.zIndex='999999';
    // Gắn vào BÊN TRONG <dialog>, không phải document.body: dialog mở bằng
    // showModal() nằm ở TOP LAYER — mọi phần tử ở đó vẽ trên MỌI thứ khác bất
    // kể z-index. Một lớp che gắn ngoài top layer sẽ không bao giờ che được
    // dialog, và phép tự kiểm sẽ báo trúng giả — không chứng minh được gì.
    dlg.appendChild(fake);
  })()`);
  await wait(150);

  console.warn('== --self-test bước 2/3: SAU khi che 30% đáy nút (kỳ vọng: các điểm fy=0.85/0.98 trượt) ==');
  const during = await ev(SCAN);
  console.warn(render(during));
  const duringMiss = during.points.filter((pt) => !pt.hit).length;

  await ev(`document.getElementById('self-test-overlay')?.remove()`);
  await wait(150);

  console.warn('== --self-test bước 3/3: SAU khi gỡ lớp che (kỳ vọng: 0 điểm trượt trở lại) ==');
  const after = await ev(SCAN);
  console.warn(render(after));
  const afterMiss = after.points.filter((pt) => !pt.hit).length;

  const ok = beforeMiss === 0 && duringMiss > 0 && afterMiss === 0;
  console.warn(ok
    ? '\n--self-test: ✅ PASS (probe phát hiện đúng cả hai chiều: che thì trượt, gỡ thì trúng lại)'
    : '\n--self-test: ❌ FAIL (before=' + beforeMiss + ' during=' + duringMiss + ' after=' + afterMiss + ')');
  if (!ok) process.exitCode = 1;
}
ws.close();
