import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { SHOP_TIMEZONE } from "@v9/shared/domain/rental";
import { MAX_PHOTO_BYTES, PHOTO_KINDS, type PhotoKind } from "@v9/shared/domain/rental-photo";
import { errorMessage } from "../../lib/errors";
import {
  deleteRentalPhoto,
  fetchPhotoObjectUrl,
  rentalPhotosQuery,
  uploadRentalPhoto,
  type RentalPhotoRow,
} from "../../lib/photos";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";

const KIND_LABEL: Record<PhotoKind, string> = {
  DOCUMENT: "Giấy tờ tuỳ thân",
  HANDOVER: "Tình trạng xe lúc giao",
  RETURN: "Tình trạng xe lúc nhận lại",
};

/**
 * Mốc chụp ảnh, theo giờ SHOP chứ không theo đồng hồ máy đang xem.
 *
 * Hai chỗ dùng: `alt` của ảnh và câu hỏi xác nhận trước khi xoá. Cả hai đều là
 * thứ nhân viên đối chiếu với khách ("tấm này chụp lúc mấy giờ"), nên đọc theo
 * đồng hồ của người xem là sai — `toLocaleString("vi-VN")` trần (bản trước của
 * file này) làm đúng điều đó. Mọi `Intl.DateTimeFormat` khác trong app đều khai
 * `timeZone` tường minh; lý lẽ đầy đủ ở `calendar-timeline.tsx`.
 */
const PHOTO_TIME_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: SHOP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const KIND_HINT: Record<PhotoKind, string> = {
  DOCUMENT: "CCCD hoặc hộ chiếu shop đang giữ cho đơn này.",
  HANDOVER: "Chụp trước khi khách đi — vết xước có sẵn phải nằm trong ảnh này.",
  RETURN: "Chụp lúc nhận lại, cùng góc với ảnh lúc giao thì dễ đối chiếu nhất.",
};

/**
 * Một ô ảnh. Tự tải byte qua `fetch` rồi dựng `blob:` URL — KHÔNG gắn thẳng URL
 * API vào `src`, lý do đầy đủ ở `lib/photos.ts`.
 *
 * `revokeObjectURL` chạy trong cleanup của `useEffect`, và cờ `alive` chặn ca
 * component unmount trong lúc `fetch` còn bay: không có nó thì URL được tạo sau
 * khi cleanup đã chạy, và blob đó rò lại trong bộ nhớ tab cho tới khi tải lại
 * trang — im lặng, và tệ dần theo số lần mở sheet.
 */
function PhotoThumb({
  photo,
  onRequestDelete,
  busy,
  confirming,
}: {
  readonly photo: RentalPhotoRow;
  /** Chỉ MỞ câu hỏi xác nhận — không xoá. Xem `HandoverPhotos`. */
  readonly onRequestDelete: () => void;
  readonly busy: boolean;
  /** Tấm này đang là tấm được hỏi "xoá thật không" — tô viền đỏ để câu hỏi bên
   *  dưới trỏ vào đúng một tấm nhìn thấy được, không phải "một tấm nào đó". */
  readonly confirming: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;

    void fetchPhotoObjectUrl(photo.rentalId, photo.id).then((u) => {
      if (!alive) {
        if (u !== null) URL.revokeObjectURL(u);
        return;
      }
      if (u === null) setFailed(true);
      else {
        created = u;
        setUrl(u);
      }
    });

    return () => {
      alive = false;
      if (created !== null) URL.revokeObjectURL(created);
    };
  }, [photo.rentalId, photo.id]);

  return (
    <li className="relative">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className={`block aspect-square overflow-hidden rounded-card border bg-canvas ${
          confirming ? "border-status-overdue" : "border-border"
        }`}
      >
        {url === null ? (
          <span className="flex h-full items-center justify-center text-xs text-muted">
            {failed ? "Không tải được" : "Đang tải…"}
          </span>
        ) : (
          // `alt` mô tả VAI TRÒ của ảnh, không mô tả nội dung: không ai biết
          // trong ảnh có gì ngoài người đã chụp nó.
          <img
            src={url}
            alt={`${KIND_LABEL[photo.kind]} — chụp lúc ${PHOTO_TIME_FMT.format(new Date(photo.createdAt))}`}
            className="h-full w-full object-cover"
          />
        )}
      </a>
      {/* Nút này MỞ câu hỏi, không xoá. Trước đây một chạm là xoá vĩnh viễn, và
          vùng chạm 44px đó nằm ĐÈ LÊN chính tấm ảnh — trên điện thoại trong gara
          thì chạm nhầm là chuyện thường. `PRODUCT.md` nguyên tắc #3: ảnh lúc
          giao và lúc nhận tồn tại để bảo vệ KHÁCH khỏi bị đổ oan, nên mất một
          tấm là mất bằng chứng của cả hai phía, không khôi phục được.
          `rental-detail-sheet.tsx` đã hỏi một nhịp trước khi huỷ đơn — mà huỷ
          đơn còn lên lại được. */}
      <button
        type="button"
        onClick={onRequestDelete}
        disabled={busy}
        aria-label={`Xoá ảnh ${KIND_LABEL[photo.kind]}`}
        // `bg-canvas` ĐẶC, không `bg-canvas/90`: ở 90% thì 10% còn lại là chính
        // TẤM ẢNH, nên tương phản của dấu ✕ đỏ phụ thuộc vào ảnh nằm dưới — với
        // một tấm chụp xe tối màu thì không ai biết nó còn bao nhiêu. Đặc thì
        // khoá ở 5,16:1 bất kể ảnh gì.
        className="absolute top-1 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-card bg-canvas text-sm text-status-overdue disabled:opacity-50"
      >
        ✕
      </button>
    </li>
  );
}

