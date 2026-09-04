import { describe, expect, it } from "bun:test";
import {
  isOverdue,
  isPickupOverdue,
  revenueAt,
  toInterval,
  transition,
  availableTransitions,
  RENTAL_STATUSES,
  SHOP_TIMEZONE,
  type RentalStatus,
} from "./rental";
import { overlaps } from "./interval";

describe("transition", () => {
  it("cho phép BOOKED → ONGOING (giao xe)", () => {
    expect(transition("BOOKED", "ONGOING")).toEqual({ ok: true });
  });

  it("cho phép BOOKED → CANCELLED (huỷ trước khi giao)", () => {
    expect(transition("BOOKED", "CANCELLED")).toEqual({ ok: true });
  });

  it("cho phép ONGOING → COMPLETED (trả xe)", () => {
    expect(transition("ONGOING", "COMPLETED")).toEqual({ ok: true });
  });

  // Đây KHÔNG phải một ca biên ngẫu nhiên. Cấm đường này là thứ bảo đảm đơn
  // CANCELLED không bao giờ có `handed_over_at`, và nhờ đó truy vấn doanh thu
  // chỉ cần lọc `handed_over_at IS NOT NULL` mà không phải kiểm trạng thái.
  it("CẤM ONGOING → CANCELLED — xe đã ra khỏi cửa hàng thì không 'chưa từng xảy ra'", () => {
    expect(transition("ONGOING", "CANCELLED")).toEqual({
      ok: false,
      reason: "INVALID_TRANSITION",
    });
  });

  it("trạng thái kết thúc không đi đâu được nữa", () => {
    const terminal: RentalStatus[] = ["COMPLETED", "CANCELLED"];
    const all: RentalStatus[] = ["BOOKED", "ONGOING", "COMPLETED", "CANCELLED"];
    for (const from of terminal) {
      for (const to of all) {
        expect(transition(from, to)).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
      }
    }
  });

  it("không cho phép tự chuyển về chính nó", () => {
    expect(transition("BOOKED", "BOOKED")).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
    expect(transition("ONGOING", "ONGOING")).toEqual({ ok: false, reason: "INVALID_TRANSITION" });
  });
});

const T = (iso: string) => new Date(iso);

describe("isOverdue", () => {
  it("ONGOING và đã qua hạn → quá hạn", () => {
    expect(
      isOverdue(
        { status: "ONGOING", endsAt: T("2026-08-14T10:00:00Z") },
        T("2026-08-15T03:00:00Z"),
      ),
    ).toBe(true);
  });

  it("ONGOING nhưng chưa tới hạn → chưa quá hạn", () => {
    expect(
      isOverdue(
        { status: "ONGOING", endsAt: T("2026-08-16T10:00:00Z") },
        T("2026-08-15T03:00:00Z"),
      ),
    ).toBe(false);
  });

  it("đúng thời điểm hết hạn thì CHƯA quá hạn", () => {
    const t = T("2026-08-15T03:00:00Z");
    expect(isOverdue({ status: "ONGOING", endsAt: t }, t)).toBe(false);
  });

  // Đơn chưa giao mà quá ngày hẹn là chuyện khác hẳn — khách không tới lấy xe,
  // không phải xe đang nằm ngoài đường. Không được gộp hai thứ vào một nhãn đỏ.
  it("BOOKED quá ngày hẹn KHÔNG phải quá hạn", () => {
    expect(
      isOverdue({ status: "BOOKED", endsAt: T("2026-08-14T10:00:00Z") }, T("2026-08-15T03:00:00Z")),
    ).toBe(false);
  });

  it("COMPLETED và CANCELLED không bao giờ quá hạn", () => {
    const past = { endsAt: T("2026-08-01T00:00:00Z") };
    const now = T("2026-08-15T03:00:00Z");
    expect(isOverdue({ status: "COMPLETED", ...past }, now)).toBe(false);
    expect(isOverdue({ status: "CANCELLED", ...past }, now)).toBe(false);
  });
});

