import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { RentalStatus } from "@v9/shared/domain/rental";
import { missingEvidence, nextEvidence } from "@v9/shared/domain/rental-evidence";
import { MAX_PHOTO_BYTES, PHOTO_KINDS, type PhotoKind } from "@v9/shared/domain/rental-photo";
import { usePhotoObjectUrl } from "../../hooks/use-photo-object-url";
import { errorMessage } from "../../lib/errors";
import { KIND_HINT, KIND_LABEL, KIND_LABEL_SHORT, PHOTO_TIME_FMT } from "../../lib/photo-labels";
import { rentalPhotosQuery, uploadRentalPhoto, type RentalPhotoRow } from "../../lib/photos";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";

/**
 * Ba trạm bằng chứng của một đơn, xâu trên **một trục dọc duy nhất**.
 *
 * Khác `HandoverPhotos` (sheet chi tiết) ở thứ nó trả lời, không chỉ ở cách bày:
 * ở đó ba khu vực ngang hàng nhau và người đọc phải tự so để biết còn thiếu gì;
 * ở đây trục sắp chúng theo THỜI GIAN của một lần bàn giao, và đúng một trạm —
 * trạm đang nợ — mang hành động. Nhân viên đứng cạnh xe, một tay, ngoài nắng:
 * màn hình chỉ được hỏi MỘT câu.
 *
 * Mỗi tấm ảnh ghim vào đúng trạm của nó và mang mốc giờ ngay dưới, không tấm nào
 * trôi tự do — đó là điều kiện để nó còn dùng được lúc có tranh chấp, vốn là lý
 * do `PRODUCT.md` (nguyên tắc #3) bắt lưu ảnh ngay từ đầu.
 *
 * ⚠️ Trạm nợ KHÔNG khoá gì cả. `missingEvidence` là hướng dẫn chứ không phải
 * hàng rào (xem JSDoc của nó): sản phẩm chưa bao giờ nói thiếu ảnh thì cấm giao
 * xe, và màn hình này không được phép tự dựng ra luật đó. Nút đổi trạng thái
 * nằm ở phía gọi và luôn bấm được.
 */
