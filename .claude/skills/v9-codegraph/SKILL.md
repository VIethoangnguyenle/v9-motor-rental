---
name: v9-codegraph
description: Cách dùng CodeGraph và Serena trong v9-rental — bảng kê tool, cách đặt câu hỏi, bốn probe sau mỗi lần nâng version, và những chỗ output của chúng nói dối. Dùng khi cần tra cứu cú pháp tool, khi codegraph explore trả kết quả đáng ngờ, hoặc sau `codegraph upgrade`.
---

# CodeGraph và Serena — tra cứu

Quy trình bắt buộc (bốn bước, ai cũng phải theo) nằm ở [`CLAUDE.md`](../../CLAUDE.md), mục
"Quy trình chạm code". File này là **tra cứu**: cú pháp, bảng kê tool, và những chỗ output nói dối.

## Hai đường gọi CodeGraph, cùng một output

| Đường                               | Khi nào                               |
| ----------------------------------- | ------------------------------------- |
| MCP `codegraph_explore`             | mặc định, khi tool có mặt trong phiên |
| CLI `codegraph explore "<câu hỏi>"` | khi MCP chưa được duyệt trên máy này  |

MCP khai trong `.mcp.json` là **project scope** nên máy mới phải duyệt một lần. Chưa duyệt thì tool
không tồn tại trong phiên — và **đường CLI vẫn chạy**. Không duyệt được cũng không phải cớ để quay
lại grep.

### Ba dạng câu hỏi

- **Câu hỏi tiếng người** — `làm sao một request tới được database?`
- **Túi tên symbol/file** — `listCustomers customer-table rentalChipClass`
- **Hai đầu một luồng** — `CustomersListPage listCustomers` trả về call path giữa chúng

Nêu tên file hoặc symbol trong câu hỏi để nhận source đánh số dòng của chính nó.

## Bảng kê tool Serena

| Tool                                           | Dùng để                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `find_symbol`                                  | tìm symbol theo tên                                                   |
| `find_declaration`                             | nhảy từ chỗ dùng về định nghĩa                                        |
| `find_referencing_symbols`                     | liệt kê mọi nơi tham chiếu — **bắt buộc** trước khi đổi tên/signature |
| `find_implementations`                         | tìm bản cài đặt của một interface                                     |
| `replace_symbol_body`                          | viết lại thân một symbol                                              |
| `insert_after_symbol` / `insert_before_symbol` | chèn code cạnh một symbol                                             |
| `rename_symbol`                                | đổi tên xuyên codebase                                                |
| `get_symbols_overview`                         | xem nhanh cấu trúc một file                                           |

Sửa theo **symbol**, không theo số dòng: số dòng trôi sau mỗi lần sửa, symbol thì không.

## ⚠️ Chỗ output nói dối — đo lại 2026-08-31 trên v1.6.0

Hai trong ba lỗi cũ **đã hết**. Đừng chép lại cảnh báo cũ từ trí nhớ.

| Điều                            | v1.5.0                                            | v1.6.0 (đo lại)                                                         |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `explore` với tên không tồn tại | trả symbol không liên quan một cách tự tin        | ✅ `No relevant code found`                                             |
| Cờ test                         | `⚠️ no covering tests found` (heuristic tên file) | ✅ `no tests found within 3 caller hops` — reachability theo caller hop |

**Hai điều còn nguyên:**

- **"Trong 3 hop" ≠ "không có test".** Đọc đúng chữ.
- **Cạnh gọi hàm có thể sai khi trùng tên.** Cặp `rentals` route-vs-bảng đã kiểm là đúng, nhưng một
  cặp sạch không chứng minh được cả lớp.
- **Index cũ không cảnh báo gì.** Watcher chỉ sống khi daemon/MCP chạy, nên dùng CLI trần thì
  `codegraph sync -q` trước.

## Bốn probe sau mỗi `codegraph upgrade`

Luật "hàng rào phải được probe" áp cho cả tool đọc code, không riêng linter.

```bash
codegraph index -f                                     # rebuild, đừng tin index cũ
codegraph query ZzzNotARealSymbol                      # phải: "No results found"
codegraph explore ZzzNotARealSymbol                    # phải: "No relevant code found"
codegraph explore "createRental transaction boundary"  # blast radius phải khớp grep
```

Probe thứ tư **chỉ có giá trị nếu bạn đối chiếu** caller nó liệt kê với `grep` thật. Nó chạy xong và
in ra một bảng đẹp **không chứng minh điều gì**.

## `.claude/CLAUDE.md`

Do `codegraph install --refresh` sinh ra giữa cặp marker `CODEGRAPH_*`, bị ghi đè mỗi lần nâng
version. Nó **phải được commit — đừng đẩy vào `.gitignore`**: có track thì lần ghi đè sau hiện ra
thành diff review được, còn ignore thì nó mọc lại thành file untracked sau **mỗi** lần upgrade,
mãi mãi. Đừng sửa tay phần giữa marker.