function KindSection({
  kind,
  photos,
  busy,
  confirming,
  onUpload,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  readonly kind: PhotoKind;
  readonly photos: readonly RentalPhotoRow[];
  readonly busy: boolean;
  /** Ảnh đang chờ xác nhận xoá — của BẤT KỲ nhóm nào; lọc lại bên dưới. */
  readonly confirming: RentalPhotoRow | null;
  readonly onUpload: (kind: PhotoKind, file: File) => void;
  readonly onRequestDelete: (photo: RentalPhotoRow) => void;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mine = photos.filter((p) => p.kind === kind);
  // Khối hỏi nằm trong nhóm CHỨA tấm ảnh đó, không phải ở đáy cả khu vực: câu
  // hỏi phải ở cạnh tấm nó đang hỏi, nếu không người dùng phải cuộn để đối chiếu
  // "tấm nào đang viền đỏ" với "câu hỏi nói tấm nào".
  const confirmingMine = confirming?.kind === kind ? confirming : null;

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="m-0 text-sm font-semibold text-ink">{KIND_LABEL[kind]}</h3>
        <p className="m-0 text-xs text-muted">{KIND_HINT[kind]}</p>
      </div>

      {mine.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
          {mine.map((p) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              busy={busy}
              confirming={confirmingMine?.id === p.id}
              onRequestDelete={() => onRequestDelete(p)}
            />
          ))}
        </ul>
      )}

      {/* Cùng khuôn xác nhận với nút huỷ đơn ở `rental-detail-sheet.tsx`: một
          `Alert tone="warning"` nói HẬU QUẢ, rồi hai nút — không phải
          `window.confirm`, vốn không đọc được bằng token và bị chặn trong PWA
          standalone ở vài trình duyệt. Câu hỏi nêu đủ loại ảnh và giờ chụp để
          người đang cầm điện thoại tự kiểm là mình bấm đúng tấm. */}
      {confirmingMine && (
        <div className="flex flex-col gap-2">
          <Alert tone="warning">
            Xoá ảnh {KIND_LABEL[confirmingMine.kind].toLowerCase()} chụp lúc{" "}
            {PHOTO_TIME_FMT.format(new Date(confirmingMine.createdAt))}? Ảnh bàn giao là bằng chứng
            khi có tranh chấp xước xát — xoá rồi không lấy lại được.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={onConfirmDelete}>
              {busy ? "Đang xoá…" : "Xoá ảnh"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancelDelete}>
              Giữ lại
            </Button>
          </div>
        </div>
      )}

      {/*
       * `capture="environment"` mở thẳng camera sau trên điện thoại thay vì
       * thư viện ảnh — nhân viên đang đứng cạnh xe, không đi tìm ảnh cũ. Trên
       * desktop thuộc tính này bị bỏ qua, nên vẫn là chọn file bình thường.
       *
       * Input bị ẩn và điều khiển bằng `<Button>` vì `<input type=file>` gốc
       * không nhận được style, và một nút cao 20px là nút bấm trượt trong gara.
       */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(kind, file);
          // Xoá giá trị để chọn LẠI CÙNG một file vẫn kích hoạt `change` —
          // không có dòng này thì chụp lại đúng tấm vừa xoá sẽ không gửi gì.
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        + Thêm ảnh
      </Button>
    </section>
  );
}

