#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf-8"),
);
const version = packageJson.version;

console.log(`📦 Syncing version ${version}...`);

const wxtConfigPath = join(rootDir, "wxt.config.ts");
let wxtConfig = readFileSync(wxtConfigPath, "utf-8");

wxtConfig = wxtConfig.replace(
  /version:\s*["'][\d.]+["']/,
  `version: "${version}"`,
);

writeFileSync(wxtConfigPath, wxtConfig, "utf-8");

const versionJsonPath = join(rootDir, "src", "lib", "version.json");
const versionJson = JSON.stringify({ version }, null, 2);

writeFileSync(versionJsonPath, versionJson, "utf-8");

console.log(
  `✅ Version ${version} synced to wxt.config.ts and lib/version.json!`,
);
