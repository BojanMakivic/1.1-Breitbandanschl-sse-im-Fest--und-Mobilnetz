// D3 is loaded via CDN and available as global `d3`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const d3: any;

import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";

type HostContext = {
  theme?: unknown;
  styles?: { variables?: Record<string, string>; css?: { fonts?: string } };
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
};

type QuarterRow = {
  quartal: string;
  kategorie: string;
  value: number;
};

type ToolResult = {
  excelPath: string;
  quarters: string[];
  categories: string[];
  series: Array<{ quarter: string; values: Record<string, number> }>;
};

const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;
const slider = document.getElementById("windowSlider") as HTMLInputElement;
const yScaleSel = document.getElementById("yScale") as HTMLSelectElement;
const excelPathInput = document.getElementById("excelPath") as HTMLInputElement;
const loadBtn = document.getElementById("loadBtn") as HTMLButtonElement;

const windowLabel = document.getElementById("windowLabel") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const svgEl = document.getElementById("chart") as SVGSVGElement;
const tooltip = document.getElementById("tooltip") as HTMLDivElement;
const legendEl = document.getElementById("legend") as HTMLDivElement;

const legendEditor = document.getElementById("legendEditor") as HTMLDivElement;
const legendEditorLabel = document.getElementById("legendEditorLabel") as HTMLDivElement;
const colorPicker = document.getElementById("colorPicker") as HTMLInputElement;
const colorHex = document.getElementById("colorHex") as HTMLInputElement;
const applyColorBtn = document.getElementById("applyColorBtn") as HTMLButtonElement;
const downloadDefaultsBtn = document.getElementById("downloadDefaultsBtn") as HTMLButtonElement;
const resetColorsBtn = document.getElementById("resetColorsBtn") as HTMLButtonElement;
const resetOrderBtn = document.getElementById("resetOrderBtn") as HTMLButtonElement;

let toolData: ToolResult | null = null;
let timer: number | null = null;
const WINDOW = 12;

let mode: "mcp" | "web" = "web";
let appRef: App | null = null;
let selectedCategory: string | null = null;

const COLOR_STORAGE_KEY = "mcp-quarter-chart.colorsByCategory.v1";
const ORDER_STORAGE_KEY = "mcp-quarter-chart.categoryOrder.v1";

type PublishedDefaults = {
  colorsByCategory?: Record<string, string>;
  categoryOrder?: string[];
};

let publishedDefaults: PublishedDefaults | null = null;

function sanitizePublishedDefaults(input: any): PublishedDefaults {
  const out: PublishedDefaults = {};

  if (input && typeof input === "object") {
    if (input.colorsByCategory && typeof input.colorsByCategory === "object") {
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.colorsByCategory)) {
        if (typeof k === "string" && typeof v === "string" && isValidHexColor(v)) map[k] = v.toUpperCase();
      }
      out.colorsByCategory = map;
    }

    if (Array.isArray(input.categoryOrder)) {
      out.categoryOrder = input.categoryOrder.filter((x: any) => typeof x === "string");
    }
  }

  return out;
}

async function loadPublishedDefaults() {
  // For GitHub Pages/static hosting we optionally ship ./published-defaults.json.
  // If it doesn't exist, just keep computed defaults.
  try {
    const url = new URL("./published-defaults.json", window.location.href);
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    publishedDefaults = sanitizePublishedDefaults(json);
  } catch {
    // ignore
  }
}

function isValidHexColor(s: string) {
  return /^#[0-9a-fA-F]{6}$/.test(s.trim());
}

function loadColorOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(COLOR_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === "string" && typeof v === "string" && isValidHexColor(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function loadPublishedColorDefaults(): Record<string, string> {
  const map = publishedDefaults?.colorsByCategory;
  if (!map) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof k === "string" && typeof v === "string" && isValidHexColor(v)) out[k] = v;
  }
  return out;
}

function saveColorOverrides(map: Record<string, string>) {
  localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(map));
}

function loadCategoryOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string") as string[];
  } catch {
    return [];
  }
}

function loadPublishedCategoryOrder(): string[] {
  const order = publishedDefaults?.categoryOrder;
  if (!order) return [];
  return order.filter((x) => typeof x === "string");
}

function saveCategoryOrder(order: string[]) {
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
}

function getOrderedCategories(categories: string[]): string[] {
  const saved = loadCategoryOrder();
  const base = saved.length ? saved : loadPublishedCategoryOrder();
  if (!base.length) return categories;
  const set = new Set(categories);
  const ordered: string[] = [];
  for (const k of base) {
    if (set.has(k)) ordered.push(k);
  }
  for (const k of categories) {
    if (!ordered.includes(k)) ordered.push(k);
  }
  return ordered;
}

