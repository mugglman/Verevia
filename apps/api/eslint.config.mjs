import { baseConfig } from "@verevia/config/eslint/base.mjs";

export default [
  ...baseConfig,
  {
    rules: {
      // NestJS relies on empty constructors/decorators that trip a few
      // default TS-ESLint rules designed for plain TypeScript.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];
