import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readQuarterData } from "./quarter-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const distIndex = path.resolve(projectRoot, "dist", "index.html");
  const docsDir = path.resolve(projectRoot, "docs");
  const docsIndex = path.resolve(docsDir, "index.html");
  const docsData = path.resolve(docsDir, "data.json");
  const docsNoJekyll = path.resolve(docsDir, ".nojekyll");
  const publishedDefaultsSrc = path.resolve(projectRoot, "data", "published-defaults.json");
  const publishedDefaultsDst = path.resolve(docsDir, "published-defaults.json");

  const excelPath = (process.env.EXCEL_PATH ?? "data/data.xlsx").trim();
  const excelAbs = path.isAbsolute(excelPath) ? excelPath : path.resolve(projectRoot, excelPath);

  if (!(await exists(distIndex))) {
    throw new Error("dist/index.html not found. Run `npm.cmd run build:ui` first.");
  }

  if (!(await exists(excelAbs))) {
    throw new Error(
      `Excel not found: ${excelAbs}. Put your file at data/data.xlsx (recommended) or set EXCEL_PATH.`
    );
  }

  await fs.mkdir(docsDir, { recursive: true });

  // Copy UI
  await fs.copyFile(distIndex, docsIndex);

  // Generate published dataset JSON
  const data = readQuarterData(excelAbs);
  await fs.writeFile(docsData, JSON.stringify(data, null, 2), "utf-8");

  // Optional: copy published default colors/order so everyone sees your defaults on first load
  if (await exists(publishedDefaultsSrc)) {
    await fs.copyFile(publishedDefaultsSrc, publishedDefaultsDst);
  }

  // GitHub Pages: disable Jekyll processing
  await fs.writeFile(docsNoJekyll, "", "utf-8");

  // eslint-disable-next-line no-console
  console.log("Wrote GitHub Pages site:");
  // eslint-disable-next-line no-console
  console.log(`- ${docsIndex}`);
  // eslint-disable-next-line no-console
  console.log(`- ${docsData}`);
  if (await exists(publishedDefaultsDst)) {
    // eslint-disable-next-line no-console
    console.log(`- ${publishedDefaultsDst}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
