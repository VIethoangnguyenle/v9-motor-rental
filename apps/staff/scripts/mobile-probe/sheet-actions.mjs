const list = await (await fetch("http://localhost:9222/json/list")).json();
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
let id = 0;
const p = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && p.has(m.id)) {
    p.get(m.id)(m);
    p.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (m, q = {}) =>
  new Promise((r) => {
    const i = ++id;
    p.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: q }));
  });
const ev = async (x) =>
  (await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true }))
    .result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable");
await send("Runtime.enable");
const REPORT = `(()=>{
  const d=document.querySelector('dialog[open]'); if(!d) return 'KHÔNG mở được dialog';
  const sc=[...d.querySelectorAll('*')].find(e=>e.scrollHeight-e.clientHeight>8 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  // Lưới 5×5 (cùng năm phân suất cho cả x lẫn y), không chỉ một điểm ở TÂM
  // rect — một điểm tâm bỏ sót vùng chết theo CHIỀU NGANG (sibling tràn sang,
  // hay padding của chân panel đẩy nút lệch trái/phải). Một nút bị coi là
  // chết nếu BẤT KỲ điểm nào trong lưới trượt, kèm số điểm trượt để không chỉ
  // báo một tổng che khuất chi tiết.
  //
  // MIN_EDGE_PX kẹp điểm quét cách mép ÍT NHẤT ngần đó — không có nó thì bốn
  // GÓC của lưới (fx,fy cùng ở 0.02/0.98) rơi vào chính góc BO TRÒN của nút
  // (mọi nút trong hệ này dùng rounded-card = 6px, xem index.css), và
  // elementFromPoint ĐÚNG khi trả về phần tử cha ở đó — góc hình chữ nhật bị
  // bo tròn cắt đi vốn không phải một pixel của nút, với BẤT KỲ nút nào, có
  // bug hay không. Đo tay xác nhận: cách mép 1px vẫn thỉnh thoảng trượt, cách
  // 2px luôn trúng ở bo góc 6px — 3px là biên an toàn. Không kẹp thì việc thêm
  // trục x (đúng yêu cầu review) biến MỌI nút hẹp (✕, Lưu) thành "chết ở góc"
  // giả, nhiễu tới mức che mất tín hiệu thật.
  const FRACS=[0.02,0.15,0.5,0.85,0.98];
  const MIN_EDGE_PX=3;
  const clamp=(v,lo,hi)=>Math.min(Math.max(v,lo),hi);
  const hit=()=>{let dead=[],tot=0;
    d.querySelectorAll('button,a[href]').forEach(b=>{const r=b.getBoundingClientRect(); if(r.height<8) return; tot++;
      let miss=0;
      for(const fy of FRACS) for(const fx of FRACS){
        const x=r.left+clamp(fx*r.width, MIN_EDGE_PX, r.width-MIN_EDGE_PX);
        const y=r.top+clamp(fy*r.height, MIN_EDGE_PX, r.height-MIN_EDGE_PX);
        const el=document.elementFromPoint(x,y);
        if(!(el===b||b.contains(el))) miss++;
      }
      if(miss>0){
        const label=(b.textContent||'').trim().slice(0,14)||'✕';
        dead.push(label+'('+miss+'/25)');
      }});
    return {tot,dead};};
  const a=hit(); if(sc) sc.scrollTop=sc.scrollHeight; const b=hit();
  return 'thừa '+(sc?(sc.scrollHeight-sc.clientHeight):0)+'px cuộn · chưa cuộn: '+a.dead.length+'/'+a.tot
    +(a.dead.length?' ['+a.dead.join(',')+']':'')+' · cuộn hết: '+b.dead.length+'/'+b.tot
    +(b.dead.length?' ['+b.dead.join(',')+']':' ✅');
})()`;
for (const W of [390, 360]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: 780,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Page.navigate", { url: "http://localhost:3003/" });
  await wait(2900);
  await ev(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Thêm')?.click()`,
  );
  await wait(1600);
  console.warn(`  ${W} sheet "Thêm":`, await ev(REPORT));
  await send("Page.navigate", { url: "http://localhost:3003/calendar" });
  await wait(3200);
  /*
   * Mở sheet chi tiết đơn bằng cách bấm vào một đơn trên màn Lịch — nhưng màn
   * Lịch có HAI hình dạng từ 2026-09-04:
   *
   *   • màn rộng / chế độ Tháng → lưới, đơn là `<button>` bên trong `.overflow-x-auto`;
   *   • màn hẹp / chế độ timeline → bảng MỘT NGÀY, đơn là `<button>` trong
   *     `ul[role=list]`, và `.overflow-x-auto` KHÔNG tồn tại.
   *
   * Bản trước chỉ biết hình dạng đầu, nên ở 390/360px nó không bấm được gì và
   * báo "KHÔNG mở được dialog" — trung thực, nhưng vô dụng: nó thôi đo được món
   * nợ 3/7 mà nó sinh ra để canh.
   */
  await ev(`(()=>{
    const bar=document.querySelector('.overflow-x-auto button');
    if(bar){bar.click();return 'lưới';}
    /*
     * Chọn đơn CÒN VIỆC, không lấy thẻ đầu tiên gặp được.
     *
     * Món nợ này nói về nút "Thêm ảnh" của một lần bàn giao đang diễn ra. Một
     * đơn đã trả thì sheet là chỗ XEM LẠI bằng chứng — ở đó HandoverPhotos cố
     * ý mở mọi nhóm có ảnh, nên đo nó ra một con số đúng cho một câu hỏi khác.
     * Bản trước lấy thẻ đầu tiên và rơi đúng vào một đơn COMPLETED.
     */
    const cards=[...document.querySelectorAll('#main ul[role=list] > li > button')];
    const live=cards.find(c=>!/Đã trả|Đã huỷ/.test(c.textContent||''));
    if(live){live.click();return 'bảng một ngày · đơn còn việc';}
    if(cards[0]){cards[0].click();return 'bảng một ngày · CHỈ CÓ đơn đã đóng';}
    return 'KHÔNG thấy đơn nào để bấm';
  })()`);
  await wait(2300);
  console.warn(`  ${W} sheet chi tiết đơn:`, await ev(REPORT));
}
ws.close();
