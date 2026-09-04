import { writeFileSync } from "node:fs";
const OUT = process.argv[2],
  WIDTH = Number(process.argv[3]);
const list = await (await fetch("http://localhost:9222/json/list")).json();
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expr) =>
  (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }))
    .result?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: 780,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

const go = async (url, settle = 2200) => {
  await send("Page.navigate", { url });
  await wait(settle);
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${OUT}/${WIDTH}-${name}.png`, Buffer.from(r.result.data, "base64"));
  const h = await evaluate("document.documentElement.scrollHeight");
  const overflow = await evaluate(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
  console.warn(
    `  ${WIDTH}-${name}.png   cao ${h}px   tràn ngang ${overflow}px ${overflow > 0 ? "⚠️" : ""}`,
  );
};

await go("http://localhost:3003/");
await wait(1500);
await shot("00-landing");

// đăng nhập: set value theo kiểu React nhận được
const filled = await evaluate(`(() => {
  const set = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const email = document.querySelector('input[type=email], input[name=email]');
  const pw = document.querySelector('input[type=password]');
  if (!email || !pw) return 'KHÔNG THẤY Ô ĐĂNG NHẬP';
  set(email, 'chu-shop@example.com'); set(pw, 'DoiMatKhauNgay!1');
  const btn = [...document.querySelectorAll('button')].find(b => b.type === 'submit' || /nhập|Sign/i.test(b.textContent));
  if (!btn) return 'KHÔNG THẤY NÚT GỬI';
  btn.click(); return 'đã gửi';
})()`);
console.warn("  đăng nhập:", filled);
await wait(3500);
await shot("01-sau-dang-nhap");
console.warn("  url hiện tại:", await evaluate("location.pathname"));

for (const [path, name] of [
  ["/", "02-thong-ke"],
  ["/calendar", "03-lich"],
  ["/requests", "04-yeu-cau"],
  ["/customers", "05-khach-hang"],
  ["/staff", "06-nhan-vien"],
  // Hai route dưới đây thêm SAU đợt dựng probe (2026-09-03). Danh sách này là
  // thứ duy nhất nói "đã chụp hết màn hình chưa", nên một route không có tên ở
  // đây là một màn không ai nhìn — probe vẫn xanh và vẫn mù.
  ["/rentals", "07-don-thue"],
  ["/field", "08-hien-truong"],
  ["/settings", "09-cai-dat"],
  ["/change-password", "10-doi-mat-khau"],
]) {
  await go("http://localhost:3003" + path, 2600);
  await shot(name);
}
ws.close();
