import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { isAvatarSizeValid } from "@v9/shared/domain/avatar";
import { MAX_AVATAR_MB, deleteAvatar, shrinkAvatar, uploadAvatar } from "../../lib/avatar";
import { errorMessage } from "../../lib/errors";
import type { Me } from "../../lib/me";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/**
 * Hai nút đổi/xoá ảnh đại diện, và mọi thứ có thể hỏng khi bấm chúng.
 *
 * Tách khỏi `pages/settings-page.tsx` vì trang đó là chỗ LẮP các khối lại, còn
 * khối này mang hai mutation, một `ref` tới `<input type="file">` và bốn câu lỗi
 * khác nhau. Ảnh hiển thị thì vẫn do trang vẽ (`<Avatar src>` trong khối tài
 * khoản): nó thuộc về danh tính người dùng, không thuộc về hai cái nút.
 *
 * ⚠️ Ai bấm thì đổi ảnh của CHÍNH NGƯỜI ĐÓ — API chỉ có `/staff/me/avatar`,
 * không có đường đặt ảnh cho người khác. Đừng thêm prop `staffId` vào đây với ý
 * cho OWNER sửa ảnh nhân viên: phương án đó đã bị bác, và nó cần một route mới
 * cùng một luật phân quyền mới chứ không phải một prop.
 */
export function AvatarActions({ me }: { readonly me: Me }) {
  const qc = useQueryClient();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Câu báo THÀNH CÔNG. Cuộn tay đúng một state này, và chỉ state này: `pending`
   * với `error` đã có sẵn trong `useMutation` (quy ước của workspace, xem
   * `docs/workspaces/staff.md`) — nhưng "vừa xong việc gì" thì hai mutation
   * không tự trả lời được, vì cả hai cùng `isSuccess` sau khi tải rồi xoá, và
   * màn hình sẽ hiện hai câu cùng lúc.
   */
  const [done, setDone] = useState<string | null>(null);

  const refreshProfiles = async () => {
    // `["me"]` đổi `avatarVersion`, và ĐÓ mới là thứ làm ảnh mới hiện ra: URL
    // ảnh không đổi khi thay ảnh (xem `lib/avatar.ts`). `["staff-users"]` để
    // bảng nhân viên không giữ bản cũ tới lần tải trang sau.
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["me"] }),
      qc.invalidateQueries({ queryKey: ["staff-users"] }),
    ]);

    /**
     * ⚠️ `router.invalidate()` là BẮT BUỘC, không phải cho chắc — và nó phải chạy
     * SAU khi hai lời gọi trên đã settle.
     *
     * Thanh điều hướng lấy `me` từ **route context** chứ không từ TanStack Query
     * (`ProtectedShell` ở `router.tsx`, và đó là lựa chọn có lý lẽ ghi ngay tại
     * đó). Context được tính MỘT LẦN trong `beforeLoad`, nên vô hiệu hoá cache
     * của Query không đụng tới nó: đo 2026-09-02, đổi ảnh xong mà không có dòng
     * này thì khối TÀI KHOẢN hiện ảnh mới trong khi chân nav vẫn giữ ảnh cũ —
     * `document.querySelectorAll('aside a[href="/settings"] img').length` trả
     * `0` sau một lần tải lên thành công. Nó chỉ tự đúng lại khi người dùng
     * chuyển trang, tức triệu chứng biến mất đúng lúc ta đi kiểm nó.
     *
     * Thứ tự quan trọng: `invalidate()` chạy lại `beforeLoad`, mà `beforeLoad`
     * gọi `ensureMe` → `ensureQueryData`, thứ trả THẲNG dữ liệu đang có trong
     * cache. Chạy nó trước khi `invalidateQueries` kịp nạp lại thì context mới
     * được dựng từ chính bản cũ.
     */
    await router.invalidate();
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setDone(null);

      let blob: Blob;
      try {
        blob = await shrinkAvatar(file);
      } catch {
        // `createImageBitmap` ném ở đây khi file không giải mã được thành ảnh —
        // `accept="image/*"` KHÔNG chặn được ca này (người dùng đổi bộ lọc trong
        // hộp thoại chọn file, và `.heic` thì hệ điều hành vẫn khai là ảnh).
        // Nói ra danh sách định dạng thay vì "file không hợp lệ": người đang cầm
        // điện thoại cần biết chọn lại cái gì.
        throw new Error("Không đọc được file này thành ảnh. Chọn ảnh JPEG, PNG hoặc WebP.");
      }

      // Hàng rào của server (`MAX_AVATAR_BYTES`) vẫn là hàng rào thật; kiểm ở
      // đây chỉ để câu trả lời đọc được, thay vì một 422 validation không mang
      // `code` nào (xem `lib/errors.ts`). Sau khi hạ về 256×256 thì ca này gần
      // như không xảy ra — nó tồn tại cho trình duyệt không encode nổi WebP và
      // rơi về PNG (`toBlob` theo spec, xem `lib/avatar.ts`), vì PNG 256×256 của
      // một tấm ảnh chụp nặng hơn WebP nhiều lần.
      if (!isAvatarSizeValid(blob.size)) {
        throw new Error(`Ảnh sau khi thu nhỏ vẫn lớn hơn ${String(MAX_AVATAR_MB)} MB.`);
      }

      const r = await uploadAvatar(blob);
      if (!r.ok) throw new Error(errorMessage(r.value, "Không tải được ảnh lên"));
    },
    onSuccess: async () => {
      setDone("Đã cập nhật ảnh đại diện.");
      await refreshProfiles();
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      setDone(null);
      const r = await deleteAvatar();
      if (!r.ok) throw new Error(errorMessage(r.value, "Không xoá được ảnh"));
    },
    onSuccess: async () => {
      setDone("Đã xoá ảnh — quay lại chữ cái đầu tên.");
      await refreshProfiles();
    },
  });

  const busy = upload.isPending || remove.isPending;
  const error = (upload.error ?? remove.error)?.message;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {/*
         * Input ẩn, điều khiển bằng `<Button>`: `<input type="file">` gốc không
         * nhận style và cao chưa tới 44px — cùng lý do và cùng khuôn với
         * `components/rentals/handover-photos.tsx`.
         *
         * KHÔNG có `capture="environment"` như ảnh bàn giao: ảnh bàn giao chụp
         * tại chỗ nên mở thẳng camera là đúng, còn ảnh đại diện thì người ta gần
         * như luôn chọn một tấm đã có trong thư viện.
         */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            // Xoá giá trị để chọn LẠI CÙNG một file vẫn kích hoạt `change` —
            // không có dòng này thì thử lại đúng tấm vừa lỗi sẽ không gửi gì.
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          pending={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="camera" className="mr-1" />
          {upload.isPending ? "Đang tải ảnh lên…" : "Đổi ảnh"}
        </Button>

        {/* Chỉ hiện khi ĐANG có ảnh: một nút "Xoá ảnh" cạnh một ô chữ cái là nút
            không làm gì, và người dùng phải bấm mới biết. */}
        {me.avatarVersion !== null && (
          <Button
            type="button"
            variant="ghost"
            pending={busy}
            onClick={() => {
              remove.mutate();
            }}
          >
            <Icon name="trash" className="mr-1" />
            {remove.isPending ? "Đang xoá…" : "Xoá ảnh"}
          </Button>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {/* `info`, không `success`: `ui/alert.tsx` chỉ có ba tone, và câu này là
          một thông báo đã xong việc — nó không cạnh tranh chú ý với gì cả. */}
      {!error && done !== null && <Alert tone="info">{done}</Alert>}
    </div>
  );
}
