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
await send("Page.enable");
await send("Runtime.enable");
for (const w of [390, 1280]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: 780,
    deviceScaleFactor: 1,
    mobile: w < 800,
  });
  await send("Page.navigate", { url: "http://localhost:3003/calendar" });
  await new Promise((r) => setTimeout(r, 3000));
  console.warn(
    w + "px:",
    await ev(`(()=>{
    // Hai HÌNH DẠNG, không phải một. Từ 2026-09-04, màn hẹp ở chế độ timeline
    // vẽ BẢNG MỘT NGÀY (danh sách dọc, không cuộn ngang) chứ không vẽ lưới, nên
    // '.overflow-x-auto' KHÔNG tồn tại ở đó. Bản trước của probe này truy vấn
    // thẳng nó rồi đọc '.getBoundingClientRect()' của \`null\` — báo ra
    // 'undefined' và KHÔNG thoát khác 0, tức probe mù mà vẫn trông như chạy
    // được. Đúng lớp lỗi mà README.md của thư mục này liệt kê.
    const grid=document.querySelector('.overflow-x-auto');
    const main=document.querySelector('#main');
    if(!main) return 'LỖI: không thấy #main — có đăng nhập được không?';

    if(grid){
      const g=grid.getBoundingClientRect();
      const cols=grid.querySelectorAll('thead th, [role=columnheader]').length;
      return 'LƯỚI · bắt đầu ở y='+Math.round(g.top)+'px  ('+Math.round(g.top/780*100)+'% màn hình dùng cho phần đầu) · '
        + 'hiện '+grid.clientWidth+' / cần '+grid.scrollWidth+'px · cột tiêu đề: '+cols;
    }

    // Bảng một ngày: đo đúng thứ tương ứng — phần đầu ăn bao nhiêu chiều cao
    // trước khi nội dung đầu tiên bắt đầu, và có cuộn ngang sót lại không.
    const first=main.querySelector('ul[role=list] > li, p, div[class*="border"]');
    if(!first) return 'LỖI: không thấy nội dung nào trong #main';
    const f=first.getBoundingClientRect();
    const overflow=document.documentElement.scrollWidth-document.documentElement.clientWidth;
    const cards=main.querySelectorAll('ul[role=list] > li').length;
    return 'BẢNG MỘT NGÀY · nội dung bắt đầu ở y='+Math.round(f.top)+'px  ('+Math.round(f.top/780*100)+'% màn hình dùng cho phần đầu) · '
      + 'tràn ngang '+overflow+'px · số thẻ: '+cards;
  })()`),
  );
}
ws.close();
