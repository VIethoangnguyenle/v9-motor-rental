# Tài liệu nằm ở đâu — và ADR nằm ở Serena

Quyết định 2026-09-01. Trước đó mọi thứ dồn vào `CLAUDE.md` (~360 dòng) nạp lại mỗi phiên.

| Loại | Ở đâu | Nạp thế nào |
| --- | --- | --- |
| **Quy trình làm việc** (CodeGraph → Serena → sửa → ghi) | `CLAUDE.md` (83 dòng) | mỗi phiên, tự động |
| **Kiến trúc, ràng buộc version, perf budget, bẫy Postgres** | `docs/ARCHITECTURE.md` | theo việc |
| **Tra cứu theo chủ đề** | `.claude/skills/v9-*` | theo việc |
| **Quyết định kiến trúc (ADR) + lý do** | **Serena memory** ← file này | qua `read_memory` |
| Nợ đã biết | `docs/DEBT.md` | |
| Design doc của từng đợt | `docs/plans/` | |

**Vì sao tách:** `CLAUDE.md` nạp lại mỗi phiên nên độ dài của nó là chi phí lặp. Thứ chỉ cần khi
làm một việc cụ thể không thuộc về đó.

**Vì sao ADR ở Serena chứ không phải markdown:** ADR được tra khi cần, không phải đọc tuần tự.
`write_memory`/`read_memory` cho phép nạp đúng quyết định liên quan thay vì cả file.

**Nhưng LUẬT và LỆNH thì KHÔNG được xuống memory.** Phân vai cứng: *memory giữ QUYẾT ĐỊNH và LÝ DO;
file được track giữ LUẬT và LỆNH.* Đưa một hàng rào (probe, boundary, lệnh bắt buộc chạy) vào memory
là biến ràng buộc repo-ép thành cấu hình local — đúng cái bẫy dự án đã dính bốn lần, xem
`mem:process/verification-traps`.

Lập luận này lần đầu được viết ra (2026-08-12, hồi ADR còn nằm ở agentmemory) để **cấm** chuyển luật
sang memory, với lý do "memory sống ở `~/.claude/projects/…` nên không đi theo `git clone`". ⚠️ Vế
lý do đó **không áp cho Serena**: đã kiểm 2026-09-01, `.serena/memories/**` **được git track** (chỉ
`.serena/cache/` bị ignore), nên memory ở đây **có** đi theo clone. Vế kết luận thì vẫn giữ, vì lý do
khác: không cơ chế nào *ép* ai đọc một memory, y như không linter nào kiểm được "đã hỏi CodeGraph
chưa".

## ⚠️ Bẫy đã gặp khi tách (2026-09-01)

Tách `CLAUDE.md` → `docs/ARCHITECTURE.md` làm **gãy 12 tham chiếu**: năm file workspace mở đầu bằng
"Luật chung của repo ở `../../CLAUDE.md`", cộng bảy chỗ trỏ vào mục cụ thể — **ba trong số đó nằm
trong comment code** (`apps/staff/src/lib/auth.ts`, `router.tsx`), không phải trong tài liệu.

Lần sau tách file tài liệu: `grep -rn "CLAUDE.md" apps packages` **trước khi** tách, gồm cả `.ts`.

## Mỗi workspace có `CLAUDE.md` riêng — và nó THẮNG root

`apps/api` (388 dòng) · `apps/staff` (197) · `apps/web/AGENTS.md` (167, `CLAUDE.md` chỉ là con trỏ
`@AGENTS.md` do Next sinh) · `packages/db` (168) · `packages/shared` (57).

Claude Code **tự nạp** file của workspace khi làm việc trong thư mục đó, và luật ưu tiên cũ ghi
rằng workspace **thắng** root khi hai bên nói cùng một chuyện. Nghĩa là override là hành vi được
thiết kế. Đã rà: không file nào hiện mâu thuẫn quy trình MCP mới.

~~**Đã biết là lỗi thời:** `packages/db/CLAUDE.md` bảng migration dừng ở `0008`.~~ **Đã sửa
2026-09-01** — nội dung nay ở skill `v9-db`, bảng migration đủ `0009`–`0012`, mỗi dòng đối chiếu
với SQL thật. Câu `customers`/`rentals` "chưa có" thì commit tách đã bỏ sẵn, không phải sửa.
