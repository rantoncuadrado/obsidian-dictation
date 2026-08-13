import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: ["main.js", "node_modules/**"],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      "obsidianmd/prefer-file-manager-trash-file": "error",
    },
  },
  {
    files: ["esbuild.config.mjs", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "obsidianmd/no-nodejs-modules": "off",
    },
  },
  {
    // Keep the imperative settings API while supporting Obsidian 1.11.4.
    files: ["src/settings-tab.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
]);
