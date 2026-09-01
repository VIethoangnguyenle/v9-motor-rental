# CLAUDE.md

Quy trình làm việc cho repo này. **Áp cho mọi agent, kể cả subagent.**

Thông tin hệ thống, kiến trúc, ràng buộc phiên bản và perf budget **không** nằm ở đây — xem
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) và các skill `v9-*` trong `.claude/skills/`.

## MCP Tools (CodeGraph + Serena)

Two MCP servers are available: **CodeGraph** (code knowledge graph) and **Serena** (symbolic code
intelligence). Use them in sequence — never skip to filesystem tools unless both are exhausted.

### 1. Explore with CodeGraph

Use `codegraph_explore` as the primary tool for **any** codebase question. One call returns verbatim
source, call paths, and blast radius — no file reads needed.

**When to use it:**

- Understanding architecture ("how does X work?", "what is the flow from A to B?")
- Finding where things are ("where is X defined?", "what calls Y?")
- Assessing impact before editing ("what depends on Z?")
- Reading a file or symbol (treat its output as already-read)

**How to query:**

- Natural language questions work: `how does a request reach the database?`
- Bag of symbol/file names: `AuthService loginUser session-manager`
- Flow endpoints: `mutateElement renderScene` (returns call paths between them)

**Do NOT** use `Grep`, `Glob`, or `Read` for exploration that `codegraph_explore` can answer.

### 2. Edit with Serena

After CodeGraph identifies the affected area, use Serena for symbol-level navigation and surgery.

**Key tools:**

- `find_symbol` — locate symbols by name path across the codebase
- `find_referencing_symbols` — find everything that references a symbol (callers, usages)
- `find_declaration` — jump to a symbol's definition from a usage site
- `insert_after_symbol` / `insert_before_symbol` — add code relative to a class/method/function
- `replace_symbol_body` — rewrite a symbol's implementation
- `rename_symbol` — rename a symbol across the entire codebase
- `write_memory` — persist project knowledge for future sessions

**Workflow:**

1. `find_symbol` to locate the right symbol
2. `find_referencing_symbols` to understand usage context
3. Edit with `replace_symbol_body` or `insert_after_symbol`
4. `write_memory` to save key structural facts for later sessions

### Pipeline

```
codegraph_explore     →  discover affected areas & read source
       ↓
Serena tools          →  locate exact symbols, understand references
       ↓
Serena edit tools     →  perform refactors (rename, replace body, insert)
       ↓
write_memory          →  persist structural knowledge
```

### Rules

- **Never** read a file that `codegraph_explore` already returned source for.
- **Never** use `Grep` or `Glob` when `codegraph_explore` or `find_symbol` can answer the question.
- **Never** use `Read` to understand a symbol's context — use `codegraph_explore` (callers/callees/
  blast radius) or `find_referencing_symbols` instead.
- **Default to `codegraph_explore`** for every question about the codebase — it's one call that
  replaces a dozen file reads.
- If `codegraph_explore` reports the project isn't indexed (no `.codegraph/`), fall back to built-in
  tools gracefully.
- After editing, if the index is stale (CodeGraph shows a staleness warning), read affected files
  directly to confirm changes.

### Subagent

⚠️ **Subagent không đọc file này.** Ai giao việc cho subagent phải **chép quy trình trên vào đề
bài**, kèm nội dung skill của workspace liên quan. Không chép thì subagent sẽ đi thẳng vào
`Grep`/`Read`, và **người giao việc chịu trách nhiệm**, không phải subagent.

---

## Quy trình coding

### 1. Đọc tài liệu của workspace TRƯỚC khi viết code

| Đụng vào          | Đọc                                                         |
| ----------------- | ----------------------------------------------------------- |
| `apps/api`        | [`docs/workspaces/api.md`](../docs/workspaces/api.md)       |
| `apps/staff`      | [`docs/workspaces/staff.md`](../docs/workspaces/staff.md)   |
| `apps/web`        | [`docs/workspaces/web.md`](../docs/workspaces/web.md)       |
| `packages/db`     | [`docs/workspaces/db.md`](../docs/workspaces/db.md)         |
| `packages/shared` | [`docs/workspaces/shared.md`](../docs/workspaces/shared.md) |

