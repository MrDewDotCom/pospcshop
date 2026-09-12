# CLAUDE.md — PC Shop Manager

Back-office system for small/medium computer shops in Thailand. Sold as a one-time purchase and
installed per shop. Runs **locally and fully offline** on the shop's Windows PC and is used via browser
(phones on the shop WiFi connect over LAN). Phase 7 will wrap it in Electron.

The detailed plan (schema, endpoints, screens, risks) is in [docs/PLAN.md](docs/PLAN.md). Read it before
starting any phase. When a decision there changes, update PLAN.md in the same commit.

## How to work with the user

- Work **one phase at a time** (phases are listed in PLAN.md). At the end of each phase, STOP and give:
  a summary of what was done, step-by-step test instructions the user can follow, and the concepts they
  should understand. Wait for confirmation before starting the next phase.
- The user is an intermediate developer. Briefly explain architectural decisions. If you see a better
  option than the spec, propose it with reasoning **before** implementing it.
- **Do not add dependencies** beyond the approved list (PLAN.md §3) without asking first.
- Make one git commit per sub-task (PLAN.md §15 lists the Phase 1 sub-tasks).
- Talk to the user in **English** (changed from Thai at the user's request). Write code, identifiers,
  and code comments in **English**.
- Every user-facing string in the app must be in **Thai**.

## Current status

- Phase 0 (planning): approved. Decisions are in PLAN.md §1.
- Phase 1: in progress (sub-tasks in PLAN.md §15).
- This build is a **demo** for a prospective client. Keep scope tight; tax features are deferred.

## Key product decisions (details in PLAN.md §1)

- **Stock changes only on payment or an explicit user confirmation** (confirm checkout, goods receipt,
  build assembly, adjustment, restocking a return, void). Carts, build drafts, presets, and quotes never
  touch or reserve stock.
- **Staff never touch money.** Staff may create products with non-money fields only (they start as
  "awaiting price", `price_satang = NULL`, and can't be sold). Afterwards staff may edit only product
  images, description, and specs. Builds get an owner-set package price instead of a discount. Selling price,
  regular price, cost, and fees are owner-only and change only through dedicated owner endpoints
  (e.g. `PUT /products/:id/pricing`). The staff update schema is `.strict()`.
- **No manual discounts** (no staff discounts, no POS line/bill discounts). A discount is a product price
  reduction: `regular_price_satang` > `price_satang` shows a "-X%" badge (percent rounded down).
  Lowering a price auto-keeps the old price as the regular price.
- **Payment is simple:** before finalizing, pick cash or transfer/PromptPay and type the amount received.
  Cash shows change; a transfer amount must equal the total. One payment per sale, no card, split, or deposits.
- **Returns:** a returned item goes into quarantine (status "Returned", `disposition='pending'`) with no
  stock change; restocking/claiming/writing off is a separate explicit action.
- **Tags:** automatic tags derived in `shared/tags.ts` (condition, warranty type/period, discount, returned,
  stock, awaiting price) plus owner-defined custom tags.
- **Goods receipts (the one exception to "staff never touch money"):** staff may type the supplier's unit
  cost (write-only; they can never read it back). Staff receipts are `cost_status='unverified'` until the
  owner confirms or corrects each line. Stock goes in immediately on confirmation.
- **No VAT / tax invoices** in this version. Prices are final. Keep VAT addable as one step in `shared/pricing.ts`.
- **Receipts are online documents** (PNG for LINE/Messenger + A4 PDF). No printing and no thermal layout.
- Costing: moving weighted average per product; document lines snapshot the cost.

## Stack

TypeScript everywhere. npm workspaces: `shared/`, `server/`, `web/`.

- web: React + Vite, Tailwind v4, shadcn/ui, TanStack Query, React Hook Form + Zod, react-router,
  Recharts, react-konva (Phase 4), html-to-image + jsPDF, qrcode, promptpay-qr
- server: Fastify, better-sqlite3 + Drizzle ORM (+ drizzle-kit migrations), Zod via our own
  `server/src/lib/zod.ts` (validator compiler + `ZodTypeProvider`; use `app.withTypeProvider<ZodTypeProvider>()`)
- shared: Zod schemas, pricing math, permissions, spec definitions, compatibility rules. Exported as TS
  source (no build step); consumed by both server and web.
- tests: Vitest (unit tests in shared, integration tests in server via `app.inject()` + in-memory SQLite)
- fonts: `@fontsource/*` only; never use a CDN

## Non-negotiable technical rules

1. **Money = integer satang.** Never use floats for money. Column names end in `_satang`, TS fields end in `Satang`.
   Percentages stored in the DB are basis points (5% = 500). Round only via `divRound` in `shared/money.ts`
   (half-up). Display as baht with thousand separators.
2. **Snapshots.** Every sale/build/quote line stores the name, SKU, unit price, unit cost, and warranty at
   that moment. Never recompute historical documents from current product data.
3. **Stock ledger.** The only code allowed to change stock is `stockService.move()` (server/src/services/stock.service.ts),
   always called inside a DB transaction. Invariants: `products.on_hand = SUM(stock_movements.qty_change)`, and
   for serial products `on_hand = COUNT(serial_items WHERE status='in_stock')`. No negative stock unless
   `allow_negative_stock` is enabled; serial-tracked stock can never go negative.
4. **better-sqlite3 transactions are synchronous.** Never `await` inside `db.transaction()`.
5. **Void, never delete** financial documents. A void requires a reason, restores stock and serial statuses,
   voids payments, and writes an audit log entry, all in one transaction. Master data uses `archived_at`.
6. **Cost/profit is owner-only, enforced on the server.** Responses go through `respondByRole()` with
   separate Zod schemas per role (whitelist: the staff schema simply lacks cost fields). Forbidden keys
   are listed in `shared/permissions.ts`. The "no cost leak" integration test
   (`server/test/no-cost-leak.test.ts`) calls every GET route from `app.routeTable` as staff; a new GET
   route with params needs an entry in its `fixtures()`. The "no money write" test fails for any route
   whose body has a `…Satang` field unless it's guarded by an owner-only `requirePermission()` preHandler
   (route-level, so the route table sees it) or listed in `STAFF_MONEY_WRITE_EXCEPTIONS`. Also guard
   indirect leaks: sorting/filtering by cost, dashboard, movement history, goods receipts, backups, post data.
7. **Time.** Store UTC epoch milliseconds. Display in Asia/Bangkok (fixed UTC+7) with an optional
   Buddhist Era year, via helpers in `shared/datetime.ts`. "Today" and document-number periods use Bangkok dates.
8. **Data dir is separate from the app dir.** Use `PCSHOP_DATA_DIR`; otherwise dev uses `./data` and prod uses
   `%APPDATA%\PCShopManager`. It contains shop.db, uploads/, backups/, backup-state.json, config.json, and logs/.
9. **100% offline.** No CDNs, external APIs, or remote fonts or images.
10. **LAN is plain http (not a secure context).** Camera access uses `<input type="file" accept="image/*" capture>`
    (never getUserMedia). Don't rely on the Clipboard API, Web Share API, or `crypto.randomUUID()` in the browser;
    a download button is always the primary way to export.
11. **Images:** resize on the client (longest side ≤ 1600px, JPEG 0.82, plus a 320px thumbnail) before upload.
    The server validates magic bytes and size, and stores files by sha256.
12. **Thai text:** every export path (PNG/PDF/canvas) must be tested with `ผู้ใหญ่ น้ำแข็ง ที่นี่ ฟรี!`.
    Wait for `document.fonts.ready` before exporting. In Konva, wrap Thai text yourself using `Intl.Segmenter`.
13. **Backups** use the SQLite online backup API (`db.backup()`), never a raw file copy. Always back up before
    migrations and before a restore.
14. **Barcode scanners** act as keyboards. In the POS/lookup search, pressing Enter does an exact lookup, and
    if nothing is found, convert Thai Kedmanee characters to QWERTY and retry.

## Conventions

- Server modules: `server/src/modules/<name>/{routes.ts,service.ts}`. Keep routes thin and put logic in services.
  Cross-module logic goes in `server/src/services/`.
- Web features: `web/src/features/<name>/`. Shared UI goes in `web/src/components/`, shadcn primitives in `components/ui/`.
- API: `/api/*`, JSON only. Errors are `{ error: { code: 'UPPER_SNAKE', message: '<Thai message>', details? } }`.
  Lists return `{ items, total }` with `?page=&pageSize=&q=`. Dates are ISO-8601 UTC strings.
- Non-GET requests must send the header `X-PCShop: 1` (CSRF guard). Auth uses the httpOnly `sid` session cookie.
- Every `/api` and `/uploads` route requires login by default. Mark exceptions with `config: { public: true }`.
  Guard owner actions with `preHandler: requirePermission('...')` (server/src/plugins/auth.ts).
- Throw `AppError` helpers from `server/src/lib/errors.ts` (`badRequest`, `forbidden`, `notFound`, `conflict`, …)
  with Thai messages. The error handler formats them. The web `api` wrapper surfaces `error.message` as-is.
- Server tests use `createTestApp()` / `setUpShop()` / `TestClient` from `server/test/helpers.ts`
  (in-memory DB, cookie + CSRF header handled for you).
- Enums live in `shared/enums.ts`, and DB enums use text columns with CHECK constraints.
- IDs are integer autoincrement.
- Permissions come from `can(role, action)` in `shared/permissions.ts`. Check them on the server; the UI only hides things.
- Business math (totals, discounts, profit) lives in `shared/pricing.ts` as pure functions with unit tests.
- Every stock-changing action in the UI goes through a confirmation dialog that summarizes its stock effect.
- Compatibility rules (Phase 3) go one per file in `shared/compat/rules/` and are registered in `registry.ts`.

## Commands

Run from the repo root (Node ≥ 22.12; developed on Node 24, Windows).

| Command                             | What it does                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`                       | Fastify on :3300 (tsx watch) + Vite on :5173 (proxies `/api`, `/uploads`). Open :5173. |
| `npm run build`                     | Builds `web/dist` (Vite) and bundles the server into `server/dist/main.js` (esbuild).  |
| `npm start`                         | Production: one process on :3300 serving the API and the built web app.                |
| `npm test`                          | Vitest (projects: `shared`, `server`). `npm run test:watch` for watch mode.            |
| `npm run typecheck`                 | `tsc --noEmit` in every workspace.                                                     |
| `npm run lint`                      | ESLint (flat config, typescript-eslint + react-hooks).                                 |
| `npm run format`                    | Prettier (+ Tailwind class sorting). `format:check` to verify.                         |
| `npx shadcn@4.21.0 add <component>` | Run inside `web/` to add a shadcn component.                                           |
| `npm run reset-password -- <user>`  | Emergency reset: prints a temporary password (`--prod` targets `%APPDATA%` data).      |
| `npm run seed`                      | Loads the sample catalogue into an already set-up shop (`--prod` for `%APPDATA%`).     |

Database migrations: edit `server/src/db/schema/*`, then run `npx drizzle-kit generate --name <short_name>`
**inside `server/`** (npm doesn't forward `--name` through the root script). Commit the generated
`server/drizzle/*` files. The server applies pending migrations at startup. Never edit a committed migration.

Notes:

- TypeScript is pinned to `~6.0.3` (typescript-eslint doesn't support 7.x yet). TS 6 defaults `types` to `[]`,
  so each tsconfig lists its types explicitly.
- `shared` is consumed as TS source. The server build aliases `@pcshop/shared` to `shared/src` so it's bundled in.
- In production, `main.ts` serves `../../web/dist` relative to the bundle (`__PRODUCTION__` is defined by the build).