function formatInt(n: number) {
  return new Intl.NumberFormat("de-CH").format(n);
}

function formatByScale(n: number) {
  const mode = yScaleSel.value;
  if (mode === "k") return `${formatInt(n / 1000)}k`;
  if (mode === "m") return `${formatInt(n / 1_000_000)}M`;
  return formatInt(n);
}

function showStatus(msg: string) {
  statusEl.textContent = msg;
}

function setTooltip(show: boolean, x = 0, y = 0, html = "") {
  if (!show) {
    tooltip.style.display = "none";
    return;
  }
  tooltip.innerHTML = html;
  tooltip.style.display = "block";
  tooltip.style.left = `${x + 12}px`;
  tooltip.style.top = `${y + 12}px`;
}

function setPlaying(isPlaying: boolean) {
  playBtn.disabled = isPlaying;
  pauseBtn.disabled = !isPlaying;
}

function updatePlayLabel() {
  if (!toolData) {
    playBtn.textContent = "Play";
    return;
  }
  const maxStart = Math.max(0, toolData.quarters.length - WINDOW);
  const atEnd = Number(slider.value) >= maxStart;
  playBtn.textContent = atEnd ? "Replay" : "Play";
}

function stopPlaying() {
  if (timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
  setPlaying(false);
  updatePlayLabel();
}

function startPlaying() {
  if (!toolData) return;
  stopPlaying();
  setPlaying(true);

  // If we are already at the last window, replay from the start.
  const maxStart0 = Math.max(0, toolData.quarters.length - WINDOW);
  if (Number(slider.value) >= maxStart0) {
    slider.value = "0";
    render();
  }

  timer = window.setInterval(() => {
    const maxStart = Math.max(0, toolData!.quarters.length - WINDOW);
    const next = Math.min(maxStart, Number(slider.value) + 1);
    slider.value = String(next);
    render();
    if (next >= maxStart) stopPlaying();
  }, 800);
}

function buildLegend(categories: string[], color: (k: string) => string) {
  legendEl.innerHTML = "";
  for (const k of categories) {
    const div = document.createElement("button");
    div.type = "button";
    div.className = "legendItem";
    div.title = "Click to edit color";
    div.draggable = true;

    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = color(k);

    const label = document.createElement("div");
    label.textContent = k;

    div.appendChild(sw);
    div.appendChild(label);
    legendEl.appendChild(div);

    div.addEventListener("click", () => {
      selectedCategory = k;
      legendEditor.style.display = "flex";
      legendEditorLabel.textContent = `Kategorie: ${k}`;

      const current = color(k);
      const asHex = isValidHexColor(String(current)) ? String(current) : "#2563eb";
      colorPicker.value = asHex;
      colorHex.value = asHex;
    });

    div.addEventListener("dragstart", (e: DragEvent) => {
      stopPlaying();
      e.dataTransfer?.setData("text/plain", k);
      e.dataTransfer?.setData("application/x-category", k);
      e.dataTransfer?.setDragImage(div, 10, 10);
    });

    div.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
    });

    div.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      if (!toolData) return;

      const from = e.dataTransfer?.getData("application/x-category") || e.dataTransfer?.getData("text/plain");
      const to = k;
      if (!from || from === to) return;

      const current = getOrderedCategories(toolData.categories);
      const fromIdx = current.indexOf(from);
      const toIdx = current.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return;

      current.splice(fromIdx, 1);
      current.splice(toIdx, 0, from);
      saveCategoryOrder(current);
      render();
    });
  }
}

