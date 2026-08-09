import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/build/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // File cấu hình JS thuần, không nằm trong tsconfig nào: eslint.config.js và
  // apps/web/postcss.config.mjs. Để chúng ngoài type-aware linting thay vì ép
  // vào một synthetic default project.
  //
  // `.mjs` PHẢI có mặt ở đây. Thiếu nó, postcss.config.mjs làm lint chết với
  // "was not found by the project service" — lỗi parse, không phải lỗi luật,
  // nên đọc thoáng dễ tưởng config hỏng.
  //
  // Must come after the block above so it wins for these files.
  { files: ["**/*.js", "**/*.mjs"], extends: [tseslint.configs.disableTypeChecked] },

  // ── Dependency graph ──────────────────────────────────────────────────
  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["apps/**/*", "packages/**/*"],
      // KHÔNG ĐƯỢC XOÁ. eslint-plugin-boundaries resolve import qua eslint-import-resolver-node,
      // mà resolver đó mặc định không nhận .ts/.tsx (extensions mặc định chỉ có .mjs/.js/.json/.node).
      // Thiếu dòng này, mọi import tương đối không đuôi file (import { x } from "./foo") sẽ resolve
      // thất bại, plugin phân loại đích là "unknown" và IM LẶNG bỏ qua — boundaries/dependencies trở
      // thành no-op hoàn toàn trên toàn bộ codebase TypeScript thật, lint vẫn exit 0. Đã kiểm chứng
      // thực nghiệm bằng cách gọi eslint-import-resolver-node trực tiếp và qua boundaries/debug.
      //
      // `engines` + `preserveSymlinks: false` KHÔNG ĐƯỢC XOÁ — thiếu một trong hai, mọi import
      // package-specifier NỘI BỘ (import { x } from "@v9/db", "@v9/shared/client", ...) im lặng
      // KHÔNG được boundaries/dependencies kiểm tra, dù import bằng đường dẫn tương đối vẫn bị bắt —
      // đây chính xác là "enforcement theatre" bị phát hiện thực nghiệm: `api-root` import thẳng
      // `@v9/db` (con đường mọi người thực sự viết, vì apps/api có khai @v9/db trong dependencies)
      // lọt qua hoàn toàn, trong khi chỉ import bằng "../../../db/src/index" (không ai viết) mới bị
      // bắt. Root cause, đọc trực tiếp từ node_modules/.bun/resolve@2.0.0-next.7/…/lib/sync.js và
      // node_modules/eslint-import-resolver-node/index.js, xác nhận bằng cách gọi resolver trực
      // tiếp ngoài ESLint:
      //   1. eslint-import-resolver-node dùng gói `resolve`, gói này CÓ hỗ trợ "exports" field của
      //      package.json — nhưng chỉ bật khi options.engines cho nó biết range Node để chọn "exports
      //      category". Resolver mặc định `engines: true` nghĩa là "đọc engines.node từ package.json
      //      GẦN NHẤT phía trên file đang import" — không package.json nào trong repo này khai
      //      `engines.node` (root chỉ có `engines.bun`) → tra cứu thất bại → resolver ÂM THẦM rơi về
      //      thuật toán "main field" cũ, không đọc "exports" — mà packages/db, packages/shared chỉ
      //      khai "exports", không có "main" → resolve "@v9/db" ra `{ found: false }`. Đặt thẳng
      //      `engines: ">=18"` ở đây bỏ qua bước tra package.json, luôn bật "exports" resolution.
      //   2. Sau khi (1) làm resolve thành công, path trả về vẫn là đường dẫn CHƯA realpath — ví dụ
      //      từ apps/api/src/index.ts, "@v9/db" resolve ra
      //      "apps/api/node_modules/@v9/db/src/index.ts" (symlink workspace, KHÔNG realpath), vì
      //      resolver mặc định `preserveSymlinks: true`. Path đó CHỨA chuỗi "node_modules" →
      //      flagAsExternal.inNodeModules (mặc định true, không đổi ở đây) phân loại nó "external"
      //      → boundaries/dependencies bỏ qua (mặc định chỉ kiểm tra origin "local"). Đặt
      //      `preserveSymlinks: false` buộc resolver gọi fs.realpathSync, trả về đường dẫn thật
      //      "packages/db/src/index.ts" — khớp pattern `packages/db/**`, phân loại "local", "db".
      // Gói thật sự bên ngoài (elysia, drizzle-orm, @tanstack/react-query, ...) vẫn resolve vào
      // node_modules thật (node_modules/.bun/<pkg>/...) dù có realpath hay không — "node_modules"
      // vẫn nằm trong path đó, nên vẫn bị phân loại "external" và KHÔNG bị kiểm tra bởi
      // boundaries/dependencies (checkAllOrigins vẫn để mặc định false — KHÔNG bật, vì bật nó lên sẽ
      // buộc kiểm tra luôn cả import bên thứ ba thật, mà không policy nào trong file này cho phép
      // import vào element "unknown" → mọi import elysia/react/vite/... sẽ bị disallow, phá toàn bộ
      // dev bình thường). Đã kiểm chứng bằng script gọi resolver trực tiếp cho cả hai nhóm, và bằng
      // 8 probe boundaries/dependencies + no-restricted-imports thật (4 cũ + 2 dương/2 âm mới) chạy
      // qua `bun run lint` — xem lịch sử task để lại chứng cứ đầy đủ.
      "import/resolver": {
        node: {
          extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
          engines: ">=18",
          preserveSymlinks: false,
        },
      },
      // Composition roots / entrypoint files that scripts and other packages import through are not
      // covered by any folder pattern below (index.ts isn't "under" domain/, routes/, etc.). A file
      // matching NO element pattern is not weakly checked — it is completely exempt: the plugin
      // registers no dependency visitor at all for a file it can't classify, so imports FROM it are
      // never checked. That's exactly where "just wire this directly" violations would accumulate.
      // Declared first for readability (roots conceptually sit above the layers they wire together);
      // verified empirically that declaration order does not change classification here since none
      // of these single-file `mode: "full"` patterns overlap with any folder pattern below (see the
      // full plan-layout test — every planned path classifies to exactly one type). General finding
      // for future edits: two overlapping FOLDER-mode patterns both accumulate into `element.types`
      // (order only affects array order, not which one applies); a `mode: "full"` match on a file
      // takes exclusive precedence over any overlapping folder-mode pattern regardless of order.
      "boundaries/elements": [
        { type: "shared-root", pattern: "packages/shared/src/index.ts", mode: "full" },
        { type: "api-root", pattern: "apps/api/src/index.ts", mode: "full" },
        { type: "shared-domain", pattern: "packages/shared/src/domain/**" },
        // Single-file elements: eslint-plugin-boundaries 7.1.0's documented replacement for this
        // (`partialMatch: false`) was verified (via a standalone @boundaries/elements test) to NOT
        // match the exact file — it still appends a folder-descendant suffix and only matches
        // nested paths below it, never the file itself. `mode: "full"` is deprecated but is the
        // option that actually performs an exact full-path match in this installed version. It
        // trades a "'mode' is deprecated" warning for correct enforcement, which we need more.
        { type: "shared-client", pattern: "packages/shared/src/client.ts", mode: "full" },
        { type: "db", pattern: "packages/db/**" },
        { type: "api-routes", pattern: "apps/api/src/routes/**" },
        { type: "api-services", pattern: "apps/api/src/services/**" },
        // api-infra uses `mode: "full"` for the same reason as shared-client above (see that
        // comment): partialMatch:false does not match exact files in this plugin version, so the
        // deprecated `mode: "full"` is the one that actually performs a full-path match here.
        { type: "api-infra", pattern: "apps/api/src/{db,env}.ts", mode: "full" },
        { type: "api-plugins", pattern: "apps/api/src/plugins/**" },
        { type: "frontend", pattern: "apps/{web,staff}/**" },
      ],
      // apps/api/scripts/bench.ts is operational tooling, not a layer in the enforced app/service/db
      // architecture — it's expected to reach into services/db directly to benchmark them, and giving
      // it an element type (or forcing it through the layering) wouldn't serve that purpose. Excluded
      // from boundaries checks entirely rather than added as an element, so it also cannot trip
      // boundaries/no-unknown-files below. Verified against the full planned file layout: this is the
      // only path under apps/**/* or packages/**/* that matches no element pattern.
      "boundaries/ignore": ["apps/api/scripts/**"],
    },
    rules: {
      // Renamed from the deprecated "boundaries/element-types" to "boundaries/dependencies" — same
      // factory function, same options schema, zero behaviour change, one fewer deprecation warning
      // per run. Verified via boundary probe that enforcement still fires after the rename.
      //
      // `rules` renamed to `policies` (the `rules` key still works but is deprecated and prints a
      // warning — confirmed in node_modules/eslint-plugin-boundaries/dist/Settings/Rules.js,
      // validateAndWarnRuleOptions: `options.policies ?? options.rules`). Entries migrated from
      // legacy string selectors (`from: "type"`, `allow: ["type", ...]`) to the object-based
      // selector syntax v7 wants (`from: { element: { type: "..." } }`,
      // `allow: { to: { element: { type: "..." } } }` / `{ types: { anyOf: [...] } }` for
      // multi-target allow lists) — exact shape confirmed against the README's own "Quick Example"
      // (node_modules/eslint-plugin-boundaries/README.md) and against
      // node_modules/eslint-plugin-boundaries/dist/Settings/Rules.js (ruleHasLegacySelectorSyntax /
      // isLegacyEntitySelector, which flags bare strings and un-wrapped `{ type: "..." }` objects
      // alike — only `{ element: { type: "..." } }` counts as non-legacy) and
      // node_modules/.bun/@boundaries+elements@3.1.0/.../dist/index.d.ts (ElementSingleSelector:
      // `type` matches only element.types[0], `types: { anyOf: [...] }` matches anywhere in
      // element.types — used here for the "allow one of several types" rules to reproduce the old
      // array semantics exactly). Behaviour is unchanged: same allow/disallow graph, verified by
      // re-running all four boundary probes below after the migration.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "shared-root" } },
              allow: { to: { element: { type: "shared-domain" } } },
            },
            {
              from: { element: { type: "api-root" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "api-root",
                        "api-routes",
                        "api-plugins",
                        "api-infra",
                        "shared-domain",
                      ],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: "shared-domain" } },
              allow: { to: { element: { type: "shared-domain" } } },
            },
            // client.ts is fully isolated on purpose (cannot even import shared-domain, unlike
            // "frontend" which can import both): it's the Eden client factory, generic over the API
            // type, and must stay a dependency-free contract so packages/shared never gains a path
            // into apps/api. Do not "fix" this by adding allowed imports.
            { from: { element: { type: "shared-client" } }, allow: [] },
            {
              from: { element: { type: "db" } },
              allow: { to: { element: { type: "db" } } },
            },
            {
              from: { element: { type: "api-routes" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["api-routes", "api-services", "api-plugins", "shared-domain"],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: "api-services" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["api-services", "api-infra", "db", "shared-domain"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "api-infra" } },
              allow: { to: { element: { type: "api-infra" } } },
            },
            {
              from: { element: { type: "api-plugins" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["api-plugins", "api-infra", "shared-domain"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "frontend" } },
              allow: [
                {
                  to: {
                    element: {
                      types: { anyOf: ["frontend", "shared-domain", "shared-client"] },
                    },
                  },
                },
                // Eden Treaty typing (§4.1 docs/plans/2026-08-04-scaffolding-design.md): both
                // apps/{staff,web} lib/api.ts write `import type { App } from "@v9/api"` — TYPE
                // ONLY, erased at build — to hand the API's type to createApiClient<App>() without
                // packages/shared ever importing apps/api (that's what would recreate the
                // shared → api → shared cycle client.ts exists to avoid). This surfaced only after
                // fixing the resolver below to stop misclassifying "@v9/*" specifiers as external —
                // before that fix this dependency was invisible to boundaries entirely, so the "no
                // policy allows frontend → api-root" rule below never had to account for it. Scoped
                // to `dependency.kind: "type"` so a *value* import from api-root (e.g. importing
                // `app` itself, not just `type App`) is still rejected — dependency.kind confirmed
                // via boundaries/debug on this exact file (kind: "type" for `import type {...}`,
                // kind: "value" for a plain `import {...}`).
                {
                  to: { element: { type: "api-root" } },
                  dependency: { kind: "type" },
                },
              ],
            },
          ],
        },
      ],
      // Fails loudly the moment a new top-level file matches no element pattern above, instead of
      // silently escaping every boundaries check the way apps/api/src/index.ts and
      // packages/shared/src/index.ts did before shared-root/api-root were added.
      "boundaries/no-unknown-files": "error",
    },
  },

  // Don't reach into another package's guts — go through its entrypoint.
  {
    files: ["apps/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@v9/*/src/*"],
              message: "Import qua entrypoint của package, không chọc vào src/.",
            },
          ],
        },
      ],
    },
  },

  prettier,
);
