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
      "import/resolver": {
        node: { extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"] },
      },
      "boundaries/elements": [
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
        { type: "api-infra", pattern: "apps/api/src/{db,env}.ts", mode: "full" },
        { type: "api-plugins", pattern: "apps/api/src/plugins/**" },
        { type: "frontend", pattern: "apps/{web,admin}/**" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "shared-domain", allow: ["shared-domain"] },
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