function render() {
  if (!toolData) return;

  const { quarters, series } = toolData;
  const categories = getOrderedCategories(toolData.categories);
  const maxStart = Math.max(0, quarters.length - WINDOW);

  slider.max = String(maxStart);
  const start = Math.max(0, Math.min(maxStart, Number(slider.value)));
  const end = Math.min(quarters.length, start + WINDOW);
  const windowQuarters = quarters.slice(start, end);

  windowLabel.textContent = `${windowQuarters[0] ?? ""} → ${windowQuarters[windowQuarters.length - 1] ?? ""}  (showing ${windowQuarters.length}/${WINDOW})`;
  updatePlayLabel();

  const windowSeries = series
    .filter((d) => windowQuarters.includes(d.quarter))
    .map((d) => ({
      quarter: d.quarter,
      ...Object.fromEntries(categories.map((k) => [k, d.values[k] ?? 0])),
    }));

  const wrap = document.getElementById("chartWrap") as HTMLDivElement;
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;

  const margin = { top: 18, right: 18, bottom: 56, left: 70 };
  const innerW = Math.max(1, width - margin.left - margin.right);
  const innerH = Math.max(1, height - margin.top - margin.bottom);

  const defaultColors: Record<string, string> = {};
  for (let i = 0; i < categories.length; i++) {
    const t = i / Math.max(1, categories.length - 1);
    defaultColors[categories[i]] = d3.interpolateTurbo(0.15 + 0.7 * t);
  }
  const published = loadPublishedColorDefaults();
  const overrides = loadColorOverrides();
  const color = (k: string) => overrides[k] ?? published[k] ?? defaultColors[k] ?? "#999";

  buildLegend(categories, (k) => color(k));

  const stack = d3.stack().keys(categories);
  const stacked = stack(windowSeries);

  const x = d3
    .scaleBand()
    .domain(windowQuarters)
    .range([0, innerW])
    .padding(0.18);

  const maxY = d3.max(stacked, (layer: any) => d3.max(layer, (d: any) => d[1])) ?? 0;

  const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0]);

  const svg = d3.select(svgEl);
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // Root group
  const g = svg
    .selectAll("g.root")
    .data([null])
    .join("g")
    .attr("class", "root")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Axes
  g.selectAll("g.x").data([null]).join("g").attr("class", "x").attr("transform", `translate(0,${innerH})`).call(
    d3
      .axisBottom(x)
      .tickSizeOuter(0)
  ).selectAll("text")
    .style("font-size", "11px")
    .attr("transform", "rotate(-35)")
    .style("text-anchor", "end");

  g.selectAll("g.y").data([null]).join("g").attr("class", "y").call(
    d3.axisLeft(y).ticks(6).tickFormat((v: number) => formatByScale(Number(v)))
  ).selectAll("text").style("font-size", "11px");

  // Gridlines
  g.selectAll("g.grid").data([null]).join("g").attr("class", "grid").call(
    d3
      .axisLeft(y)
      .ticks(6)
      .tickSize(-innerW)
      .tickFormat(() => "")
  )
    .selectAll("line")
    .attr("stroke", "rgba(255,255,255,0.10)");

  g.selectAll("g.grid").selectAll("path").attr("stroke", "none");

  // Layers
  const layers = g
    .selectAll("g.layer")
    .data(stacked, (d: any) => d.key)
    .join("g")
    .attr("class", "layer")
    .attr("fill", (d: any) => color(d.key));

  const t = d3.transition().duration(520).ease(d3.easeCubicInOut);

  // Rects (smooth transitions)
  layers
    .selectAll("rect")
    .data(
      (layer: any) =>
        layer.map((d: any, i: number) => ({
          key: layer.key,
          quarter: windowSeries[i].quarter,
          y0: d[0],
          y1: d[1],
          value: (windowSeries[i] as any)[layer.key] as number,
        })),
      (d: any) => `${d.key}|${d.quarter}`
    )
    .join(
      (enter: any) =>
        enter
          .append("rect")
          .attr("x", (d: any) => x(d.quarter) ?? 0)
          .attr("width", x.bandwidth())
          .attr("y", innerH)
          .attr("height", 0)
          .attr("rx", 3)
          .call((sel: any) =>
            sel
              .transition(t)
              .attr("x", (d: any) => x(d.quarter) ?? 0)
              .attr("width", x.bandwidth())
              .attr("y", (d: any) => y(d.y1))
              .attr("height", (d: any) => Math.max(0, y(d.y0) - y(d.y1)))
          ),
      (update: any) =>
        update.call((sel: any) =>
          sel
            .transition(t)
            .attr("x", (d: any) => x(d.quarter) ?? 0)
            .attr("width", x.bandwidth())
            .attr("y", (d: any) => y(d.y1))
            .attr("height", (d: any) => Math.max(0, y(d.y0) - y(d.y1)))
        ),
      (exit: any) =>
        exit.call((sel: any) =>
          sel
            .transition(t)
            .attr("y", innerH)
            .attr("height", 0)
            .remove()
        )
    )
    .on("mousemove", (event: MouseEvent, d: any) => {
      const html = `
        <div style="font-weight:600; margin-bottom:4px;">${d.quarter}</div>
        <div><span style="opacity:0.8">Kategorie:</span> ${d.key}</div>
        <div><span style="opacity:0.8">Wert:</span> ${formatByScale(d.value)}</div>
        <div style="opacity:0.75">(raw: ${formatInt(d.value)})</div>
      `;
      const rect = (event.currentTarget as Element).getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      setTooltip(true, rect.left - wrapRect.left + rect.width / 2, rect.top - wrapRect.top, html);
    })
    .on("mouseleave", () => setTooltip(false));

  // Value labels inside each stacked segment
  layers
    .selectAll("text.valueLabel")
    .data(
      (layer: any) =>
        layer.map((d: any, i: number) => ({
          key: layer.key,
          quarter: windowSeries[i].quarter,
          y0: d[0],
          y1: d[1],
          value: (windowSeries[i] as any)[layer.key] as number,
        })),
      (d: any) => `${d.key}|${d.quarter}`
    )
    .join(
      (enter: any) =>
        enter
          .append("text")
          .attr("class", "valueLabel")
          .attr("x", (d: any) => (x(d.quarter) ?? 0) + x.bandwidth() / 2)
          .attr("y", innerH)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .style("pointer-events", "none")
          .style("font-size", "11px")
          .style("font-weight", "600")
          .style("paint-order", "stroke")
          .style("stroke", "rgba(0,0,0,0.55)")
          .style("stroke-width", "3px")
          .style("fill", "rgba(255,255,255,0.95)")
          .style("opacity", 0)
          .text((d: any) => formatByScale(d.value))
          .call((sel: any) =>
            sel
              .transition(t)
              .attr("x", (d: any) => (x(d.quarter) ?? 0) + x.bandwidth() / 2)
              .attr("y", (d: any) => (y(d.y0) + y(d.y1)) / 2)
              .style("opacity", (d: any) => {
                const h = y(d.y0) - y(d.y1);
                return d.value > 0 && h >= 14 ? 1 : 0;
              })
          ),
      (update: any) =>
        update
          .text((d: any) => formatByScale(d.value))
          .call((sel: any) =>
            sel
              .transition(t)
              .attr("x", (d: any) => (x(d.quarter) ?? 0) + x.bandwidth() / 2)
              .attr("y", (d: any) => (y(d.y0) + y(d.y1)) / 2)
              .style("opacity", (d: any) => {
                const h = y(d.y0) - y(d.y1);
                return d.value > 0 && h >= 14 ? 1 : 0;
              })
          ),
      (exit: any) =>
        exit.call((sel: any) =>
          sel
            .transition(t)
            .style("opacity", 0)
            .attr("y", innerH)
            .remove()
        )
    );
}

