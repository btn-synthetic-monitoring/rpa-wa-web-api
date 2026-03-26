# rpa-wa-web-api (Bun Setup)

## Requirements
- Bun 1.x
- Node.js 20+ (runtime for `whatsapp-web.js` + Puppeteer)
- Google Chrome/Chromium (needed by `whatsapp-web.js` / Puppeteer)

## Setup
1. Install dependencies:
   ```bash
   bun install
   ```
2. Create env file:
   ```bash
   cp .env.example .env
   ```
3. Run in development mode:
   ```bash
   bun run dev
   ```
   `bun run dev` will execute `tsx` (Node runtime), which is more stable for Puppeteer.

## Build & Run
```bash
bun run build
bun run start
```

## Troubleshooting
- If you run `bun --watch src/server.ts` directly, Puppeteer may timeout when connecting to browser. Use `bun run dev` instead.
- Bot only processes group commands. To limit allowed groups, set `ALLOWED_GROUP_IDS` in `.env` (comma-separated). If empty, all groups are allowed.
- This service forces a pinned WhatsApp Web version to reduce breakage from upstream changes. Override with `WA_WEB_VERSION` if needed.
- If browser is not detected, set `PUPPETEER_EXECUTABLE_PATH` in `.env`.
- You can also override Puppeteer args with `PUPPETEER_ARGS`, example:
  ```env
  PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox
  ```
- If `/status` or `/report` command fails, set Python/script paths in `.env`:
  ```env
  PYTHON_PATH=python3
  STATUS_SCRIPT_PATH=/path/to/get_status_report.py
  STATUS_IMAGE_PATH=/path/to/dashboard_report.png
  REPORT_SCRIPT_PATH=/path/to/get_success_report.py
  REPORT_PROJECT_ROOT=/path/to/python/project/root
  ```