Mỗi file chứa **bẫy đã cắn thật** của workspace đó. `CLAUDE.md` của workspace là con trỏ 6 dòng,
tự nạp khi bạn làm ở đó — nó nhắc bạn đọc file nào.

Đây **cố ý không phải skill**: skill có mô tả nạp vào mọi phiên và một mục trong menu, mà tài liệu
theo thư mục thì không cần discovery — con trỏ tự nạp đã dẫn tới nơi. Skill để dành cho **thủ tục
mà bạn không tự biết là mình cần**:

| Việc                                                     | Skill          |
| -------------------------------------------------------- | -------------- |
| Probe hàng rào kiến trúc sau khi đụng `eslint.config.js` | `v9-fences`    |
| Auth, role, session, FK tới nhân viên                    | `v9-auth`      |
| Directus drift sau khi nâng version                      | `v9-directus`  |
| Chuẩn bị deploy                                          | `v9-deploy`    |
| Cú pháp CodeGraph/Serena, probe sau upgrade              | `v9-codegraph` |

### 2. Mỗi commit phải TỰ DỰNG ĐƯỢC

`bun test` và `bun run typecheck` chạy trên **cây làm việc**, không trên commit. Cây xanh **không**
chứng minh commit nào dựng được. Kiểm bằng:

```bash
git stash push --include-untracked && bun run typecheck && bun test && git stash pop
```

Chỉ `git add` file thuộc phạm vi việc đang làm — **không bao giờ `git add -A`**. Nhưng nếu file bạn
commit **import** một symbol nằm trong file chưa commit, phải kéo file đó vào cùng commit, nếu
không `git bisect` vỡ.

### 3. Đo hay suy — nói rõ cái nào

Khẳng định thứ gì đó render/chạy ra sao thì **hoặc đo nó, hoặc nói thẳng là suy luận**. Cả hai đều
được. Trình bày cái thứ hai như cái thứ nhất **không được**.

### 4. Test phải đo được thứ nó tuyên bố đo

Một test xanh chứng minh ít hơn vẻ ngoài của nó. Trước khi tin: **phá thứ nó canh và xem nó có đỏ
không.**

### 5. TDD: nghiêm ở đâu, không nghiêm ở đâu

- `packages/shared/src/domain/**` — **TDD nghiêm, không ngoại lệ.** Viết test, chạy, thấy **đỏ**,
  rồi mới implement. Đỏ vì đúng lý do, không phải đỏ vì lỗi cú pháp.
- Còn lại — verification-before-completion: chạy lệnh thật, đọc output thật, dán vào báo cáo.

### 6. Đổi tên hay signature của exported symbol

Bắt buộc `find_referencing_symbols` **trước**. Blast radius của CodeGraph là để **định hướng**,
không phải danh sách reference đủ để refactor an toàn.

---

## Tài liệu nằm ở đâu

| Loại                                      | Ở đâu                                             |
| ----------------------------------------- | ------------------------------------------------- |
| Quy trình làm việc                        | file này                                          |
| Kiến trúc, ràng buộc version, perf budget | [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) |
| Luật từng workspace                       | skill `v9-*`                                      |
| **Quyết định kiến trúc (ADR) + lý do**    | **Serena memory** `architecture/*`                |
| Nợ đã biết                                | [`docs/DEBT.md`](../docs/DEBT.md)                 |
| Đợt kế tiếp                               | [`docs/ROADMAP.md`](../docs/ROADMAP.md)           |
| Design doc từng đợt                       | [`docs/plans/`](../docs/plans/)                   |

Mục **MCP Tools** ở trên giữ nguyên văn tiếng Anh như bản được cung cấp; phần còn lại theo luật của
repo — tài liệu viết tiếng Việt, định danh tiếng Anh.

---

<!-- ⚠️ KHỐI DƯỚI DO `codegraph install --refresh` SINH RA — ĐỪNG SỬA TAY.
     Generator chỉ ghi vào vùng GIỮA hai marker, nên mọi thứ PHÍA TRÊN sống sót
     qua mỗi lần nâng version CodeGraph. Nếu một ngày phần trên biến mất sau khi
     nâng version, nghĩa là generator đã đổi sang ghi đè cả file — khôi phục từ
     git và cân nhắc đưa quy trình ra chỗ khác. -->

<!-- CODEGRAPH_START -->

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