function normalizeAndRender(result: ToolResult) {
  toolData = result;

  excelPathInput.value = result.excelPath;

  const maxStart = Math.max(0, result.quarters.length - WINDOW);
  slider.min = "0";
  slider.max = String(maxStart);
  slider.value = "0";

  showStatus(`Loaded ${result.series.length} quarters from ${result.excelPath}`);
  render();
}

function parseToolTextResult(text: string): ToolResult {
  return JSON.parse(text) as ToolResult;
}

function getExcelPathFromUrl(): string | null {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("excelPath");
  } catch {
    return null;
  }
}

function setExcelPathInUrl(excelPath: string) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("excelPath", excelPath);
    history.replaceState(null, "", u.toString());
  } catch {
    // ignore
  }
}

async function loadFromLocalApi() {
  const excelPath = (excelPathInput.value || getExcelPathFromUrl() || "L:/System/Downloads/data.xlsx").trim();

  // 1) Try local preview server API (works in VS Code Simple Browser)
  try {
    const apiUrl = new URL("./api/quarter_data", window.location.href);
    apiUrl.searchParams.set("excelPath", excelPath);
    showStatus("Loading from local server…");
    const res = await fetch(apiUrl.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`Local API error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as ToolResult;
    normalizeAndRender(data);
    return;
  } catch {
    // fall through
  }

  // 2) Static hosting fallback (GitHub Pages): docs/data.json
  const staticUrl = new URL("./data.json", window.location.href);
  showStatus("Loading published data.json…");
  const res2 = await fetch(staticUrl.toString(), { method: "GET" });
  if (!res2.ok) throw new Error(`Static data.json error: ${res2.status} ${res2.statusText}`);
  const data2 = (await res2.json()) as ToolResult;
  normalizeAndRender(data2);
}

async function loadData() {
  const excelPath = (excelPathInput.value || "L:/System/Downloads/data.xlsx").trim();
  if (!excelPath) return;
  setExcelPathInUrl(excelPath);

  stopPlaying();
  setTooltip(false);

  if (mode === "web") {
    await loadFromLocalApi();
    return;
  }

  // MCP mode
  if (!appRef) return;
  showStatus("Loading…");
  const result = await appRef.callServerTool({
    name: "quarter_data",
    arguments: { excelPath },
  });
  const text = result?.content?.find((c: any) => c.type === "text")?.text;
  if (!text) throw new Error("Tool returned no text content.");
  normalizeAndRender(parseToolTextResult(text));
}

async function init() {
  await loadPublishedDefaults();

  playBtn.addEventListener("click", () => startPlaying());
  pauseBtn.addEventListener("click", () => stopPlaying());
  slider.addEventListener("input", () => {
    stopPlaying();
    render();
  });

  yScaleSel.addEventListener("change", () => {
    render();
  });

  // Initialize Excel path from URL if present
  const urlExcelPath = getExcelPathFromUrl();
  if (urlExcelPath) excelPathInput.value = urlExcelPath;
  else excelPathInput.value = "L:/System/Downloads/data.xlsx";

  loadBtn.addEventListener("click", () => {
    loadData().catch((e: any) => showStatus(`Load failed: ${e?.message ?? String(e)}`));
  });

  excelPathInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      loadData().catch((err: any) => showStatus(`Load failed: ${err?.message ?? String(err)}`));
    }
  });

  applyColorBtn.addEventListener("click", () => {
    if (!toolData || !selectedCategory) return;
    const map = loadColorOverrides();
    const candidate = colorHex.value.trim() || colorPicker.value.trim();
    if (!isValidHexColor(candidate)) {
      showStatus("Invalid color. Use #RRGGBB.");
      return;
    }
    map[selectedCategory] = candidate.toUpperCase();
    saveColorOverrides(map);
    render();
  });

  resetColorsBtn.addEventListener("click", () => {
    selectedCategory = null;
    legendEditor.style.display = "none";
    saveColorOverrides({});
    render();
  });

  resetOrderBtn.addEventListener("click", () => {
    saveCategoryOrder([]);
    render();
  });

  downloadDefaultsBtn.addEventListener("click", () => {
    if (!toolData) return;

    const payload: PublishedDefaults = {
      colorsByCategory: loadColorOverrides(),
      categoryOrder: loadCategoryOrder(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "published-defaults.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showStatus("Downloaded published-defaults.json. Put it in data/ and run build:pages.");
  });

  colorPicker.addEventListener("input", () => {
    colorHex.value = colorPicker.value.toUpperCase();
  });

  const ro = new ResizeObserver(() => render());
  ro.observe(document.getElementById("chartWrap")!);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPlaying();
  });

  const app = new App({ name: "Quarter Chart", version: "0.1.0" });
  appRef = app;

  app.onhostcontextchanged = (ctx: HostContext) => {
    if (ctx.safeAreaInsets) {
      const { top, right, bottom, left } = ctx.safeAreaInsets;
      document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
    }
    if (ctx.theme) applyDocumentTheme(ctx.theme as any);
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
    if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  };

  app.ontoolresult = (res: any) => {
    // Expect server to return JSON as plain text in content.
    const text = res?.content?.find((c: any) => c.type === "text")?.text;
    if (!text) {
      showStatus("Tool returned no text content.");
      return;
    }
    try {
      normalizeAndRender(parseToolTextResult(text));
    } catch (e: any) {
      showStatus(`Failed to parse tool result: ${e?.message ?? String(e)}`);
    }
  };

  app.ontoolinput = () => {
    showStatus("Loading…");
  };

  // If we are running inside an MCP host, connect will succeed and the host will provide tool results.
  // If we are running in a normal browser (VS Code Simple Browser), connect will fail — fall back to a local HTTP API.
  try {
    await app.connect();
    mode = "mcp";

    // Fallback trigger: some hosts won't auto-run tools until requested.
    try {
      const excelPath = (excelPathInput.value || getExcelPathFromUrl() || "L:/System/Downloads/data.xlsx").trim();
      const result = await app.callServerTool({
        name: "quarter_data",
        arguments: { excelPath },
      });

      const text = result?.content?.find((c: any) => c.type === "text")?.text;
      if (text) normalizeAndRender(parseToolTextResult(text));
    } catch (e: any) {
      showStatus(`Waiting for host to run tool: ${e?.message ?? String(e)}`);
    }
  } catch {
    mode = "web";
    await loadFromLocalApi();
  }
}

init().catch((e) => {
  showStatus(`Init failed: ${e?.message ?? String(e)}`);
});
