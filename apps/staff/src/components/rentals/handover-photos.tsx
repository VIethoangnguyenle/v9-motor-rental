import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  onDelete,
  busy,
}: {
  readonly photo: RentalPhotoRow;
  readonly onDelete: () => void;
  readonly busy: boolean;
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
        className="block aspect-square overflow-hidden rounded-card border border-border bg-canvas"
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
            alt={`${KIND_LABEL[photo.kind]} — chụp lúc ${new Date(photo.createdAt).toLocaleString("vi-VN")}`}
            className="h-full w-full object-cover"
          />
        )}
      </a>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label={`Xoá ảnh ${KIND_LABEL[photo.kind]}`}
        className="absolute top-1 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-card bg-canvas/90 text-sm text-status-overdue disabled:opacity-50"
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
  onUpload,
  onDelete,
}: {
  readonly kind: PhotoKind;
  readonly photos: readonly RentalPhotoRow[];
  readonly busy: boolean;
  readonly onUpload: (kind: PhotoKind, file: File) => void;
  readonly onDelete: (photoId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mine = photos.filter((p) => p.kind === kind);

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="m-0 text-sm font-semibold text-ink">{KIND_LABEL[kind]}</h3>
        <p className="m-0 text-xs text-muted">{KIND_HINT[kind]}</p>
      </div>

      {mine.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
          {mine.map((p) => (
            <PhotoThumb key={p.id} photo={p} busy={busy} onDelete={() => onDelete(p.id)} />
          ))}
        </ul>
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-photos", rentalId] }),
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
          onUpload={(k, file) => upload.mutate({ kind: k, file })}
          onDelete={(photoId) => remove.mutate(photoId)}
        />
      ))}
    </div>
  );
}
