import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

import { readQuarterData } from "./quarter-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const UI_URI = "ui://quarter-chart/index.html";
const DEFAULT_EXCEL_PATH = "L:/System/Downloads/data.xlsx";

async function readUiHtml(): Promise<string> {
  const distHtmlPath = path.resolve(projectRoot, "dist", "index.html");
  try {
    return await fs.readFile(distHtmlPath, "utf-8");
  } catch {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quarter Chart (not built)</title>
    <style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:24px;}</style>
  </head>
  <body>
    <h1>UI not built</h1>
    <p>Run <code>npm.cmd run build:ui</code> in <code>${projectRoot}</code>, then restart the server.</p>
  </body>
</html>`;
  }
}

async function main() {
  const server = new McpServer({ name: "mcp-quarter-chart", version: "0.1.0" });

  registerAppResource(
    server,
    "Quarter Chart",
    UI_URI,
    {
      description: "Interactive stacked bar chart for quarterly data.",
    },
    async () => {
      const html = await readUiHtml();
      return {
        contents: [
          {
            uri: UI_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                csp: {
                  resourceDomains: ["https://d3js.org"],
                },
              },
            },
          },
        ],
      };
    },
  );

  registerAppTool(
    server,
    "quarter_data",
    {
      title: "Quarter data",
      description: "Load quarterly stacked series data from an Excel file.",
      inputSchema: {
        excelPath: z.string().optional(),
      },
      _meta: {
        ui: {
          resourceUri: UI_URI,
          visibility: ["model", "app"],
        },
      },
    },
    async ({ excelPath }) => {
      const effectivePath = excelPath?.trim() ? excelPath.trim() : DEFAULT_EXCEL_PATH;
      const result = readQuarterData(effectivePath);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
