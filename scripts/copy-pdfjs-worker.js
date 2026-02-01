#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, "..");
const sourceFile = join(
  projectRoot,
  "node_modules/pdfjs-dist/build/pdf.worker.mjs",
);
const destDir = join(projectRoot, "public");
const destFile = join(destDir, "pdf.worker.mjs");

try {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
    console.log("✓ Created public directory");
  }

  if (!existsSync(sourceFile)) {
    console.error("✗ PDF.js worker file not found in node_modules");
    console.error(`  Expected at: ${sourceFile}`);
    console.error("  Run 'bun install' first");
    process.exit(1);
  }

  copyFileSync(sourceFile, destFile);
  console.log("✓ Copied PDF.js worker to public/pdf.worker.mjs");
} catch (error) {
  console.error("✗ Failed to copy PDF.js worker:", error.message);
  process.exit(1);
}
