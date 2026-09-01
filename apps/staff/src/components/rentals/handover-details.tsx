import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/errors";
import { updateHandover } from "../../lib/photos";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { TextField } from "../ui/text-field";

type DocumentType = "CCCD" | "PASSPORT";

const DOC_LABEL: Record<DocumentType, string> = {
  CCCD: "CCCD",
  PASSPORT: "Hộ chiếu",
};

/**
 * Giấy tờ shop đang giữ và địa chỉ giao xe — ba cột migration `0012` mở sẵn và
 * để trống suốt từ đó, kèm ghi chú "chưa có ai ghi vào cho tới khi luồng bàn
 * giao được dựng". Đây là chỗ ghi.
 *
 * Cả hai thuộc LƯỢT THUÊ chứ không thuộc khách, và migration nói rõ vì sao:
 * giấy tờ được giữ cho một đơn rồi trả lại, còn khách du lịch đổi chỗ ở mỗi
 * chuyến nên một địa chỉ mặc định trên `customers` sẽ nói dối.
 *
 * ⚠️ KHÔNG có ô nhập số giấy tờ, và đó là quyết định đã ghi ở `0012`: câu hỏi
 * vận hành duy nhất thật sự cần là "đơn này shop còn giữ giấy gì", trả lời được
 * nó không cần lưu số CCCD của mọi khách từng thuê vào Postgres lẫn mọi bản
 * backup. Bằng chứng đối chiếu là ẢNH — xem `HandoverPhotos`. Đừng thêm ô đó.
 */
export function HandoverDetails({
  rentalId,
  documentType,
  documentReturnedAt,
  deliveryAddress,
}: {
  readonly rentalId: string;
  readonly documentType: string | null;
  readonly documentReturnedAt: Date | null;
  readonly deliveryAddress: string | null;
}) {
  const qc = useQueryClient();
  const [docType, setDocType] = useState(documentType ?? "");
  const [address, setAddress] = useState(deliveryAddress ?? "");
  const returned = documentReturnedAt !== null;

  const save = useMutation({
    mutationFn: async (input: Parameters<typeof updateHandover>[1]) => {
      const r = await updateHandover(rentalId, input);
      if (!r.ok) throw new Error(errorMessage(r.value, "Không lưu được thông tin bàn giao"));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rentals"] });
    },
  });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="m-0 text-sm font-semibold text-ink">Giấy tờ và giao xe</h3>

      {save.error && <Alert tone="error">{save.error.message}</Alert>}

      <Select
        label="Giấy tờ đang giữ"
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
      >
        <option value="">— Chưa giữ giấy tờ —</option>
        {(Object.keys(DOC_LABEL) as DocumentType[]).map((d) => (
          <option key={d} value={d}>
            {DOC_LABEL[d]}
          </option>
        ))}
      </Select>

      <TextField
        label="Địa chỉ giao xe"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="vd. Khách sạn Rex, 141 Nguyễn Huệ, Q1"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              documentType: docType === "" ? null : (docType as DocumentType),
              deliveryAddress: address.trim() === "" ? null : address.trim(),
            })
          }
        >
          {save.isPending ? "Đang lưu…" : "Lưu"}
        </Button>

        {/*
         * Nút trả giấy tờ chỉ hiện khi ĐÃ ghi loại giấy — CHECK
         * `rentals_document_return_needs_type` ở DB từ chối trạng thái "đã trả"
         * mà không biết trả cái gì, nên hiện nút ở đây là mời người dùng đi vào
         * một lỗi 409. Ẩn nó là cách rẻ nhất để hai tầng nói cùng một luật.
         */}
        {documentType !== null && !returned && (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate({ documentReturned: true })}
          >
            Đã trả giấy tờ cho khách
          </Button>
        )}
      </div>

      {returned && documentReturnedAt !== null && (
        <p className="m-0 text-xs text-muted">
          Đã trả giấy tờ lúc {documentReturnedAt.toLocaleString("vi-VN")}.
        </p>
      )}
    </div>
  );
}
