# Tìm kiếm bỏ dấu, và ba bẫy Postgres đã đo

## Tìm khách không phân biệt hoa/thường và dấu — migration `0012`

Trước đó `LIKE '%term%'` trên text thô: gõ `nguyen` không ra `Nguyễn`, và màn hình trả câu rất tự
tin *"Không tìm thấy khách hàng nào khớp."* — một **câu trả lời SAI**, không phải thông báo lỗi.

```sql
CREATE EXTENSION unaccent; CREATE EXTENSION pg_trgm;
CREATE FUNCTION public.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
CREATE INDEX customers_full_name_search_idx
  ON customers USING gin (f_unaccent(lower(full_name)) gin_trgm_ops);
```

### Ba điều phải biết, đã đo chứ không suy

1. **`unaccent()` là `STABLE`, không `IMMUTABLE`** — cả hai overload đều `provolatile='s'` trên
   PG 17. Nên `f_unaccent` là một **khẳng định**, chỉ là khẳng định đã được cộng đồng kiểm chứng.
   Ghim `regdictionary` mua được độc lập khỏi `search_path`, **không** mua được tính bất biến thật.
   ⚠️ Đổi rules của dictionary ⇒ index GIN sai **im lặng** cho tới khi `REINDEX`. Đo được bằng
   `ALTER TEXT SEARCH DICTIONARY ... (RULES=...)` trong transaction: một query, hai câu trả lời
   (index 0 hàng / seqscan 1 hàng). **Chỉ sai âm, không bao giờ sai dương** — `Recheck Cond` của
   Bitmap Heap Scan tính lại từ heap.
2. **btree KHÔNG phục vụ `LIKE '%term%'`** (wildcard đầu). Chép mẫu expression-btree của `0011`
   sang đây sẽ tạo một index **không bao giờ được dùng**.
3. **`gin_trgm_ops` cần ít nhất một trigram đầy đủ** — từ khoá 1–2 ký tự rơi về seq scan. Cố ý
   **không** chặn tìm kiếm ngắn: im lặng không trả gì tệ hơn một lần quét rẻ.

**Biểu thức trong WHERE phải khớp CHÍNH XÁC biểu thức index**, nếu không planner bỏ qua và không
báo gì. Helper `fullNameMatches()` (`apps/api/src/services/customers.ts`) là nơi duy nhất viết nó,
dùng cho **cả** `searchCustomers` lẫn `listCustomers`.

**`CREATE EXTENSION` KHÔNG cần superuser**: `unaccent` và `pg_trgm` đều `trusted = t` trên PG 17.
Đã chứng minh bằng chạy cả chuỗi `0000 → 0012` trên một database trắng.

## `db:custom` ghi snapshot là BẢN SAO của snapshot trước

Nên cột viết tay **vô hình** với chuỗi snapshot, và lần `db:generate` kế tiếp của bất kỳ ai sẽ sinh
migration `ADD COLUMN` cho cột đã tồn tại.

**Cách đúng cho migration hỗn hợp:** chạy `db:generate` **trước** cho phần drizzle-kit làm được (để
có snapshot trung thực), rồi **mở rộng tay** file đó với `CREATE EXTENSION`/`CREATE FUNCTION`/GIN
index. `0012` là file đầu tiên theo khuôn này. (`0011` thì làm ngược: `db:custom` + sửa tay JSON
snapshot — cũng đi được, nhưng dễ sai hơn.)

## SQLSTATE nằm ở `.errno`, KHÔNG phải `.code`

Chi tiết đầy đủ + bảng đo hai tầng (Bun.SQL trần vs qua Drizzle, nơi lỗi thật nằm ở `e.cause`):
`apps/api/CLAUDE.md`. `try/catch` phải bọc **cả lời gọi `tx.savepoint(...)`**, không bọc câu bên
trong — nuốt lỗi bên trong callback làm nó trông như thành công, rồi `RELEASE` một sub-transaction
đã abort ném `25P02` ngoài tầm bắt.