describe("isPickupOverdue", () => {
  it("BOOKED và đã qua giờ hẹn lấy xe → quá hẹn lấy", () => {
    expect(
      isPickupOverdue(
        { status: "BOOKED", startsAt: T("2026-08-14T10:00:00Z") },
        T("2026-08-15T03:00:00Z"),
      ),
    ).toBe(true);
  });

  it("BOOKED nhưng chưa tới giờ hẹn → chưa quá hẹn", () => {
    expect(
      isPickupOverdue(
        { status: "BOOKED", startsAt: T("2026-08-16T10:00:00Z") },
        T("2026-08-15T03:00:00Z"),
      ),
    ).toBe(false);
  });

  // Cùng biên với `isOverdue`: đúng thời điểm thì CHƯA quá. Hai hàm phải chọn
  // cùng một quy ước, nếu không "quá hạn" và "quá hẹn lấy" lệch nhau một tick
  // ngay tại giây mà nhân viên đang nhìn màn hình.
  it("đúng giờ hẹn thì CHƯA quá hẹn", () => {
    const t = T("2026-08-15T03:00:00Z");
    expect(isPickupOverdue({ status: "BOOKED", startsAt: t }, t)).toBe(false);
  });

  // ONGOING đã qua `startsAt` là chuyện BÌNH THƯỜNG — xe đã giao rồi, đó chính
  // là nghĩa của ONGOING. Nếu hàm này bắt cả ONGOING thì mọi đơn đang thuê đều
  // đỏ, và màu đỏ hết còn nghĩa gì.
  it("ONGOING không bao giờ quá hẹn lấy — xe đã ra khỏi cửa hàng rồi", () => {
    expect(
      isPickupOverdue(
        { status: "ONGOING", startsAt: T("2026-08-14T10:00:00Z") },
        T("2026-08-15T03:00:00Z"),
      ),
    ).toBe(false);
  });

  it("COMPLETED và CANCELLED không bao giờ quá hẹn lấy", () => {
    const past = { startsAt: T("2026-08-01T00:00:00Z") };
    const now = T("2026-08-15T03:00:00Z");
    expect(isPickupOverdue({ status: "COMPLETED", ...past }, now)).toBe(false);
    expect(isPickupOverdue({ status: "CANCELLED", ...past }, now)).toBe(false);
  });

  // Tính chất mà `rentalChipClass` (apps/staff) DỰA VÀO khi nó tô CÙNG một màu
  // `status-overdue` cho cả hai: hai vị từ loại trừ nhau vì lọc hai `status`
  // khác nhau, nên không có đơn nào "vừa quá hạn trả vừa quá hẹn lấy" và thứ
  // tự kiểm trong hàm đó không đổi kết quả. Nới một trong hai sang status của
  // bên kia sẽ làm test này đỏ trước khi màu kịp sai trên màn hình.
  it("không đơn nào vừa quá hạn trả vừa quá hẹn lấy", () => {
    const now = T("2026-08-15T03:00:00Z");
    const past = T("2026-08-01T00:00:00Z");
    const all: RentalStatus[] = ["BOOKED", "ONGOING", "COMPLETED", "CANCELLED"];
    for (const status of all) {
      const r = { status, startsAt: past, endsAt: past };
      expect(isOverdue(r, now) && isPickupOverdue(r, now)).toBe(false);
    }
  });
});

describe("toInterval", () => {
  it("cắm thẳng được vào overlaps() đã có", () => {
    const a = toInterval({
      startsAt: T("2026-08-12T00:00:00Z"),
      endsAt: T("2026-08-17T00:00:00Z"),
    });
    const b = toInterval({
      startsAt: T("2026-08-16T00:00:00Z"),
      endsAt: T("2026-08-20T00:00:00Z"),
    });
    expect(overlaps(a, b)).toBe(true);
  });

  // Biên [start, end): đơn kết thúc đúng lúc đơn sau bắt đầu thì KHÔNG chồng nhau.
  // Đây chính là ngữ nghĩa mà tstzrange '[)' của DB dùng — hai bên phải khớp.
  it("chạm biên thì không chồng nhau", () => {
    const a = toInterval({
      startsAt: T("2026-08-12T00:00:00Z"),
      endsAt: T("2026-08-17T00:00:00Z"),
    });
    const b = toInterval({
      startsAt: T("2026-08-17T00:00:00Z"),
      endsAt: T("2026-08-20T00:00:00Z"),
    });
    expect(overlaps(a, b)).toBe(false);
  });
});

