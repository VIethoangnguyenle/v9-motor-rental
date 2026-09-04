import { afterEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { PhotoKind } from "@v9/shared/domain/rental-photo";

/**
 * `lib/photos` bị thay TRƯỚC khi `evidence-axis` được nạp — `mock.module` ghi vào
 * registry module, nên một `import` tĩnh ở đầu file này sẽ lấy bản thật trước khi
 * lời gọi dưới đây kịp chạy. Vì vậy component nạp bằng `await import()` sau đó.
 */
let photos: { kind: PhotoKind; id: string }[] = [];

void mock.module("../../lib/photos", () => ({
  rentalPhotosQuery: (rentalId: string) => ({
    queryKey: ["rental-photos", rentalId],
    queryFn: () =>
      Promise.resolve({
        ok: true,
        photos: photos.map((p) => ({
          ...p,
          rentalId,
          createdAt: new Date("2026-09-04T10:00:00+07:00"),
          contentType: "image/jpeg",
          sizeBytes: 1000,
          uploadedBy: "s1",
        })),
      }),
  }),
  uploadRentalPhoto: () => Promise.resolve({ ok: true }),
  // `PinnedThumb` gọi qua `usePhotoObjectUrl`; trả `null` cho ra nhánh "không
  // tải được", đủ để ô ảnh tồn tại mà không cần dựng một blob thật.
  fetchPhotoObjectUrl: () => Promise.resolve(null),
  /*
   * Hai export dưới đây file này KHÔNG dùng, và vẫn phải có mặt.
   *
   * `mock.module` thay cả module ở phạm vi TIẾN TRÌNH, không phải phạm vi file
   * test. Thiếu một export là mọi file test khác chạy chung tiến trình mà nhập
   * nó vỡ ngay lúc nạp — `SyntaxError: Export named '…' not found`, ném ở một
   * file không liên quan gì tới đây, nên đọc log sẽ tưởng lỗi nằm ở chỗ khác.
   * Đây là ca đã cắn thật khi viết file này.
   */
  deleteRentalPhoto: () => Promise.resolve({ ok: true }),
  updateHandover: () => Promise.resolve({ ok: true }),
}));

const { EvidenceAxis } = await import("./evidence-axis");

function draw(status: "BOOKED" | "ONGOING") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EvidenceAxis rentalId="r1" status={status} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  photos = [];
});

describe("EvidenceAxis", () => {
  /**
   * Luật đắt nhất của component này, và trước test này nó chỉ được giữ bởi một
   * điều kiện trong JSX.
   *
   * Không ai chụp được "tình trạng lúc nhận lại" của một chiếc xe còn nằm trong
   * shop. Một nút bấm được cho việc chưa thể làm là lời mời tạo ra bằng chứng sai
   * NGÀY — thứ đắt hơn hẳn việc thiếu nó, vì nó vẫn TRÔNG như bằng chứng vào lúc
   * có tranh chấp, tức đúng lúc `PRODUCT.md` nguyên tắc #3 cần nó đúng.
   */
  it("đơn BOOKED không mời chụp ảnh lúc nhận lại", async () => {
    draw("BOOKED");
    expect(await screen.findByRole("button", { name: /Chụp giấy tờ/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Chụp lúc giao/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Chụp lúc nhận lại/ })).toBeNull();
  });

  it("trạm chưa tới lượt nói 'chưa tới lượt', không nói 'không cần'", async () => {
    draw("BOOKED");
    expect(await screen.findByText("chưa tới lượt")).toBeTruthy();
    expect(screen.queryByText("không cần")).toBeNull();
  });

  /**
   * Bước ĐÃ QUA không quay lại đòi nợ: xe đã giao rồi mà thiếu ảnh lúc giao là
   * một lỗ hổng có thật, nhưng bắt người đang đứng ở lề đường đi sửa quá khứ
   * trước khi ghi nhận việc hiện tại là sai thứ tự.
   */
  it("đơn ONGOING chỉ mời chụp ảnh lúc nhận lại", async () => {
    draw("ONGOING");
    expect(await screen.findByRole("button", { name: /Chụp lúc nhận lại/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Chụp giấy tờ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Chụp lúc giao/ })).toBeNull();
  });

  /** Món nợ đã trả từ tấm đầu tiên, nhưng bốn góc xe là bốn tấm. */
  it("trạm đã có ảnh vẫn chụp thêm được, kể cả khi không còn nợ", async () => {
    photos = [{ kind: "HANDOVER", id: "p1" }];
    draw("ONGOING");
    expect(await screen.findByRole("button", { name: /Chụp thêm/ })).toBeTruthy();
  });
});
