# CLAUDE.md

Quy trình làm việc cho repo này. **Áp cho mọi agent, kể cả subagent.**

Thông tin hệ thống, kiến trúc, ràng buộc phiên bản và perf budget **không** nằm ở đây — xem
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) và các skill `v9-*` trong `.claude/skills/`.

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
bài**. Không chép thì subagent sẽ đi thẳng vào `Grep`/`Read`, và người giao việc chịu trách nhiệm,
không phải subagent.