describe("revenueAt", () => {
  it("đơn đã giao tính vào thời điểm giao xe", () => {
    const handedOverAt = T("2026-08-15T02:00:00Z");
    expect(revenueAt({ status: "ONGOING", handedOverAt })).toEqual(handedOverAt);
    expect(revenueAt({ status: "COMPLETED", handedOverAt })).toEqual(handedOverAt);
  });

  it("đơn chưa giao chưa tính vào đâu cả", () => {
    expect(revenueAt({ status: "BOOKED", handedOverAt: null })).toBeNull();
  });

  it("đơn huỷ không tính, kể cả khi dữ liệu có dấu giao xe", () => {
    expect(revenueAt({ status: "CANCELLED", handedOverAt: T("2026-08-15T02:00:00Z") })).toBeNull();
  });
});

describe("SHOP_TIMEZONE", () => {
  it("là múi giờ của shop, không phải UTC", () => {
    expect(SHOP_TIMEZONE).toBe("Asia/Ho_Chi_Minh");
  });
});

/**
 * `availableTransitions` là `transition` đọc theo chiều ngược lại: thay vì hỏi
 * "đường này có đi được không", nó hỏi "từ đây đi được những đâu". UI cần đúng
 * câu hỏi thứ hai để dựng nút — và phải dựng từ CÙNG một bảng `ALLOWED`, không
 * phải một danh sách chép tay ở frontend. Chép tay là cách chắc chắn nhất để
 * một ngày nào đó luật đổi ở đây mà nút bấm vẫn mời người dùng đi đường đã cấm.
 */
describe("availableTransitions", () => {
  it("BOOKED đi được hai đường: giao xe hoặc huỷ", () => {
    expect(availableTransitions("BOOKED")).toEqual(["ONGOING", "CANCELLED"]);
  });

  it("ONGOING chỉ đi được một đường: trả xe", () => {
    expect(availableTransitions("ONGOING")).toEqual(["COMPLETED"]);
  });

  it("trạng thái kết thúc không còn đường nào", () => {
    expect(availableTransitions("COMPLETED")).toEqual([]);
    expect(availableTransitions("CANCELLED")).toEqual([]);
  });

  // Hàng rào chống hai nguồn sự thật: mọi thứ `availableTransitions` trả ra phải
  // được `transition` chấp nhận, và mọi đường `transition` chấp nhận phải có mặt.
  it("khớp `transition` ở cả hai chiều, cho mọi cặp", () => {
    for (const from of RENTAL_STATUSES) {
      const available = availableTransitions(from);
      for (const to of RENTAL_STATUSES) {
        expect(available.includes(to)).toBe(transition(from, to).ok);
      }
    }
  });
});

import {
  QUEUE_GROUPS,
  QUEUE_HORIZON_DAYS,
  queueGroupOf,
  type QueueBoundaries,
} from "./rental";

