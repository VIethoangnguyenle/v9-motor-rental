import { describe, expect, it } from "bun:test";
import type { RentalStatus } from "@v9/shared/domain/rental";
import { STATUS_LABEL, lastMomentOf, rentalChipClass } from "./rental-status";

/**
 * `rentalChipClass` là chỗ DUY NHẤT hai vị từ domain (`isOverdue`,
 * `isPickupOverdue`) gộp lại thành một quyết định THỊ GIÁC, và nó tô cho bốn
 * màn hình: lịch timeline, lịch tháng, danh sách khách hàng, lịch sử thuê. Nghĩa
 * là một thay đổi ở đây đổi màu ở những màn hình nằm ngoài task đang làm.
 *
 * Đợt trước sửa nó xong phải chạy tay ma trận 16 ca để chứng minh "chỉ đúng 2 ca
 * đổi màu". Một lời tuyên bố phải chạy tay mới kiểm được thì lần sau sẽ không ai
 * kiểm. File này biến ma trận đó thành thứ máy giữ.
 *
 * Cố ý so bằng CHUỖI CLASS nguyên văn chứ không so với hằng số import từ
 * `rental-status.ts`: so với chính hằng số đó thì test luôn xanh dù class đổi
 * thành gì, tức là không khoá được gì cả.
 */

const NOW = new Date("2026-09-01T12:00:00Z");
const PAST = new Date("2026-08-01T00:00:00Z");
const FUTURE = new Date("2026-10-01T00:00:00Z");

const OVERDUE = "bg-status-overdue text-accent-ink";
const PICKUP_OVERDUE =
  "border border-status-overdue bg-status-overdue-soft text-status-overdue";
const BOOKED = "border border-status-booked bg-status-booked-soft text-status-booked";
const ONGOING = "bg-status-ongoing text-accent-ink";
const COMPLETED = "bg-status-completed text-accent-ink";
const CANCELLED =
  "border border-status-completed bg-status-completed-soft text-status-completed";

/** Bốn quan hệ thời gian, đặt tên theo thứ nhân viên thực sự hỏi. */
const RELATIONS = [
  { name: "đã qua cả giờ lấy lẫn giờ trả", startsAt: PAST, endsAt: PAST },
  { name: "đã qua giờ lấy, chưa tới giờ trả", startsAt: PAST, endsAt: FUTURE },
  { name: "chưa tới giờ lấy", startsAt: FUTURE, endsAt: FUTURE },
  { name: "giờ lấy ĐÚNG bây giờ", startsAt: NOW, endsAt: FUTURE },
] as const;

/** Ma trận 4 status × 4 quan hệ thời gian. Đây LÀ đặc tả, không phải phụ lục. */
const MATRIX: Record<RentalStatus, readonly string[]> = {
  // BOOKED quá giờ lấy → đỏ VIỀN. Đúng ranh giới: bằng `now` thì CHƯA quá.
  BOOKED: [PICKUP_OVERDUE, PICKUP_OVERDUE, BOOKED, BOOKED],
  // ONGOING quá giờ trả → đỏ ĐẶC. `startsAt` không ảnh hưởng gì tới ONGOING.
  ONGOING: [OVERDUE, ONGOING, ONGOING, ONGOING],
  // Hai trạng thái kết thúc: thời gian không đổi được màu của chúng.
  COMPLETED: [COMPLETED, COMPLETED, COMPLETED, COMPLETED],
  CANCELLED: [CANCELLED, CANCELLED, CANCELLED, CANCELLED],
};

const ALL_STATUSES: readonly RentalStatus[] = ["BOOKED", "ONGOING", "COMPLETED", "CANCELLED"];

describe("rentalChipClass — ma trận đầy đủ", () => {
  for (const status of ALL_STATUSES) {
    RELATIONS.forEach((rel, i) => {
      it(`${status} · ${rel.name}`, () => {
        expect(rentalChipClass({ status, startsAt: rel.startsAt, endsAt: rel.endsAt }, NOW)).toBe(
          MATRIX[status][i] as string,
        );
      });
    });
  }
});

