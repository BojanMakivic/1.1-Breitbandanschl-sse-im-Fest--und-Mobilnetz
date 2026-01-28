import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readQuarterData } from "./quarter-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const DEFAULT_EXCEL_PATH = process.env.EXCEL_PATH ?? "L:/System/Downloads/data.xlsx";
const DEFAULT_PORT = Number(process.env.PORT ?? "5179");

function send(res: http.ServerResponse, status: number, body: string, contentType: string) {
  res.statusCode = status;
  res.setHeader("content-type", contentType);
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

function json(res: http.ServerResponse, status: number, obj: unknown) {
  send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");
}

async function readDistIndexHtml(): Promise<string> {
  const p = path.resolve(projectRoot, "dist", "index.html");
  return await fs.readFile(p, "utf-8");
}

async function main() {
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? `localhost:${DEFAULT_PORT}`;
      const url = new URL(req.url ?? "/", `http://${host}`);

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        // Re-read from disk so rebuilding the UI reflects immediately (no server restart required).
        const indexHtml = await readDistIndexHtml();
        return send(res, 200, indexHtml, "text/html; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/api/quarter_data") {
        const excelPath = url.searchParams.get("excelPath") || DEFAULT_EXCEL_PATH;
        const data = readQuarterData(excelPath);
        return json(res, 200, data);
      }

      return send(res, 404, "Not Found", "text/plain; charset=utf-8");
    } catch (e: any) {
      return json(res, 500, { error: e?.message ?? String(e) });
    }
  });

  const host = "127.0.0.1";
  const maxTries = 25;

  const startListening = (port: number, triesLeft: number) => {
    const onError = (err: any) => {
      if (err?.code === "EADDRINUSE" && triesLeft > 0) {
        server.off("error", onError);
        startListening(port + 1, triesLeft - 1);
        return;
      }
      throw err;
    };

    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      // eslint-disable-next-line no-console
      console.log(`Web preview running: http://${host}:${port}/`);
      // eslint-disable-next-line no-console
      console.log(
        `API: http://${host}:${port}/api/quarter_data?excelPath=${encodeURIComponent(DEFAULT_EXCEL_PATH)}`,
      );
      // eslint-disable-next-line no-console
      console.log(`Tip: set PORT env var to force a port (e.g. PORT=5180).`);
    });
  };

  startListening(DEFAULT_PORT, maxTries);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
