import { baseConfig } from "@verevia/config/eslint/base.mjs";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [...baseConfig, ...nextCoreWebVitals];

export default config;