/**
 * Khu vực ảnh bàn giao trong sheet chi tiết đơn.
 *
 * `PRODUCT.md` nguyên tắc #3: ảnh lúc giao và lúc nhận tồn tại để bảo vệ khách
 * khỏi bị đổ oan, chứ không chỉ để bảo vệ shop. Đó là lý do ba nhóm hiện tách
 * nhau kèm câu gợi ý riêng — một đống ảnh không phân loại không trả lời được
 * câu "lúc giao trông thế nào so với lúc nhận lại".
 */
export function HandoverPhotos({ rentalId }: { readonly rentalId: string }) {
  const qc = useQueryClient();
  const list = useQuery(rentalPhotosQuery(rentalId));

  /**
   * Ảnh đang chờ xác nhận xoá. Giữ cả DÒNG chứ không chỉ `id`: câu hỏi cần loại
   * ảnh và giờ chụp để tự kiểm được, và đọc lại từ `photos` bằng `id` sẽ trả
   * `undefined` đúng vào lúc `invalidateQueries` vừa chạy — tức câu hỏi nhấp
   * nháy mất chữ ngay giữa lúc người dùng đang đọc nó.
   */
  const [confirming, setConfirming] = useState<RentalPhotoRow | null>(null);

  const upload = useMutation({
    mutationFn: async ({ kind, file }: { kind: PhotoKind; file: File }) => {
      // Kiểm ở client để nói ngay, không bắt nhân viên chờ upload 12 MB rồi mới
      // bị từ chối. Hàng rào thật vẫn ở API và ở CHECK của DB.
      if (file.size > MAX_PHOTO_BYTES) {
        throw new Error(
          `Ảnh lớn hơn ${String(Math.floor(MAX_PHOTO_BYTES / 1024 / 1024))} MB, chụp lại ở chế độ thường giúp shop nhé.`,
        );
      }
      const r = await uploadRentalPhoto(rentalId, kind, file);
      if (!r.ok) throw new Error(errorMessage(r.value, "Không tải được ảnh lên"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-photos", rentalId] }),
  });

  const remove = useMutation({
    mutationFn: async (photoId: string) => {
      const r = await deleteRentalPhoto(rentalId, photoId);
      if (!r.ok) throw new Error(errorMessage(r.value, "Không xoá được ảnh"));
    },
    onSuccess: async () => {
      // Đóng câu hỏi CHỈ khi xoá xong thật. Hỏng thì giữ nguyên nó cùng
      // `remove.error` ngay trên đầu khu vực, để người dùng bấm lại được mà
      // không phải mở lại từ đầu.
      setConfirming(null);
      await qc.invalidateQueries({ queryKey: ["rental-photos", rentalId] });
    },
  });

  const busy = upload.isPending || remove.isPending;
  const photos = list.data?.ok ? list.data.photos : [];

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      {upload.error && <Alert tone="error">{upload.error.message}</Alert>}
      {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
      {list.data && !list.data.ok && (
        <Alert tone="error" live="polite">
          {errorMessage(list.data.value, "Không tải được danh sách ảnh")}
        </Alert>
      )}
      {upload.isPending && <p className="m-0 text-sm text-muted">Đang tải ảnh lên…</p>}

      {PHOTO_KINDS.map((kind) => (
        <KindSection
          key={kind}
          kind={kind}
          photos={photos}
          busy={busy}
          confirming={confirming}
          onUpload={(k, file) => upload.mutate({ kind: k, file })}
          onRequestDelete={setConfirming}
          onCancelDelete={() => setConfirming(null)}
          onConfirmDelete={() => {
            if (confirming) remove.mutate(confirming.id);
          }}
        />
      ))}
    </div>
  );
}
