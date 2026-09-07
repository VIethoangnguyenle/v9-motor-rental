import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MAX_PHOTO_BYTES } from "@v9/shared/domain/rental-photo";
import { VEHICLE_MESSAGES, type PhotoAltRule } from "@v9/shared/domain/vehicle";
import { errorMessage } from "../../lib/errors";
import {
  deleteVehiclePhoto,
  uploadVehiclePhoto,
  type FleetVehicleDetail,
} from "../../lib/fleet-admin";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { TextField } from "../ui/text-field";

/**
 * Quản lý ảnh của một chiếc xe.
 *
 * ⚠️ Ảnh xe KHÁC ảnh bàn giao ở chỗ hiển thị, không chỉ ở chỗ lưu. Ảnh bàn giao
 * nằm sau `staffGuard` nên `handover-photos.tsx` phải tải byte về thành `blob:`
 * (thẻ `<img>` không mang cookie cross-site). Ảnh xe thì CÔNG KHAI — Directus
 * phục vụ chúng qua `/assets/<fileId>?key=web` cho cả khách trên `apps/web` —
 * nên ở đây gắn thẳng URL vào `<img src>` là ĐÚNG, và dựng lại cơ chế `blob:`
 * sẽ là một vòng mạng thừa cùng một chỗ rò bộ nhớ để canh.
 *
 * `?key=web` KHÔNG được bỏ: `/assets` chỉ chấp nhận preset đã khai
 * (`storage_asset_transform: "presets"`), nên thiếu nó là 403.
 */

const directusUrl = (import.meta.env["VITE_DIRECTUS_URL"] ?? "http://localhost:8055").replace(
  /\/+$/,
  "",
);

const assetUrl = (fileId: string) => `${directusUrl}/assets/${fileId}?key=web`;

const MAX_MB = Math.floor(MAX_PHOTO_BYTES / 1024 / 1024);

const isAltRule = (r: string): r is PhotoAltRule => r === "ALT_EMPTY" || r === "ALT_IS_FILENAME";

export function VehiclePhotos({ vehicle }: { readonly vehicle: FleetVehicleDetail }) {
  const qc = useQueryClient();
  const [alt, setAlt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  /** Ảnh đang chờ xác nhận xoá — giữ CẢ dòng, cùng lý lẽ `handover-photos.tsx`. */
  const [confirming, setConfirming] = useState<FleetVehicleDetail["photos"][number] | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["fleet-detail", vehicle.id] });

  const upload = useMutation({
    mutationFn: async () => {
      if (file === null) throw new Error("Chưa chọn ảnh");
      // Kiểm ở client để nói ngay, không bắt chủ shop chờ tải xong 12 MB rồi mới
      // bị từ chối. Hàng rào thật vẫn ở `t.File` của Elysia và ở domain.
      if (file.size > MAX_PHOTO_BYTES) {
        throw new Error(
          `Ảnh lớn hơn ${String(MAX_MB)} MB, chụp lại ở chế độ thường giúp shop nhé.`,
        );
      }
      const r = await uploadVehiclePhoto(vehicle.id, alt, file);
      if (!r.ok) {
        // Câu của domain khi lỗi là luật `alt`; câu của server cho mọi ca khác.
        // Thu hẹp bằng một type guard, KHÔNG bằng `as`: `rules` tới từ mạng dưới
        // dạng `string[]`, nên khẳng định nó là một union cụ thể là khẳng định
        // về dữ liệu ta không kiểm soát.
        const altRule = r.rules.find(isAltRule);
        throw new Error(
          altRule === undefined
            ? errorMessage(r.value, "Không thêm được ảnh")
            : VEHICLE_MESSAGES[altRule],
        );
      }
    },
    onSuccess: async () => {
      setAlt("");
      setFile(null);
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async (photoId: string) => {
      const r = await deleteVehiclePhoto(vehicle.id, photoId);
      if (!r.ok) throw new Error(errorMessage(r.value, "Không xoá được ảnh"));
    },
    onSuccess: async () => {
      // Đóng câu hỏi CHỈ khi xoá xong thật — hỏng thì giữ nguyên để bấm lại được
      // mà không phải mở lại từ đầu. Cùng khuôn `handover-photos.tsx`.
      setConfirming(null);
      await refresh();
    },
  });

  const busy = upload.isPending || remove.isPending;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="m-0 text-sm font-semibold text-ink">Ảnh xe</h3>

      {upload.error && <Alert tone="error">{upload.error.message}</Alert>}
      {remove.error && <Alert tone="error">{remove.error.message}</Alert>}

      {vehicle.photos.length === 0 ? (
        // Câu này nói HỆ QUẢ, không nói trạng thái: "chưa có ảnh" thì ai cũng
        // thấy, còn việc lưới xe trên trang khách sẽ hiện ô trống thì không.
        <p className="m-0 text-sm text-muted">
          Chưa có ảnh nào. Trên trang khách, xe này hiện ra là một ô trống.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {vehicle.photos.map((p) => (
            <li key={p.id} className="flex flex-col gap-1">
              <img
                src={assetUrl(p.fileId)}
                alt={p.alt}
                loading="lazy"
                className="aspect-[16/10] w-full rounded-card border border-border object-cover"
              />
              <p className="m-0 line-clamp-2 text-xs text-muted">{p.alt}</p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConfirming(p);
                }}
              >
                Xoá
              </Button>
            </li>
          ))}
        </ul>
      )}

      {confirming !== null && (
        <div className="flex flex-col gap-2 rounded-card border border-border p-3">
          {/* Câu hỏi mang theo MÔ TẢ của đúng tấm ảnh, để tự kiểm được — cùng lý
              do `handover-photos.tsx` giữ cả dòng thay vì chỉ `id`. */}
          <p className="m-0 text-sm text-ink">Xoá ảnh “{confirming.alt}”? Không lấy lại được.</p>
          <div className="flex gap-2">
            <Button
              type="button"
              pending={remove.isPending}
              onClick={() => {
                remove.mutate(confirming.id);
              }}
            >
              Xoá ảnh
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirming(null);
              }}
            >
              Thôi
            </Button>
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-2 rounded-card border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          upload.mutate();
        }}
      >
        <TextField
          label="Mô tả ảnh"
          value={alt}
          onChange={(e) => {
            setAlt(e.target.value);
          }}
          placeholder="Honda CB500X 471cc màu đỏ, nhìn nghiêng bên phải"
        />
        {/*
          Không `capture="environment"`: đây là việc ở bàn làm việc, chọn từ thư
          viện ảnh. Màn Hiện trường mới là chỗ camera mở thẳng.

          `accept` CÓ `image/webp`. Bản đầu của file này bỏ nó đi vì tin một
          comment ở `routes/staff.ts` nói Bun đoán kiểu từ byte và không biết
          WebP. Comment đó SAI, và `docs/DEBT.md` đã ghi rõ là sai: kiểu suy từ
          ĐUÔI TÊN FILE. File chọn qua `<input type="file">` luôn có tên thật kèm
          đuôi, nên WebP đi qua bình thường — đo lại 2026-09-07 qua chính route
          ảnh xe: `.webp` → 201, cùng byte đó bỏ đuôi → 422.
        */}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="min-h-11 text-sm text-ink"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
          }}
        />
        <Button type="submit" pending={upload.isPending} disabled={busy && !upload.isPending}>
          Thêm ảnh
        </Button>
      </form>
    </section>
  );
}
