import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { RentalStatus } from "@v9/shared/domain/rental";
import { nextEvidence } from "@v9/shared/domain/rental-evidence";
import { MAX_PHOTO_BYTES, PHOTO_KINDS, type PhotoKind } from "@v9/shared/domain/rental-photo";
import { errorMessage } from "../../lib/errors";
import { KIND_HINT, KIND_LABEL, PHOTO_TIME_FMT } from "../../lib/photo-labels";
import { usePhotoObjectUrl } from "../../hooks/use-photo-object-url";
import {
  deleteRentalPhoto,
  rentalPhotosQuery,
  uploadRentalPhoto,
  type RentalPhotoRow,
} from "../../lib/photos";
import { Alert } from "../ui/alert";
import { Icon } from "../ui/icon";
import { Button } from "../ui/button";

/**
 * Một ô ảnh của sheet chi tiết: ảnh, và nút mở câu hỏi xoá.
 *
 * Việc tải byte và thu hồi `blob:` URL nằm ở `hooks/use-photo-object-url.ts` —
 * màn Hiện trường cần đúng cơ chế đó, và hai bản của một `revokeObjectURL` là
 * hai chỗ để quên nó.
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
  const object = usePhotoObjectUrl(photo.rentalId, photo.id);

  return (
    <li className="relative">
      <a
        href={object.state === "ready" ? object.url : undefined}
        target="_blank"
        rel="noreferrer"
        className={`block aspect-square overflow-hidden rounded-card border bg-canvas ${
          confirming ? "border-status-overdue" : "border-border"
        }`}
      >
        {object.state === "ready" ? (
          // `alt` mô tả VAI TRÒ của ảnh, không mô tả nội dung: không ai biết
          // trong ảnh có gì ngoài người đã chụp nó.
          <img
            src={object.url}
            alt={`${KIND_LABEL[photo.kind]} — chụp lúc ${PHOTO_TIME_FMT.format(new Date(photo.createdAt))}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-muted">
            {object.state === "failed" ? "Không tải được" : "Đang tải…"}
          </span>
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
        className="absolute top-1 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-card bg-canvas text-base text-status-overdue disabled:opacity-50"
      >
        {/* `trash` chứ không `close`: nút này XOÁ ảnh, không phải đóng gì cả.
            `✕` cũ nói sai việc nó làm. */}
        <Icon name="trash" />
      </button>
    </li>
  );
}