describe("rentalChipClass — bất biến mà bốn màn hình đang dựa vào", () => {
  // Đỏ có HAI nghĩa ("xe trễ về" vs "chưa ai lấy xe"). Trên lịch, `STATUS_LABEL`
  // CHỈ nằm trong `title=` — tức chỉ hiện khi hover, mà đây là PWA dùng trên
  // điện thoại nên không có hover. Vậy sự khác biệt BẮT BUỘC phải nằm trong
  // chính class, không được nằm ở nhãn.
  it("hai nghĩa của màu đỏ KHÔNG được tô giống nhau", () => {
    const lateReturn = rentalChipClass({ status: "ONGOING", startsAt: PAST, endsAt: PAST }, NOW);
    const neverPicked = rentalChipClass({ status: "BOOKED", startsAt: PAST, endsAt: PAST }, NOW);
    expect(lateReturn).not.toBe(neverPicked);
  });

  // Cùng lý lẽ cho cặp kết thúc: bảng lịch sử hiện CẢ hai, và trước đợt này
  // chúng dùng chung một class nên nhìn y hệt nhau.
  it("đã trả và đã huỷ KHÔNG được tô giống nhau", () => {
    const done = rentalChipClass({ status: "COMPLETED", startsAt: PAST, endsAt: PAST }, NOW);
    const cancelled = rentalChipClass({ status: "CANCELLED", startsAt: PAST, endsAt: PAST }, NOW);
    expect(done).not.toBe(cancelled);
  });

  // Bốn trạng thái ở trạng thái "bình thường" (chưa quá hạn gì) cũng phải phân
  // biệt được với nhau — nếu không thì màu không mang thông tin nào.
  it("bốn trạng thái bình thường ra bốn class khác nhau", () => {
    const normal = ALL_STATUSES.map((status) =>
      rentalChipClass({ status, startsAt: FUTURE, endsAt: FUTURE }, NOW),
    );
    expect(new Set(normal).size).toBe(ALL_STATUSES.length);
  });

  // CHỈ BOOKED-quá-giờ-lấy được nhận class đỏ viền. Nếu một status khác lọt vào
  // nhánh đó thì "quá hẹn lấy" đã bị nới sai — bắt ở đây trước khi màu kịp sai
  // trên bốn màn hình.
  it("đỏ viền chỉ thuộc về BOOKED đã qua giờ lấy, không ca nào khác", () => {
    const hits: string[] = [];
    for (const status of ALL_STATUSES) {
      for (const rel of RELATIONS) {
        if (
          rentalChipClass({ status, startsAt: rel.startsAt, endsAt: rel.endsAt }, NOW) ===
          PICKUP_OVERDUE
        ) {
          hits.push(`${status}/${rel.name}`);
        }
      }
    }
    expect(hits).toEqual([
      "BOOKED/đã qua cả giờ lấy lẫn giờ trả",
      "BOOKED/đã qua giờ lấy, chưa tới giờ trả",
    ]);
  });

  // Không có token màu thứ năm. Bốn token `status-*` của `index.css` là toàn bộ
  // bảng màu; thêm một cái là phải đo lại contrast, nên chặn ở đây.
  it("không dùng token màu nào ngoài bốn token status-* đã khai", () => {
    const seen = new Set<string>();
    for (const status of ALL_STATUSES) {
      for (const rel of RELATIONS) {
        for (const cls of rentalChipClass(
          { status, startsAt: rel.startsAt, endsAt: rel.endsAt },
          NOW,
        ).split(" ")) {
          const token = /(?:bg|text|border)-(status-[a-z]+)/.exec(cls)?.[1];
          if (token) seen.add(token);
        }
      }
    }
    expect([...seen].sort()).toEqual([
      "status-booked",
      "status-completed",
      "status-ongoing",
      "status-overdue",
    ]);
  });
});

describe("STATUS_LABEL", () => {
  // Nhãn vẫn phải đủ và phân biệt được — màu bây giờ gánh phần "quá hạn", nhưng
  // nhãn vẫn là thứ duy nhất nói ĐÂY LÀ TRẠNG THÁI GÌ ở màn hình có chỗ hiện nó.
  it("đủ bốn trạng thái, không trùng nhau", () => {
    const labels = ALL_STATUSES.map((s) => STATUS_LABEL[s]);
    expect(labels).toEqual(["Đã đặt", "Đang thuê", "Đã trả", "Đã huỷ"]);
    expect(new Set(labels).size).toBe(4);
  });
});

describe("lastMomentOf", () => {
  /**
   * Bug thật, đo được trước khi sửa: `customer-table.tsx` in "Trả 00:00 29-08"
   * cho một đơn mà ngày cuối khách còn giữ xe là 28-08, và
   * `customer-rental-history.tsx` in "20/08/2026 – 29/08/2026" cho cùng đơn đó.
   * Nguyên nhân là hiển thị thẳng `endsAt`, vốn là biên MỞ.
   */
  it("đưa nửa đêm-biên-mở về cuối ngày TRƯỚC đó", () => {
    // Đúng khuôn `toApiRange` sinh ra: đơn "20/08 → 22/08" lưu endsAt = 23/08 00:00 giờ VN.
    const endsAt = new Date("2026-08-22T17:00:00.000Z"); // = 23/08 00:00 +07
    expect(lastMomentOf(endsAt).toISOString()).toBe("2026-08-22T16:59:59.999Z"); // = 22/08 23:59:59.999 +07
  });

  /**
   * `endsAt` KHÔNG phải lúc nào cũng là nửa đêm — `scripts/seed-dev.ts` cố ý tạo
   * một đơn quá hạn với `ends_at` lệch 2 giờ để thanh đỏ còn giao với cửa sổ
   * lịch. Trừ nguyên 24 giờ (cách sửa hiển nhiên nhưng sai) sẽ lùi những đơn đó
   * về sai hẳn một ngày; lùi một mili-giây thì đúng ở mọi giờ.
   */
  it("giữ nguyên ngày khi endsAt KHÔNG rơi vào nửa đêm", () => {
    const endsAt = new Date("2026-08-22T19:00:00.000Z"); // = 23/08 02:00 +07
    expect(lastMomentOf(endsAt).toISOString()).toBe("2026-08-22T18:59:59.999Z"); // = 23/08 01:59:59.999 +07
  });

  it("không đụng vào đối tượng gốc", () => {
    const endsAt = new Date("2026-08-22T17:00:00.000Z");
    lastMomentOf(endsAt);
    expect(endsAt.toISOString()).toBe("2026-08-22T17:00:00.000Z");
  });
});
