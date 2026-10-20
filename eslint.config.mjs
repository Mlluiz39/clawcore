// Config do ESLint para o backend (Node/TypeScript).
//
// O frontend tem a sua própria em frontend/eslint.config.js. Esta roda na raiz
// e ignora frontend/ para não aplicar regras de browser ao servidor.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "node_modules", "frontend", "data", "tmp", "outputs", "backups"]),
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      // `any` era o escape hatch usado em toda parte; agora que o código está
      // tipado, volta a ser erro.
      "@typescript-eslint/no-explicit-any": "error",
      // Permite `_` como prefixo para argumentos intencionalmente ignorados.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // catch vazio é aceitável quando o erro é deliberadamente ignorado.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
]);
