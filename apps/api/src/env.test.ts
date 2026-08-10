import { describe, expect, it } from "bun:test";

/**
 * env.ts đọc process.env lúc import, nên không test được bằng cách import lại
 * trong cùng tiến trình (module cache). Spawn tiến trình con là cách duy nhất
 * quan sát được hành vi fail-fast thật.
 */
async function bootWith(extra: Record<string, string>) {
  const proc = Bun.spawn(
    ["bun", "-e", 'import("./src/env.ts").then(() => console.log("BOOT_OK"))'],
    {
      cwd: import.meta.dir + "/..",
      env: { ...process.env, ...extra },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { out, err, code: proc.exitCode };
}

describe("env", () => {
  it("dev không cần AUTH_DEV_OTP vẫn khởi động được", async () => {
    const { out } = await bootWith({ NODE_ENV: "development" });
    expect(out).toContain("BOOT_OK");
  });

  it("production + AUTH_DEV_OTP = KHÔNG khởi động", async () => {
    const { err, code } = await bootWith({ NODE_ENV: "production", AUTH_DEV_OTP: "123456" });
    expect(code).not.toBe(0);
    expect(err).toContain("AUTH_DEV_OTP");
  });

  // Ca này giữ hàng rào KHỎI chặn nhầm: nó phải chỉ nổ khi AUTH_DEV_OTP CÓ MẶT,
  // không phải nổ với mọi production. Bỏ test này thì việc siết điều kiện thành
  // `if (isProduction)` sẽ lọt — đã kiểm bằng mutation, hai test kia đều xanh.
  it("production KHÔNG có AUTH_DEV_OTP vẫn khởi động bình thường", async () => {
    const { out, code } = await bootWith({ NODE_ENV: "production" });
    expect(out).toContain("BOOT_OK");
    expect(code).toBe(0);
  });

  it("cổng không phải số thì không khởi động", async () => {
    const { err, code } = await bootWith({ NODE_ENV: "development", API_PORT: "abc" });
    expect(code).not.toBe(0);
    expect(err).toContain("API_PORT");
  });
});