describe("queueGroupOf", () => {
  // Giờ shop UTC+7. `now` 15:00 ngày 04/09 ⇒ hết ngày là 00:00 ngày 05/09.
  const B: QueueBoundaries = {
    now: new Date("2026-09-04T15:00:00+07:00"),
    dayEnd: new Date("2026-09-05T00:00:00+07:00"),
    horizon: new Date("2026-09-12T00:00:00+07:00"),
  };
  const at = (iso: string) => new Date(iso);

  it("ONGOING quá endsAt ⇒ OVERDUE", () => {
    expect(
      queueGroupOf(
        { status: "ONGOING", startsAt: at("2026-09-01T09:00:00+07:00"), endsAt: at("2026-09-04T09:00:00+07:00") },
        B,
      ),
    ).toBe("OVERDUE");
  });

  it("BOOKED quá startsAt ⇒ PICKUP_OVERDUE", () => {
    expect(
      queueGroupOf(
        { status: "BOOKED", startsAt: at("2026-09-04T09:00:00+07:00"), endsAt: at("2026-09-08T09:00:00+07:00") },
        B,
      ),
    ).toBe("PICKUP_OVERDUE");
  });

  it("ONGOING đáo hạn CÒN LẠI trong hôm nay ⇒ DUE_TODAY", () => {
    expect(
      queueGroupOf(
        { status: "ONGOING", startsAt: at("2026-09-01T09:00:00+07:00"), endsAt: at("2026-09-04T20:00:00+07:00") },
        B,
      ),
    ).toBe("DUE_TODAY");
  });

  it("BOOKED lấy xe CÒN LẠI trong hôm nay ⇒ PICKUP_TODAY", () => {
    expect(
      queueGroupOf(
        { status: "BOOKED", startsAt: at("2026-09-04T20:00:00+07:00"), endsAt: at("2026-09-08T09:00:00+07:00") },
        B,
      ),
    ).toBe("PICKUP_TODAY");
  });

  it("BOOKED trong 7 ngày tới ⇒ UPCOMING", () => {
    expect(
      queueGroupOf(
        { status: "BOOKED", startsAt: at("2026-09-09T09:00:00+07:00"), endsAt: at("2026-09-11T09:00:00+07:00") },
        B,
      ),
    ).toBe("UPCOMING");
  });

  it("BOOKED xa hơn chân trời ⇒ không thuộc nhóm nào", () => {
    expect(
      queueGroupOf(
        { status: "BOOKED", startsAt: at("2026-09-20T09:00:00+07:00"), endsAt: at("2026-09-22T09:00:00+07:00") },
        B,
      ),
    ).toBeNull();
  });

  // Đây là cái bẫy thật, không phải ca biên hình thức: một đơn đã trả gần như
  // LUÔN có endsAt trong quá khứ, nên một luật viết tay so `endsAt < now` sẽ
  // gán nó thành OVERDUE và đẩy đơn đã xong vào hàng đợi việc.
  it("COMPLETED và CANCELLED không bao giờ vào hàng đợi", () => {
    const past = { startsAt: at("2026-08-01T09:00:00+07:00"), endsAt: at("2026-08-05T09:00:00+07:00") };
    expect(queueGroupOf({ status: "COMPLETED", ...past }, B)).toBeNull();
    expect(queueGroupOf({ status: "CANCELLED", ...past }, B)).toBeNull();
  });

  // Biên: hai vị từ dùng `<` nên đúng mốc thuộc về nhóm SAU, không phải nhóm trước.
  it("đúng mốc now KHÔNG phải quá hạn; đúng mốc dayEnd KHÔNG phải hôm nay", () => {
    expect(
      queueGroupOf({ status: "ONGOING", startsAt: at("2026-09-01T00:00:00+07:00"), endsAt: B.now }, B),
    ).toBe("DUE_TODAY");
    expect(
      queueGroupOf({ status: "BOOKED", startsAt: B.dayEnd, endsAt: at("2026-09-10T00:00:00+07:00") }, B),
    ).toBe("UPCOMING");
    expect(
      queueGroupOf({ status: "ONGOING", startsAt: at("2026-09-01T00:00:00+07:00"), endsAt: B.dayEnd }, B),
    ).toBeNull();
  });

  it("năm nhóm, không trùng, và chân trời là 7 ngày", () => {
    expect(QUEUE_GROUPS).toHaveLength(5);
    expect(new Set(QUEUE_GROUPS).size).toBe(5);
    expect(QUEUE_HORIZON_DAYS).toBe(7);
  });
});
