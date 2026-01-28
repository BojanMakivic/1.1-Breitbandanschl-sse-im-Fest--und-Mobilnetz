import path from "node:path";
import xlsx from "xlsx";

export type ToolResult = {
  excelPath: string;
  quarters: string[];
  categories: string[];
  series: Array<{ quarter: string; values: Record<string, number> }>;
};

function parseQuarterId(q: string): number {
  // Expected formats like "2020-Q1" or "2020Q1".
  const m = String(q).trim().match(/^(\d{4})\s*-?\s*Q(\d)\s*$/i);
  if (!m) return Number.POSITIVE_INFINITY;
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  return year * 4 + (quarter - 1);
}

function normalizePath(p: string): string {
  // Accept forward slashes from UI and normalize for Windows.
  return p.replaceAll("/", path.win32.sep);
}

export function readQuarterData(excelPathRaw: string): ToolResult {
  const excelPath = normalizePath(excelPathRaw);

  const wb = xlsx.readFile(excelPath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets.");

  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  });

  const QUARTER_COL = "Quartal";
  const CATEGORY_COL = "Kategorie";
  const VALUE_COL = "Anzahl Anschlüsse";

  const quarterSet = new Set<string>();
  const categorySet = new Set<string>();
  const byQuarter = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const q = row[QUARTER_COL];
    const k = row[CATEGORY_COL];
    const v = row[VALUE_COL];

    if (q == null || k == null) continue;

    const quarter = String(q).trim();
    const category = String(k).trim();

    if (!quarter || !category) continue;

    const valueNum = typeof v === "number" ? v : Number(String(v ?? "0").replaceAll("'", "").replaceAll(" ", ""));
    const value = Number.isFinite(valueNum) ? valueNum : 0;

    quarterSet.add(quarter);
    categorySet.add(category);

    if (!byQuarter.has(quarter)) byQuarter.set(quarter, new Map());
    const m = byQuarter.get(quarter)!;
    m.set(category, (m.get(category) ?? 0) + value);
  }

  const quarters = Array.from(quarterSet).sort((a, b) => parseQuarterId(a) - parseQuarterId(b));
  const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));

  const series = quarters.map((quarter) => {
    const m = byQuarter.get(quarter) ?? new Map<string, number>();
    const values: Record<string, number> = {};
    for (const cat of categories) values[cat] = m.get(cat) ?? 0;
    return { quarter, values };
  });

  return { excelPath: excelPathRaw, quarters, categories, series };
}