export function EvidenceAxis({
  rentalId,
  status,
}: {
  readonly rentalId: string;
  readonly status: RentalStatus;
}) {
  const qc = useQueryClient();
  const list = useQuery(rentalPhotosQuery(rentalId));

  /**
   * Trạm vừa nhận một tấm ảnh TRONG PHIÊN này — dùng để đánh dấu tấm mới đáp
   * xuống (`@utility pinned`).
   *
   * State cục bộ chứ không suy từ dữ liệu: "vừa chụp xong" là một sự kiện của
   * phiên làm việc, không phải thuộc tính của tấm ảnh. Tải lại trang thì nó biến
   * mất, và đó là ĐÚNG — cùng lý lẽ `changeCount` ở `rental-detail-sheet.tsx`.
   *
   * Không có nó thì hiệu ứng sẽ chạy MỖI LẦN trục được dựng (mở một việc khác,
   * quay lại từ camera), tức nó thôi là phản hồi và thành trang trí.
   */
  const [justPinned, setJustPinned] = useState<PhotoKind | null>(null);

  const upload = useMutation({
    mutationFn: async ({ kind, file }: { kind: PhotoKind; file: File }) => {
      // Kiểm ở client để nói ngay, không bắt nhân viên ngoài đường chờ hết 12 MB
      // qua 4G rồi mới bị từ chối. Hàng rào thật vẫn ở API và ở CHECK của DB.
      if (file.size > MAX_PHOTO_BYTES) {
        throw new Error(
          `Ảnh lớn hơn ${String(Math.floor(MAX_PHOTO_BYTES / 1024 / 1024))} MB, chụp lại ở chế độ thường giúp shop nhé.`,
        );
      }
      const r = await uploadRentalPhoto(rentalId, kind, file);
      if (!r.ok) throw new Error(errorMessage(r.value, "Không tải được ảnh lên"));
    },
    onSuccess: (_data, { kind }) => {
      setJustPinned(kind);
      return qc.invalidateQueries({ queryKey: ["rental-photos", rentalId] });
    },
  });

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (list.data && !list.data.ok) {
    return (
      <Alert tone="error" live="polite">
        {errorMessage(list.data.value, "Không tải được ảnh của đơn này")}
      </Alert>
    );
  }

  const photos = list.data?.ok ? list.data.photos : [];
  const have = photos.map((p) => p.kind);
  const owed = missingEvidence(status, have);
  const next = nextEvidence(status, have);

  return (
    <div className="flex flex-col gap-3">
      {upload.error && <Alert tone="error">{upload.error.message}</Alert>}

      {/*
        `<ol>` chứ không `<div>`: ba trạm CÓ thứ tự, và thứ tự đó là thông tin —
        trình đọc màn hình phải nghe được "3 mục" và số thứ tự, đúng như mắt thấy
        qua trục dọc. Trục là `border-l` trên từng `<li>`, không phải một phần tử
        trang trí riêng: vẽ nó thành một `<div>` tuyệt đối thì nó không co theo
        nội dung, và ở 360px nội dung luôn cao hơn dự tính.
      */}
      {/*
        Không còn nợ gì. `nextEvidence` trả `null` và JSDoc của nó đặt ra nghĩa
        vụ này thành chữ: "ô đó phải đổi sang nói điều khác — không phải vẽ một
        ô rỗng". Không có dòng này thì màn hình im lặng đúng vào lúc người dùng
        cần biết đã ĐỦ để bấm nút không quay lại được ở dưới.

        `tone="info"` chứ không `"warning"`: đây là tin tốt, và bảng màu của
        `Alert` mang nghĩa chứ không mang trang trí.
      */}
      {next === null && (
        <Alert tone="info" live="polite">
          {status === "BOOKED"
            ? "Đã đủ bằng chứng để giao xe."
            : status === "ONGOING"
              ? "Đã đủ bằng chứng để nhận lại xe."
              : "Đơn đã đóng, không còn ảnh nào phải chụp."}
        </Alert>
      )}

      {/* `role="list"` đi kèm `list-none`: WebKit bỏ vai trò `list` khi
          `list-style: none`, nên VoiceOver thôi đọc "danh sách 3 mục" — mà đó
          đúng là thứ chú thích ngay dưới đây hứa. */}
      <ol role="list" className="m-0 flex list-none flex-col p-0">
        {PHOTO_KINDS.map((kind, i) => (
          <Station
            key={kind}
            kind={kind}
            isLast={i === PHOTO_KINDS.length - 1}
            photos={photos.filter((p) => p.kind === kind)}
            owed={owed.includes(kind)}
            isNext={next === kind}
            pending={upload.isPending}
            justPinned={justPinned === kind}
            onPick={(file) => upload.mutate({ kind, file })}
          />
        ))}
      </ol>

      {upload.isPending && (
        // `role="status"` qua `Alert`: nhân viên vừa bấm chụp xong đang nhìn màn
        // hình chờ, và đây là câu duy nhất nói cho họ biết máy đang làm gì.
        <Alert tone="info" live="polite">
          Đang tải ảnh lên…
        </Alert>
      )}
    </div>
  );
}

/**
 * Một trạm trên trục.
 *
 * Ba hình dạng, và chúng khác nhau ở MỨC ĐỘ chứ không ở kiểu: trạm đã đủ thu về
 * một dòng; trạm chưa tới lượt (`owed` false mà cũng chưa có ảnh) đứng im, xám;
 * trạm đang nợ nở ra và mang nút chụp cỡ lớn. Chỉ có tối đa MỘT trạm `isNext`.
 */
