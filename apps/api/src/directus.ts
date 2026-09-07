import { env } from "./env";

/**
 * ĐÂY LÀ CHỖ DUY NHẤT trong `apps/api` biết Directus tồn tại — khuôn `db.ts` và
 * `storage.ts`.
 *
 * Vì sao ảnh xe phải đi vòng qua đây thay vì ghi thẳng MinIO như ảnh bàn giao:
 *
 *  1. `apps/web` phục vụ ảnh xe qua `${DIRECTUS_URL}/assets/<fileId>?key=web`
 *     (`apps/web/lib/directus.ts`). Một file không có hàng trong `directus_files`
 *     là một ảnh vỡ trên trang công khai — không lỗi, không cảnh báo.
 *  2. Preset biến đổi `key=web` sống trong settings của Directus. Bỏ qua Directus
 *     là bỏ luôn preset đó, và `/assets` công khai chỉ chấp nhận preset đã khai.
 *  3. Khoá `API_S3_KEY` CỐ Ý chỉ mở bucket `checkins`; đã đo là `Access Denied`
 *     trên `vehicles` (xem `storage.ts`). Nên đường ghi thẳng không tồn tại, và
 *     "nới policy MinIO cho nhanh" là tháo đúng hàng rào `docs/DEBT.md` vừa dựng.
 *
 * Token là tài khoản máy `apps-api@example.com`, role `api`, policy `api-files`
 * — bốn hành động trên `directus_files` và không gì khác. Dựng bởi
 * `scripts/directus-setup.ts` bước 5b, chạy lại vô hại.
 */

export type DirectusResult<T> = { ok: true; value: T } | { ok: false; reason: "DIRECTUS_FAILED" };

const base = env.directus.url;
const auth = { Authorization: `Bearer ${env.directus.token}` };

/**
 * Đẩy một file lên Directus, trả `file_id` để ghi vào `vehicle_photos.file_id`.
 *
 * ⚠️ KHÔNG dùng `fetch` với `Content-Type` tự đặt: `FormData` phải tự sinh
 * boundary, và đặt tay header đó làm Directus không tách được phần nào là file.
 *
 * `title` đặt được vì Directus đọc các field thường ĐỨNG TRƯỚC field file trong
 * form. Thứ tự `append` bên dưới vì thế là một phần của hợp đồng, không phải
 * chuyện thẩm mỹ.
 */
export async function uploadFile(input: {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  title: string;
}): Promise<DirectusResult<string>> {
  const form = new FormData();
  form.append("title", input.title);
  form.append("file", new Blob([input.bytes], { type: input.contentType }), input.filename);

  const res = await fetch(`${base}/files`, { method: "POST", headers: auth, body: form });
  if (!res.ok) {
    // Log ĐỦ để chẩn đoán mà KHÔNG log token: thân lỗi của Directus không chứa
    // nó, còn `auth` thì không đi vào câu này.
    console.warn(`[directus] upload hỏng HTTP ${String(res.status)}: ${await res.text()}`);
    return { ok: false, reason: "DIRECTUS_FAILED" };
  }

  const body = (await res.json()) as { data?: { id?: string } };
  const id = body.data?.id;
  if (typeof id !== "string") {
    console.warn("[directus] upload trả 2xx nhưng không có data.id");
    return { ok: false, reason: "DIRECTUS_FAILED" };
  }
  return { ok: true, value: id };
}

/**
 * Xoá file khỏi Directus.
 *
 * `404` tính là THÀNH CÔNG: file đã không còn thì kết quả mong muốn đã đạt, và
 * trả lỗi ở đây sẽ chặn việc xoá hàng `vehicle_photos` trỏ tới một file ma —
 * tức để lại đúng thứ rác mà thao tác xoá sinh ra để dọn.
 */
export async function deleteFile(fileId: string): Promise<DirectusResult<null>> {
  const res = await fetch(`${base}/files/${fileId}`, { method: "DELETE", headers: auth });
  if (res.ok || res.status === 404) return { ok: true, value: null };

  console.warn(`[directus] xoá file hỏng HTTP ${String(res.status)}: ${await res.text()}`);
  return { ok: false, reason: "DIRECTUS_FAILED" };
}
