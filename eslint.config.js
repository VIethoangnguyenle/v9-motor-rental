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

  // eslint.config.js is plain JS with no tsconfig of its own — keep it out of
  // type-aware linting rather than forcing it into a synthetic default project.
  // Must come after the block above so it wins for **/*.js.
  { files: ["**/*.js"], extends: [tseslint.configs.disableTypeChecked] },

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
      "import/resolver": {
        node: { extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"] },
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
        { type: "frontend", pattern: "apps/{web,admin}/**" },
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
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "shared-root", allow: ["shared-domain"] },
            {
              from: "api-root",
              allow: ["api-root", "api-routes", "api-plugins", "api-infra", "shared-domain"],
            },
            { from: "shared-domain", allow: ["shared-domain"] },
            // client.ts is fully isolated on purpose (cannot even import shared-domain, unlike
            // "frontend" which can import both): it's the Eden client factory, generic over the API
            // type, and must stay a dependency-free contract so packages/shared never gains a path
            // into apps/api. Do not "fix" this by adding allowed imports.
            { from: "shared-client", allow: [] },
            { from: "db", allow: ["db"] },
            {
              from: "api-routes",
              allow: ["api-routes", "api-services", "api-plugins", "shared-domain"],
            },
            { from: "api-services", allow: ["api-services", "api-infra", "db", "shared-domain"] },
            { from: "api-infra", allow: ["api-infra"] },
            { from: "api-plugins", allow: ["api-plugins", "api-infra", "shared-domain"] },
            { from: "frontend", allow: ["frontend", "shared-domain", "shared-client"] },
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