function Station({
  kind,
  isLast,
  photos,
  owed,
  isNext,
  justPinned,
  pending,
  onPick,
}: {
  readonly kind: PhotoKind;
  /** Trạm cuối vẽ đoạn kẻ đuôi của riêng nó — xem chú thích tại chỗ. */
  readonly isLast: boolean;
  readonly photos: readonly RentalPhotoRow[];
  readonly owed: boolean;
  readonly isNext: boolean;
  /** Trạm này vừa nhận ảnh trong phiên — tấm CUỐI của nó được đánh dấu. */
  readonly justPinned: boolean;
  readonly pending: boolean;
  readonly onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** Chụp được lúc này: đang nợ, hoặc đã có ảnh và người dùng muốn thêm tấm nữa. */
  const actionable = owed || photos.length > 0;

  return (
    <li
      className={`relative flex pl-4 ${isLast ? "" : "border-l border-border"}`}
    >
      {/*
        Chấm trạm NẰM TRÊN đường kẻ, không cạnh nó.

        `-translate-x-1/2` chứ không phải một lề âm tính tay: lề âm phải bằng
        nửa bề rộng chấm, nên đổi cỡ chấm là con số đó lặng lẽ sai. Dịch theo
        PHẦN TRĂM của chính phần tử thì đúng ở mọi cỡ — và nó cũng không phải
        arbitrary value cho thang cách, thứ `lib/spacing-fence.test.ts` cấm
        thẳng (một số lẻ cạnh thang đã khai là một thang thứ hai không ai biết).

        Trạm cuối bỏ `border-l` để đường kẻ không thò xuống một đoạn cụt dưới
        chấm cuối — nhưng bỏ hẳn thì nó dừng ở MÉP TRÊN của trạm cuối, hụt mất
        đoạn từ đó tới tâm chấm. Đoạn còn thiếu được vẽ riêng ngay dưới.
      */}
      {/*
        Đoạn kẻ của riêng trạm CUỐI, chạy từ mép trên tới qua tâm chấm.
        `h-3` (12px) so với tâm chấm ở 13px: đoạn kẻ kết thúc BÊN TRONG chấm
        (chấm phủ từ 8px tới 18px), nên mắt thấy một đường liền, và không có số
        lẻ nào phải giữ đúng khi cỡ chấm đổi.
      */}
      {isLast && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 h-3 w-px -translate-x-1/2 bg-border"
        />
      )}
      <span
        aria-hidden="true"
        // `transition-colors`: chấm đổi màu khi trạm chuyển từ "đang nợ" sang "đã
        // có" — một cú nhảy màu ngay dưới ngón tay vừa bấm đọc ra như lỗi vẽ,
        // còn một quãng chuyển ngắn đọc ra là hệ quả của việc vừa làm.
        className={`absolute left-0 top-2 h-2.5 w-2.5 -translate-x-1/2 rounded-full transition-colors duration-(--duration-quick) ease-standard ${
          isNext ? "bg-accent" : photos.length > 0 ? "bg-status-ongoing" : "bg-border-strong"
        }`}
      />

      <div className={`flex min-w-0 flex-1 flex-col gap-2 ${isNext ? "pb-5" : "pb-4"}`}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="m-0 text-sm font-semibold text-ink">{KIND_LABEL_SHORT[kind]}</h3>
          {/*
            Đếm ảnh dùng `tabular-nums`: con số này đổi ngay dưới ngón tay người
            dùng sau mỗi lần chụp, và chữ số tỉ lệ làm cả dòng nhích ngang mỗi
            lần 9 → 10. Cùng lý do critique màn Khách hàng ghi cho cột số.
          */}
          <span className="text-xs tabular-nums text-muted">
            {/*
              "chưa tới lượt" chứ không "không cần": trạm RETURN của một đơn còn
              BOOKED sẽ cần ảnh — chỉ là chưa, vì xe còn nằm trong shop. "Không
              cần" nói sai hẳn nghĩa, và nói sai theo hướng nguy hiểm nhất: nó
              mời người đọc bỏ qua một bằng chứng mà `PRODUCT.md` nguyên tắc #3
              coi là thứ bảo vệ cả hai phía.
            */}
            {photos.length > 0
              ? `${String(photos.length)} ảnh`
              : owed
                ? "chưa có"
                : "chưa tới lượt"}
          </span>
        </div>

        {isNext && <p className="m-0 text-sm text-ink-soft">{KIND_HINT[kind]}</p>}

        {photos.length > 0 && (
          <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0">
            {photos.map((photo, i) => (
              <PinnedThumb
                key={photo.id}
                photo={photo}
                // Tấm CUỐI: API trả ảnh cũ trước, nên tấm mới nhất đứng cuối.
                justPinned={justPinned && i === photos.length - 1}
              />
            ))}
          </ul>
        )}

        {/*
          `capture="environment"` mở thẳng camera sau trên điện thoại. Trên máy
          tính thuộc tính này bị bỏ qua, nên vẫn là chọn file bình thường — cùng
          cách `handover-photos.tsx` đã dùng, và cùng lý do: camera của hệ điều
          hành cho ảnh tốt hơn `getUserMedia` và không phải xin quyền riêng.

          Hệ quả phải thiết kế quanh, không phải phớt lờ: camera HĐH chiếm trọn
          màn hình rồi trả người dùng về đây. Nên trạm phải còn nguyên chỗ đứng
          lúc họ quay lại — đó là lý do trạm đang nợ mở sẵn và mọi trạm khác thu
          nhỏ, chứ không phải để cho đẹp.
        */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
            // Dọn để chụp lại ĐÚNG tấm vừa chọn cũng bắn `change`. Không dòng
            // này thì chụp lại lần hai cùng một file là im lặng không có gì xảy ra.
            e.target.value = "";
          }}
        />
        {/*
          Trạm CHƯA TỚI LƯỢT không có nút chụp, và đó là quyết định chứ không phải
          thiếu sót: không ai chụp được "tình trạng lúc nhận lại" của một chiếc xe
          còn đang nằm trong shop. Một nút bấm được cho việc chưa thể làm là lời
          mời tạo ra bằng chứng sai NGÀY — thứ đắt hơn hẳn việc thiếu nó, vì nó
          vẫn trông như bằng chứng lúc có tranh chấp.

          Trạm đã có ảnh thì giữ nút để chụp thêm, kể cả khi không còn nợ: bốn góc
          xe là bốn tấm, và món nợ đã trả từ tấm đầu tiên.
        */}
        {actionable && (
          <div>
            <Button
              type="button"
              variant={isNext ? "primary" : "ghost"}
              pending={pending}
              onClick={() => inputRef.current?.click()}
              // Trạm đang nợ ăn trọn bề ngang ở màn hẹp: nó là hành động chính của
              // cả màn hình, và một nút vừa-đủ-chữ giữa màn 360px thì không đọc ra
              // là "việc phải làm tiếp theo".
              className={isNext ? "w-full" : ""}
            >
              <Icon name="camera" />
              {photos.length > 0 ? "Chụp thêm" : `Chụp ${KIND_LABEL_SHORT[kind].toLowerCase()}`}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Ảnh đã ghim: hình vuông nhỏ, mốc giờ ngay dưới.
 *
 * Mốc giờ hiện thành CHỮ chứ không giấu trong `title=`: `apps/staff` là PWA chạy
 * trên điện thoại và ở đó không có hover — cùng cái bẫy `rental-status.ts` đã
 * ghi khi bỏ `title=` cho màu trạng thái. Giờ chụp là thứ nhân viên đọc to cho
 * khách nghe lúc đối chiếu, nên nó phải đọc được mà không cần chạm.
 */
function PinnedThumb({
  photo,
  justPinned,
}: {
  readonly photo: RentalPhotoRow;
  readonly justPinned: boolean;
}) {
  const object = usePhotoObjectUrl(photo.rentalId, photo.id);

  return (
    <li className={`flex shrink-0 flex-col gap-1 ${justPinned ? "pinned" : ""}`}>
      <a
        href={object.state === "ready" ? object.url : undefined}
        target="_blank"
        rel="noreferrer"
        className="block h-20 w-20 overflow-hidden rounded-card border border-border bg-canvas"
      >
        {object.state === "ready" ? (
          <img
            src={object.url}
            alt={`${KIND_LABEL[photo.kind]} — chụp lúc ${PHOTO_TIME_FMT.format(new Date(photo.createdAt))}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center px-1 text-center text-xs text-muted">
            {object.state === "failed" ? "Không tải được" : "Đang tải…"}
          </span>
        )}
      </a>
      <time
        dateTime={new Date(photo.createdAt).toISOString()}
        className="text-xs tabular-nums text-muted"
      >
        {PHOTO_TIME_FMT.format(new Date(photo.createdAt))}
      </time>
    </li>
  );
}
