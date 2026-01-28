# mcp-quarter-chart

MCP App that visualizes `data.xlsx` as an interactive **stacked bar chart** (Kategorie) over **Quartal**, showing a rolling **12-quarter window**.

## What it expects in Excel

First sheet with columns:
- `Quartal` (e.g. `2020-Q1`)
- `Kategorie` (category name)
- `Anzahl Anschlüsse` (numeric value)

Default path:
- `L:/System/Downloads/data.xlsx`

## Build UI

From PowerShell (note the `.cmd` due to execution policy):
- `npm.cmd run build:ui`

## Run server

- `npm.cmd run serve`

Or build + run:
- `npm.cmd run start`

## Preview in VS Code Simple Browser (local web server)

This runs a tiny HTTP server that serves the built UI at `/` and a JSON endpoint at `/api/quarter_data`.

- `npm.cmd run start:web`

Then open:
- `http://127.0.0.1:5179/` (default)

If you see `EADDRINUSE`, it means the port is already taken. The server will automatically try the next free port (5180, 5181, …) and print the URL it picked.

You can also force a port:
- PowerShell: `$env:PORT=5180; npm.cmd run start:web`

Optional: override the Excel path:
- `http://127.0.0.1:5179/?excelPath=L:/System/Downloads/data.xlsx`

## Publish on GitHub Pages (shareable URL)

Important: GitHub Pages is static hosting. It cannot read your local Excel path.
To publish, you must include the data in the repo (we export it as `docs/data.json`).

1) Put your Excel file into the repo:
- `data/data.xlsx`

Optional (publish your default colors + stack order):
- In the running UI, set colors/order the way you want, then click **Download defaults**.
- Save the downloaded file into the repo as `data/published-defaults.json`

2) Generate the Pages site:
- `npm.cmd run build:pages`

This writes:
- `docs/index.html`
- `docs/data.json`
 - `docs/published-defaults.json` (only if you added `data/published-defaults.json`)

3) Push to GitHub, then enable Pages:
- Repo Settings → Pages → Build and deployment → Source: `Deploy from a branch`
- Branch: `main` (or `master`) and folder: `/docs`

Your site will be available at:
- `https://<your-username>.github.io/<repo-name>/`

## Tool

- `quarter_data` (optional arg `excelPath`) returns a JSON payload used by the UI.