function KindSection({
  kind,
  openByDefault,
  photos,
  busy,
  confirming,
  onUpload,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  readonly kind: PhotoKind;
  /** Nhóm thuộc bước hiện tại thì mở sẵn — xem `openKinds` ở `HandoverPhotos`. */
  readonly openByDefault: boolean;
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
  /**
   * Khởi tạo từ `openByDefault` rồi TỰ SỞ HỮU: sau khi người dùng tự mở hay gập
   * một nhóm, một lần render lại (tải xong ảnh mới, đổi trạng thái đơn) không
   * được phép giật nó về trạng thái mặc định giữa lúc họ đang nhìn.
   */
  const [open, setOpen] = useState(openByDefault);
  const mine = photos.filter((p) => p.kind === kind);
  // Khối hỏi nằm trong nhóm CHỨA tấm ảnh đó, không phải ở đáy cả khu vực: câu
  // hỏi phải ở cạnh tấm nó đang hỏi, nếu không người dùng phải cuộn để đối chiếu
  // "tấm nào đang viền đỏ" với "câu hỏi nói tấm nào".
  const confirmingMine = confirming?.kind === kind ? confirming : null;

  return (
    /*
     * `<details>` giữ NGỮ NGHĨA (bàn phím, trình đọc màn hình, `open`), nhưng
     * phần thân được render CÓ ĐIỀU KIỆN thay vì để trình duyệt tự ẩn.
     *
     * Không phải sở thích — đo được: với `open={false}`, nút "Thêm ảnh" bên
     * trong vẫn trả `height=44px`, `visibility=visible`, và `elementFromPoint`
     * vẫn trúng nó, nên `sheet-actions.mjs` tiếp tục đếm nó là hành động dưới
     * nếp gấp. Cơ chế ẩn nội dung gốc của `<details>` không ăn ở đây; đoán thêm
     * nguyên nhân là đổi một ẩn số lấy một ẩn số khác. Render có điều kiện thì
     * xác định: không có DOM thì không có chiều cao.
     */
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      {/* `min-h-11` cho vùng chạm 44px: `<summary>` mặc định chỉ cao bằng dòng
          chữ, và đây là thứ người dùng phải bấm để mở nhóm đã gập.
          `[&::-webkit-details-marker]:hidden` + mũi tên riêng: mũi tên mặc định
          của WebKit không theo được token màu nào của app. */}
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <Icon
          name="chevron-right"
          className="text-muted transition-transform duration-150 group-open:rotate-90"
        />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-ink">{KIND_LABEL[kind]}</span>
          <span className="block text-xs text-muted">
            {mine.length > 0 ? `${String(mine.length)} ảnh` : "chưa có ảnh"}
          </span>
        </span>
      </summary>

      {open && (
        <div className="flex flex-col gap-2 pt-1">
          <p className="m-0 text-xs text-muted">{KIND_HINT[kind]}</p>

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
                {PHOTO_TIME_FMT.format(new Date(confirmingMine.createdAt))}? Ảnh bàn giao là bằng
                chứng khi có tranh chấp xước xát — xoá rồi không lấy lại được.
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button type="button" pending={busy} onClick={onConfirmDelete}>
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
            <Icon name="camera" />
            Thêm ảnh
          </Button>
        </div>
      )}
    </details>
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
export function HandoverPhotos({
  rentalId,
  status,
}: {
  readonly rentalId: string;
  /**
   * Trạng thái đơn — quyết định nhóm ảnh nào MỞ SẴN.
   *
   * Không suy được từ danh sách ảnh: một đơn `BOOKED` chưa có tấm nào và một đơn
   * `ONGOING` chưa có tấm nào có cùng danh sách rỗng nhưng nợ hai bước khác nhau.
   */
  readonly status: RentalStatus;
}) {
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

  /**
   * Nhóm nào mở sẵn: ĐÚNG MỘT nhóm — món nợ bằng chứng đầu tiên của đơn.
   *
   * Trước đợt 2026-09-04 cả ba nhóm đều mở, và hệ quả đo được (`sheet-actions.mjs`):
   * **3/7 hành động của sheet nằm dưới nếp gấp ở cả 390 lẫn 360px**, cả ba đều
   * là nút "Thêm ảnh" — trong đó nút của bước NHẬN LẠI XE nằm dưới cùng, mà
   * `PRODUCT.md` nguyên tắc #3 gọi ảnh bàn giao là bằng chứng bảo vệ cả hai phía.
   *
   * Một, không phải tất cả nhóm còn nợ: cùng nguyên tắc `EvidenceAxis` ở màn
   * Hiện trường — màn hình chỉ hỏi MỘT câu. Mở cả hai nhóm nợ của một đơn
   * `BOOKED` đo được 2/6 hành động vẫn dưới nếp gấp; mở một thì còn 1.
   *
   * Đơn đã đóng (`COMPLETED`/`CANCELLED`) không nợ gì, nên mở nhóm nào ĐÃ CÓ
   * ảnh: ở đó sheet là chỗ xem lại bằng chứng, không phải chỗ chụp thêm.
   *
   * `<details>` gốc chứ không state trong React: nó cho sẵn bàn phím, trình đọc
   * màn hình và trạng thái mở/đóng mà không cần một `useState` thứ tư trong
   * component này — và người dùng vẫn mở được nhóm đã gập bất cứ lúc nào, nên
   * đây là THU GỌN chứ không phải giấu đi.
   */
  const have = photos.map((p) => p.kind);
  const next = nextEvidence(status, have);
  const openKinds: readonly PhotoKind[] =
    next === null ? PHOTO_KINDS.filter((k) => have.includes(k)) : [next];

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
          openByDefault={openKinds.includes(kind)}
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
