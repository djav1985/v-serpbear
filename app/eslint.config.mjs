import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import globals from "globals";
import nextPlugin from "@next/eslint-plugin-next";
import importPlugin from "eslint-plugin-import";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import securityPlugin from "eslint-plugin-security";
import nextBabelParser from "next/dist/compiled/babel/eslint-parser.js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));

const sharedSettings = {
  react: { version: "detect" },
  "import/parsers": {
    "@typescript-eslint/parser": [".ts", ".tsx", ".d.ts"],
  },
  "import/resolver": {
    node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
    typescript: {
      alwaysTryTypes: true,
      project: "./tsconfig.json",
    },
  },
};

const noUnusedVarsConfig = {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
  caughtErrors: "all",
  caughtErrorsIgnorePattern: "^_",
};

export default [
  {
    ignores: [".next/**", "coverage/**", "node_modules/**", "dist/**", "build/**"],
  },
  js.configs.recommended,
  {
    name: "serpbear/base-rules",
    plugins: {
      "@next/next": nextPlugin,
      import: importPlugin,
      "jsx-a11y": jsxA11yPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      security: securityPlugin,
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: nextBabelParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        requireConfigFile: false,
        ecmaFeatures: { jsx: true },
        babelOptions: { presets: ["next/babel"] },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: sharedSettings,
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      ...nextPlugin.flatConfig.coreWebVitals.rules,

      // Accessibility
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",

      // React modernizations
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // Style / readability
      "max-len": [
        "warn",
        {
          code: 200,
          ignoreComments: true,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      "arrow-body-style": ["error", "as-needed"],
      "class-methods-use-this": "error",
      "no-unused-vars": [
        "warn",
        noUnusedVarsConfig,
      ],

      // Imports
      "import/no-extraneous-dependencies": "off",
      "import/extensions": [
        "error",
        "ignorePackages",
        { js: "never", jsx: "never", ts: "never", tsx: "never" },
      ],

      // Security
      "security/detect-non-literal-fs-filename": "error",

      // Complexity guardrail
      complexity: ["warn", { max: 60 }],
    },
  },
  {
    name: "serpbear/typescript",
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: baseDirectory,
        sourceType: "module",
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        noUnusedVarsConfig,
      ],
    },
  },
  {
    name: "serpbear/tests",
    files: [
      "**/__tests__/**/*",
      "**/__mocks__/**/*",
      "../__tests__/**/*",
      "../__mocks__/**/*",
      "**/*.{test,spec}.*",
      "jest.setup.js"
    ],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.jest } },
    rules: {
      complexity: "off",
      "import/extensions": "off",
    },
  },
  {
    name: "serpbear/config",
    files: ["eslint.config.mjs"],
    rules: { "import/extensions": "off" },
  },
];
