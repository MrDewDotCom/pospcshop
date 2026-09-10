# PC Shop Manager — Plan (Phase 0)

> Status: **Approved. Phase 1 in progress.** All open questions are resolved (see §1.2).
> Project context: this build is a **demo** for a prospective client. Tax features (VAT, tax invoices)
> are deferred to a possible paid follow-up.

---

## Contents

1. [Decisions log and open questions](#1-decisions-log-and-open-questions)
2. [Proposals beyond the original spec](#2-proposals-beyond-the-original-spec)
3. [Tech stack and dependencies](#3-tech-stack-and-dependencies)
4. [Folder structure](#4-folder-structure)
5. [Runtime architecture](#5-runtime-architecture)
6. [Database schema](#6-database-schema)
7. [Core business logic](#7-core-business-logic)
8. [Auth and roles](#8-auth-and-roles)
9. [Main API endpoints](#9-main-api-endpoints)
10. [Screens](#10-screens)
11. [Documents, images, and Thai text](#11-documents-images-and-thai-text)
12. [Backup and restore](#12-backup-and-restore)
13. [Testing](#13-testing)
14. [Technical risks](#14-technical-risks)
15. [Phase 1 sub-tasks (one commit each)](#15-phase-1-sub-tasks)

---

## 1. Decisions log and open questions

### 1.1 Decisions

| #        | Topic                                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Source                 |
| -------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Q1       | When stock changes                     | **Stock changes only on payment or an explicit user confirmation.** Nothing implicit: the cart, build drafts, presets, and quotes never touch stock. The actions that change stock are: confirm checkout (POS / convert quote), confirm goods receipt, confirm build assembly, confirm stock adjustment, confirm restocking a returned item, void, and later confirm repair parts. Each one shows a confirmation dialog summarizing the stock effect.                                                                                                                                                                                                 | Owner                  |
| Q2 / OQ1 | Staff entering costs on goods receipts | **Option (a), the single exception to Q7:** staff **may enter the supplier's unit cost** when receiving. A receipt saved by staff has `cost_status = 'unverified'`, and staff can never see those costs again after saving (write-only). The owner must review the receipt and **confirm or correct** each line before it becomes verified. Receipts created by the owner are verified immediately. Quantities and serials enter stock **immediately** when the receipt is confirmed, so the items can be sold while the cost awaits review. The _product's_ cost field itself stays owner-only.                                                      | Owner                  |
| Q3       | Costing method                         | Moving weighted average per product, with the cost snapshotted on each document line. Each serial item also keeps its own actual cost for reference.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Default (not objected) |
| Q4       | Tax / VAT                              | **Out of scope for this version.** No VAT, no tax invoices, no tax IDs. Prices are final prices. `shared/pricing.ts` is structured so VAT can be added later as one extra step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Owner                  |
| Q5       | Receipts                               | The receipt is an **online document** sent to the customer (LINE/Messenger) so they can see what they bought. Output is PNG (primary) and A4 PDF. No printer support, no thermal layout, and no print button.                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                  |
| Q6       | Discounts                              | **There is no staff discount feature, and there are no manual discounts at checkout.** A discount is a **product price reduction**: when the owner lowers a product's selling price, the system keeps the previous price as the _regular price_ (`regular_price_satang`) and automatically shows a **"-20%" badge** wherever the product appears (list, detail, POS, stock lookup, receipt, and post images in Phase 4). This **replaces the original spec's per-line/whole-bill POS discounts.** How builds get a package price is covered in **OQ2**.                                                                                               | Owner                  |
| Q7       | Staff product editing                  | Staff may edit **only product images and product details** (description + spec details). Staff can never touch anything money-related: selling price, regular price, cost, or any other financial field. Name, category, SKU/barcode, warranty, condition, and tags are owner-only. Whether staff can create products is covered in **OQ3**.                                                                                                                                                                                                                                                                                                          | Owner                  |
| Q8       | Returns + tags                         | **Basic returns:** a customer's returned item is received back against the original sale and gets the status **"Returned"** (quarantine: it's tracked but not sellable). From there, someone explicitly decides to **restock** it (back into sellable stock, with a "was returned" mark), **send it to claim**, or **write it off**. A refund amount is calculated from the original receipt. **Product tags:** automatic tags (condition, warranty type/period, discount badge, returned units, stock status, awaiting price) plus custom tags the owner defines (e.g. "Open box", "กล่องไม่สวย"), shown wherever a product is viewed. See §7.8–7.9. | Owner                  |
| Q9       | Payment                                | **Simple:** before a sale is finalized, the user picks **Cash** or **Transfer/PromptPay** and enters the **amount received**. Cash shows the change automatically. For a transfer, the entered amount must equal the bill total, which serves as an explicit confirmation of the amount received. The PromptPay QR code for the total appears on the transfer step. No card method, no split payments, no deposits or unpaid balances in this version (the `payments` table can support them later).                                                                                                                                                  | Owner                  |
| Q10      | Seed data                              | Optional checkbox in the first-run wizard, plus a "clear sample data" action (only allowed before any sale exists).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Default                |
| Q11      | Package manager                        | npm workspaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Approved               |
| Q12      | Extra dependencies                     | The list in §3.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Approved               |
| —        | Language                               | Communicate with the owner in **English**. App UI stays in **Thai**. Code, identifiers, and comments in English.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner                  |

### 1.2 Resolved open questions

**OQ1 — Staff costs on goods receipts: option (a).** See Q2 / OQ1 in §1.1.

**OQ2 — Build package prices: accepted as recommended.** A build's _regular price_ = sum of part prices +
assembly fee (computed automatically). The **owner** can set a lower **package price**, and the build shows the
same "-X%" badge. Staff can create builds but can't change the package price or the assembly fee (the default
fee comes from settings). There's no manual discount anywhere else (POS bills, quotes). This replaces the
original spec's build/quote "discount". It can be revisited at the start of Phase 3.

**OQ3 — Staff creating products: accepted as recommended.** Staff can create a product with non-money fields
only (name, category, brand, barcode, specs, images, description). It starts as **"awaiting price"** and can't
be sold until the owner sets the price. After creation, staff can edit only its images, description, and specs.

---

## 2. Proposals beyond the original spec

| #   | Proposal                                                                                                                                                                                                                                        | Why                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Password hashing with `node:crypto` scrypt** instead of bcrypt/argon2                                                                                                                                                                         | No extra native module (easier Electron packaging) and still secure                                                                                                         |
| P2  | **Cookie sessions stored in SQLite** instead of JWT                                                                                                                                                                                             | Deactivating a staff account ends their sessions immediately, and no token sits in localStorage                                                                             |
| P3  | **Whitelist cost hiding:** every response is parsed through a role-specific Zod schema (the staff schema simply has no cost fields), plus an **automated test that calls every GET route as staff** and scans the whole JSON for forbidden keys | A blacklist is easy to forget. Whitelist plus the test catches leaks from new endpoints automatically.                                                                      |
| P4  | **Money fields are never part of the general product update API.** Prices change only via a dedicated owner-only endpoint (`PUT /products/:id/pricing`), and the staff update schema is `.strict()` with only `description` and `specs`         | Q7 is enforced by the API's shape, not by remembering to check a field                                                                                                      |
| P5  | **Trade-in credit (Phase 3/6) is recorded as a system credit row on the sale, not a discount**                                                                                                                                                  | Revenue stays correct, and the traded-in item later enters inventory with a cost equal to the credit, so profit is accurate                                                 |
| P6  | **Barcode scanner vs. Thai keyboard layout**                                                                                                                                                                                                    | If Windows is set to the Thai layout, a scanner types "ๅ/-ภถุ…" instead of "12345…". When the lookup fails, the system maps Kedmanee characters back to QWERTY and retries. |
| P7  | **Scanning a serial number in the POS** adds the product with that serial preselected                                                                                                                                                           | Faster, and fewer wrong-serial mistakes                                                                                                                                     |
| P8  | **Audit log** (void, price change, stock adjustment, cost review, return decisions, restore, settings, login)                                                                                                                                   | The owner can trace who did what, and it's cheap to store                                                                                                                   |
| P9  | **Automatic backup before running DB migrations**                                                                                                                                                                                               | A failed migration after an app update never loses data                                                                                                                     |
| P10 | **Offline owner password recovery:** a one-time recovery code shown at setup, plus a `npm run reset-password` CLI                                                                                                                               | There's no email to recover a password with                                                                                                                                 |
| P11 | **Custom Thai line wrapping for the canvas** with `Intl.Segmenter` (built into the browser, no dependency)                                                                                                                                      | Konva wraps on spaces, but Thai has no spaces between words, so Konva may split vowels and tone marks from their consonants (Phase 4)                                       |
| P12 | **Build states draft → assembled → sold** (assembled only through an explicit confirmation, per Q1)                                                                                                                                             | Supports pre-built machines on the shelf and matches the "used in build" movement type in the spec                                                                          |
| P13 | Money columns always end in `_satang` (TS: `priceSatang`)                                                                                                                                                                                       | The unit is visible in the name, which prevents ×100 bugs                                                                                                                   |
| P14 | No server-side image processing (no `sharp`). The client resizes and uploads both the full image and a thumbnail.                                                                                                                               | Fewer native dependencies, and no CPU load on the shop PC                                                                                                                   |
| P15 | **Goods-receipt cost review** (Q2): staff-entered costs are provisional until the owner verifies them. Corrections adjust the average cost and are logged.                                                                                      | Balances staff convenience with the owner's control over cost accuracy (confirmed as OQ1 a)                                                                                 |
| P16 | **Returned items go into quarantine** (status "Returned", not sellable) until someone explicitly restocks, claims, or writes them off                                                                                                           | A returned item may be faulty; it shouldn't be sold again automatically. This also matches Q1 (stock changes only on explicit confirmation).                                |
| P17 | **Warranty type as a structured field** (`distributor` = ประกันศูนย์ไทย, `shop` = ประกันร้าน, `none` = ไม่มีประกัน) next to `warranty_months`, displayed as a tag                                                                               | Receipts and warranty lookups need it as data, not free text, and "ประกันศูนย์ vs. ประกันร้าน" matters a lot to Thai PC buyers                                              |
| P18 | **Discount badge % is rounded down** to a whole number (100 → 79 shows "-21%", 1,990 → 1,590 shows "-20%")                                                                                                                                      | Never overstates the discount to customers                                                                                                                                  |
| P19 | **Receipts show savings:** lines with a price reduction show the regular price struck through plus the badge, and the receipt shows "ประหยัดไป ฿X"                                                                                              | Customers like seeing it, and it uses data we already snapshot                                                                                                              |
| P20 | **Price history table** (`product_price_history`) shown on the product page                                                                                                                                                                     | The owner can see when a product was reduced and back; it supports the "original price" requirement                                                                         |

---

## 3. Tech stack and dependencies

### 3.1 From the spec

TypeScript, React + Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form + Zod, Fastify,
better-sqlite3 + Drizzle ORM, react-konva/Konva (Phase 4), Recharts (Phase 2), promptpay-qr, qrcode,
html-to-image, jsPDF, Vitest, @fontsource (Thai fonts)

### 3.2 Additional (approved)

| Package                                                                                                                          | Where  | Purpose                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------- |
| `@fastify/cookie`                                                                                                                | server | Session cookie                                |
| `@fastify/static`                                                                                                                | server | Serve the built frontend in production        |
| `@fastify/multipart`                                                                                                             | server | Image uploads                                 |
| `fastify-type-provider-zod`                                                                                                      | server | Validate requests with the shared Zod schemas |
| `drizzle-kit` (dev)                                                                                                              | server | Generate SQL migrations                       |
| `tsx` (dev)                                                                                                                      | server | Run TS in dev with watch                      |
| `esbuild` (dev)                                                                                                                  | server | Bundle the server into a single file          |
| `react-router`                                                                                                                   | web    | Routing                                       |
| `@hookform/resolvers`                                                                                                            | web    | React Hook Form ↔ Zod                         |
| `@tailwindcss/vite`                                                                                                              | web    | Tailwind v4 plugin                            |
| shadcn/ui's own dependencies: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `cmdk` | web    | Part of shadcn/ui                             |
| `concurrently` (dev)                                                                                                             | root   | `npm run dev` runs server and web together    |
| `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`, `prettier-plugin-tailwindcss` (dev)                      | root   | Lint and format                               |

**Notes from the Phase 1 scaffold:**

- **TypeScript is pinned to `~6.0.3`**, not 7.x. TypeScript 7 (the new Go-based compiler) is out, but
  typescript-eslint supports only `<6.1.0`. We can upgrade once typescript-eslint supports it.
- The current shadcn CLI uses its own **`cn`** package (a drop-in replacement for `clsx` + `tailwind-merge`)
  and **`tw-animate-css`** for animations. Its **`shadcn`** package (devDependency) provides `shadcn/tailwind.css`.
  These are part of shadcn/ui.
- `@vitejs/plugin-react`, `@eslint/js`, and the `@types/*` packages are standard parts of React + Vite, ESLint,
  and TypeScript.
- The UI font is `@fontsource/ibm-plex-sans-thai`. The document font (Sarabun) will be added in Phase 2.

**I'll ask again when we reach the relevant phase:** `electron`, `electron-builder`, `@electron/rebuild`
(Phase 7), and extra post fonts such as Kanit or Prompt via @fontsource (Phase 4).

**No dependency needed for:** password hashing (`node:crypto`), backup scheduling (`setInterval`),
Thai date/B.E. formatting (`Intl.DateTimeFormat`), baht-in-words text (hand-written and tested),
Thai word segmentation (`Intl.Segmenter`), login rate limiting (in-memory), and logging (pino, which ships with Fastify).

---

## 4. Folder structure

```
d:\ComputerShop\                       (repo root, npm workspaces)
├── package.json                       workspaces: shared, server, web; scripts dev/build/start/test/lint
├── tsconfig.base.json
├── eslint.config.js / .prettierrc
├── .gitignore / .gitattributes        (LF line endings)
├── CLAUDE.md
├── docs/PLAN.md
├── data/                              ← dev data dir (git-ignored)
│
├── shared/                            used by both client and server; exported as TS source (no build step)
│   └── src/
│       ├── index.ts
│       ├── money.ts                   satang ⇄ baht, formatting, divRound
│       ├── bahttext.ts                amount in Thai words, e.g. "หนึ่งพันบาทถ้วน"
│       ├── pricing.ts                 line/bill totals, discount badge %, savings, profit, change (pure functions)
│       ├── tags.ts                    derive automatic product tags from product data
│       ├── datetime.ts                UTC ⇄ Asia/Bangkok, B.E. years, "today"/"this month" ranges
│       ├── docNumber.ts               document number formatting
│       ├── barcode.ts                 Thai Kedmanee → QWERTY mapping
│       ├── permissions.ts             role → permission table, can(), forbidden cost keys
│       ├── enums.ts                   all status/type constants
│       ├── schemas/                   Zod request/response schemas per module
│       ├── specs/                     spec field definitions per category kind (drive forms + validation)
│       │   └── cpu.ts mainboard.ts ram.ts gpu.ts storage.ts psu.ts case.ts cooler.ts monitor.ts
│       └── compat/                    (Phase 3) compatibility rules
│           ├── types.ts registry.ts
│           └── rules/ cpuSocket.ts ramType.ts psuWattage.ts caseFormFactor.ts ...
│
├── server/
│   ├── drizzle/                       generated SQL migrations (committed)
│   ├── scripts/                       reset-password.ts, seed.ts
│   ├── test/                          integration tests (Fastify inject + in-memory SQLite)
│   └── src/
│       ├── main.ts                    CLI entry: read config → startServer()
│       ├── app.ts                     buildApp() / startServer({ dataDir, port, host }) ← Electron calls this
│       ├── config.ts                  data dir resolution, config.json
│       ├── db/
│       │   ├── schema/                Drizzle schema, one file per module
│       │   ├── client.ts              open/close/reopen connection (needed by restore)
│       │   ├── migrate.ts
│       │   └── seed/
│       ├── plugins/                   auth (session, requirePermission), error handler, static files
│       ├── lib/                       respondByRole.ts, network.ts (LAN IPs), files.ts, audit.ts
│       ├── services/                  cross-module business logic
│       │   ├── stock.service.ts       ← the ONLY code that changes stock
│       │   ├── numbering.service.ts
│       │   └── backup.service.ts
│       └── modules/                   each: routes.ts (thin) + service.ts (logic)
│           ├── auth/ setup/ users/ settings/ files/ categories/ tags/ products/
│           ├── suppliers/ goods-receipts/ stock/ serials/ backups/ audit/
│           ├── customers/ sales/ returns/ dashboard/   (Phase 2)
│           ├── builds/ quotes/ customer-devices/       (Phase 3)
│           ├── posts/                                  (Phase 4)
│           ├── repairs/ claims/                        (Phase 5)
│           └── trade-ins/                              (Phase 6)
│
└── web/
    ├── index.html  vite.config.ts
    └── src/
        ├── main.tsx  router.tsx  index.css
        ├── components/ui/             shadcn components
        ├── components/                layout, MoneyInput, MoneyText, PriceTag (price + struck regular + badge),
        │                              ProductTags, DateText, ImageUploader, ConfirmDialog …
        ├── lib/                       api.ts, queryClient.ts, imageResize.ts, exportImage.ts, useAuth.ts
        ├── documents/                 (Phase 2+) React document components: receipt, quote, return slip, repair slip …
        └── features/                  one folder per module (pages + components + hooks)
```

**Why this split:** `shared/` holds both the Zod schemas and the business math (pricing, tags, compat rules),
so the UI shows live totals and badges using exactly the same code the server uses, and the numbers on screen
and in the database always agree. `server/src/app.ts` exports `startServer()`, so Electron (Phase 7) can
import it and run everything in one process.

---

## 5. Runtime architecture

### Dev (`npm run dev`)

- `concurrently` runs two processes:
  - server: `tsx watch server/src/main.ts` on port **3300**
  - web: Vite on port **5173** (`host: true` so phones can connect), proxying `/api` and `/uploads` to 3300
- Dev data dir = `./data` in the repo root

### Production (`npm run build && npm start`)

- `web` builds to static files in `web/dist/`
- esbuild bundles `server` into `server/dist/main.js` (`better-sqlite3` stays external because it's native), and `server/drizzle/` is copied alongside it
- One process: Fastify listens on `0.0.0.0:3300` and serves `/api/*`, `/uploads/*`, and the SPA (any non-API path returns `index.html`)
- Data dir comes from the `PCSHOP_DATA_DIR` env var, otherwise `%APPDATA%\PCShopManager` (the same location Electron will use in Phase 7, so no migration is needed)

### Data dir (always separate from the app folder)

```
PCShopManager/
├── config.json         { "port": 3300 }  (optional, defaults apply)
├── shop.db             SQLite (WAL) + -wal/-shm files
├── uploads/            images named by sha256, sharded by the first 2 chars: uploads/ab/abcd…ef.jpg
├── backups/            default backup location (configurable, e.g. D:\ or a USB drive)
├── backup-state.json   last successful backup (kept outside the DB because restore replaces the DB)
└── logs/
```

### Startup sequence

1. Resolve the data dir and create missing folders
2. Open the DB with `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`
3. If migrations are pending and the DB already has data → **back up first**, then migrate
4. Check stock integrity (cache vs. ledger) and log a warning on mismatch
5. Start the backup scheduler (checks hourly whether today's backup has run)
6. Listen

---

## 6. Database schema

### 6.1 Conventions

- Primary keys: `id INTEGER` autoincrement (single shop with no sync, so UUIDs aren't needed)
- Timestamps: `INTEGER` Unix **milliseconds UTC** (Drizzle `mode: 'timestamp_ms'`). The API sends ISO-8601 UTC strings.
- Money: `INTEGER` satang, column names end in `_satang`
- Enums: `TEXT` with a `CHECK` constraint (Drizzle `text({ enum })`)
- Master data (products, customers, …) is never hard-deleted; use `archived_at`
- Financial documents are never deleted; they use `status='voided'` + `voided_at`, `voided_by`, `void_reason`
- Main tables have `created_at`, `updated_at`, and `created_by` where authorship matters
- Snapshots: document lines store the name, SKU, price, regular price, cost, and warranty at the moment the document was created

### 6.2 Main relationships

```mermaid
erDiagram
  users ||--o{ sessions : has
  categories ||--o{ products : contains
  products ||--o{ product_tags : tagged
  tags ||--o{ product_tags : applied
  products ||--o{ product_price_history : prices
  products ||--o{ stock_movements : ledger
  products ||--o{ serial_items : has
  suppliers ||--o{ goods_receipts : supplies
  goods_receipts ||--o{ goods_receipt_items : lines
  goods_receipt_items ||--o{ serial_items : received
  customers ||--o{ sales : buys
  customers ||--o{ customer_devices : owns
  sales ||--o{ sale_items : lines
  sales ||--o{ payments : paid_by
  sales ||--o{ sale_returns : returns
  sale_returns ||--o{ sale_return_items : lines
  sale_items ||--o{ sale_item_serials : serials
  serial_items ||--o{ sale_item_serials : sold_in
  builds ||--o{ build_items : parts
  builds |o--o| customer_devices : becomes
  quotes ||--o{ quote_options : options
  quote_options ||--o{ quote_items : lines
  customer_devices ||--o{ customer_device_parts : parts
```

### 6.3 Phase 1 tables — Foundation + Inventory

**users**

| Column                                | Type        | Notes                                                            |
| ------------------------------------- | ----------- | ---------------------------------------------------------------- |
| id                                    | int pk      |                                                                  |
| name                                  | text        | display name                                                     |
| username                              | text unique | stored lowercase                                                 |
| password_hash                         | text        | `scrypt$N$r$p$salt$hash`                                         |
| role                                  | text        | `owner` \| `staff` (at least one active owner must always exist) |
| is_active                             | int bool    |                                                                  |
| last_login_at, created_at, updated_at | int         |                                                                  |

**sessions**

| Column                               | Notes                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| id text pk                           | sha256 of the token (the DB stores only the hash; the cookie holds the raw token) |
| user_id → users                      |                                                                                   |
| created_at, last_seen_at, expires_at | 7-day sliding expiry                                                              |
| user_agent, ip                       | lets the owner see where logins come from                                         |

**shop_settings** (single row, id=1)
`shop_name`, `logo_file_id → files`, `address`, `phone`, `line_id`, `promptpay_id`, `receipt_footer`,
`use_buddhist_era` (bool), `allow_negative_stock` (bool), `default_assembly_fee_satang`, `backup_dir`,
`backup_keep_count` (default 14), `backup_hour` (0–23), `updated_at`

**document_sequences**

| Column              | Notes                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| doc_type text pk    | `sale`, `return`, `quote`, `goods_receipt`, `adjustment`, `repair`, `claim`, `trade_in`                      |
| format text         | e.g. `RC{YY}{MM}-{SEQ:4}` → `RC6909-0001` (`{YY}` uses B.E. when enabled)                                    |
| reset_policy        | `never` \| `yearly` \| `monthly`                                                                             |
| current_period text | e.g. `2026-09`                                                                                               |
| last_number int     | allocated inside the same transaction as the document (no gaps or duplicates; voided docs keep their number) |

**files**
`id`, `sha256` (unique, dedup), `path`, `thumb_path`, `mime`, `size_bytes`, `width`, `height`, `created_by`, `created_at`

**categories**
`id`, `name` (e.g. "ซีพียู (CPU)"), `kind` (`cpu`|`mainboard`|`ram`|`gpu`|`storage`|`psu`|`case`|`cooler`|`monitor`|`accessory`|`service`|`other`),
`sort_order`, `is_system` (built-in, can't be archived), `archived_at`
→ `kind` decides which spec form and which compatibility rules apply. A user-created category uses `other` or maps to an existing kind.

**products**

| Column                                                 | Notes                                                                                    | Who can edit                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| id, sku (unique), barcode (unique, nullable)           |                                                                                          | owner (and staff on create, per OQ3)                    |
| name, brand, category_id → categories                  |                                                                                          | owner (and staff on create, per OQ3)                    |
| description                                            | long text shown on the product page, usable in post captions                             | owner + **staff**                                       |
| specs (JSON text)                                      | e.g. `{"socket":"AM5","tdpWatt":65}`                                                     | owner + **staff**                                       |
| condition                                              | `new` \| `used`                                                                          | owner                                                   |
| warranty_type                                          | `distributor` (ประกันศูนย์ไทย) \| `shop` (ประกันร้าน) \| `none`                          | owner                                                   |
| warranty_months                                        | warranty period given to the customer                                                    | owner                                                   |
| supplier_warranty_months                               | default used when receiving                                                              | owner                                                   |
| price_satang (nullable)                                | current selling price; NULL = "awaiting price", can't be sold                            | **owner only, via pricing endpoint**                    |
| regular_price_satang (nullable)                        | the "original" price. When set and > price, the product is discounted and shows a badge. | **owner only, via pricing endpoint**                    |
| cost_satang                                            | moving average cost; **never visible to staff**                                          | system (receipts) / owner override via pricing endpoint |
| track_stock (bool)                                     | false for services/labor                                                                 | owner                                                   |
| serial_required (bool)                                 |                                                                                          | owner                                                   |
| min_stock                                              |                                                                                          | owner                                                   |
| on_hand                                                | **cache** of sellable stock, changed only by stock.service                               | system                                                  |
| notes, created_by, archived_at, created_at, updated_at |                                                                                          |                                                         |

**product_images**: `product_id`, `file_id`, `sort_order` (PK = product_id + file_id). Staff can edit.

**product_price_history**: `id`, `product_id`, `price_satang`, `regular_price_satang`, `changed_by`, `changed_at` (one row per pricing change; visible to everyone because prices are public)

**tags** (custom, owner-defined): `id`, `name` (e.g. "Open box", "กล่องไม่สวย", "ไม่มีกล่อง", "สินค้าแนะนำ"), `color` (from a fixed palette), `sort_order`, `archived_at`

**product_tags**: `product_id`, `tag_id` (PK = both). Owner only.

> Automatic tags (condition, warranty, discount badge, returned units, stock status, awaiting price) are
> **derived** by `shared/tags.ts` and are not stored. See §7.9.

**suppliers**: `id`, `name`, `contact_name`, `phone`, `line_id`, `address`, `notes`, `archived_at`

**goods_receipts**

| Column                                               | Notes                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| id, doc_no (unique)                                  |                                                                                                                           |
| supplier_id, supplier_invoice_no, received_at, notes |                                                                                                                           |
| status                                               | `posted` \| `voided`                                                                                                      |
| cost_status                                          | `unverified` \| `verified`. Staff-created receipts start `unverified`; owner-created receipts are `verified` immediately. |
| cost_verified_by, cost_verified_at                   |                                                                                                                           |
| total_cost_satang                                    | owner only                                                                                                                |
| created_by, voided_at, voided_by, void_reason        |                                                                                                                           |

**goods_receipt_items**
`id`, `goods_receipt_id`, `product_id`, `qty`, `unit_cost_satang` (nullable until entered; owner only), `line_total_satang` (owner only)

**serial_items**

| Column                                               | Notes                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| id, product_id, serial_no                            | unique (product_id, serial_no)                                                                                     |
| status                                               | `in_stock` \| `in_build` \| `sold` \| `customer_returned` \| `in_claim` \| `returned_to_supplier` \| `written_off` |
| was_returned (bool)                                  | set when a customer-returned unit is restocked; shows a "เคยถูกคืน" tag on the unit                                |
| unit_cost_satang                                     | actual cost of this unit (owner only)                                                                              |
| goods_receipt_item_id                                | nullable (trade-ins and opening stock have none)                                                                   |
| received_at, supplier_warranty_expires_at            |                                                                                                                    |
| build_id                                             | set while inside an assembled build                                                                                |
| sold_sale_item_id, sold_at, shop_warranty_expires_at | set on sale                                                                                                        |
| customer_device_id                                   | which customer machine it's in                                                                                     |
| notes                                                |                                                                                                                    |

**stock_movements** (ledger: insert-only, never updated or deleted)

| Column                       | Notes                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| id, product_id               |                                                                                                                                                |
| qty_change                   | +/−                                                                                                                                            |
| type                         | `opening` `receive` `sale` `build_consume` `build_release` `adjustment` `return_restock` `trade_in` `void` `repair_use` `claim_out` `claim_in` |
| ref_type, ref_id, ref_doc_no | link back to the source document                                                                                                               |
| unit_cost_satang             | owner only                                                                                                                                     |
| balance_after                | running balance, shown on the history page                                                                                                     |
| reason                       | required for `adjustment` and `void`                                                                                                           |
| performed_by, created_at     |                                                                                                                                                |

**stock_movement_serials**: `movement_id`, `serial_item_id`

**audit_logs**: `id`, `user_id`, `action` (e.g. `sale.void`, `product.pricing_change`, `goods_receipt.cost_verify`, `return.restock`, `backup.restore`), `entity_type`, `entity_id`, `detail` (JSON), `created_at`

### 6.4 Phase 2 tables — POS / receipts / returns

**customers**: `id`, `name`, `phone`, `phone_normalized` (indexed, used to warn about duplicates), `line_id`, `address` (optional), `notes`, `archived_at`, `created_at`

**sales**

| Column                                                    | Notes                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| id, doc_no (unique)                                       |                                                                   |
| customer_id (nullable) + customer_name/phone **snapshot** |                                                                   |
| sold_at                                                   |                                                                   |
| status                                                    | `paid` \| `voided` (every sale is fully paid at checkout, per Q9) |
| total_satang                                              | sum of line totals                                                |
| savings_satang                                            | Σ (regular − price) × qty, shown on the receipt as "ประหยัดไป"    |
| refunded_satang                                           | cached sum of refunds from returns                                |
| total_cost_satang                                         | owner only                                                        |
| source                                                    | `pos` \| `quote` \| `repair`                                      |
| quote_id, repair_job_id (nullable)                        |                                                                   |
| note, salesperson_id, created_at                          |                                                                   |
| voided_at, voided_by, void_reason                         |                                                                   |

**sale_items**

| Column                                    | Notes                                                              |
| ----------------------------------------- | ------------------------------------------------------------------ |
| id, sale_id, parent_item_id (nullable)    | build components are children of the build line                    |
| kind                                      | `product` \| `build` \| `service`                                  |
| product_id, build_id (nullable)           |                                                                    |
| name_snapshot, sku_snapshot               |                                                                    |
| qty, unit_price_satang, line_total_satang |                                                                    |
| regular_price_satang (nullable)           | snapshot, used for the struck-through price + badge on the receipt |
| unit_cost_satang                          | owner only                                                         |
| warranty_type, warranty_months            | snapshot                                                           |
| returned_qty                              | cached sum from return lines                                       |
| sort_order                                |                                                                    |

> A build on a receipt: the parent line shows the machine name and the (package) price, and the child lines
> list each part with its serial and warranty (no prices on child lines). Build cost = sum of child costs.

**sale_item_serials**: `sale_item_id`, `serial_item_id`

**payments**

| Column                          | Notes                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------- |
| id, sale_id                     | one payment per sale in this version                                             |
| method                          | `cash` \| `transfer` (`trade_in_credit` is reserved for system use in Phase 3/6) |
| amount_satang                   | amount applied to the bill (= bill total)                                        |
| received_satang                 | amount the user **typed in** as received (the explicit confirmation from Q9)     |
| change_satang                   | cash only: received − amount                                                     |
| paid_at, received_by, voided_at |                                                                                  |

**sale_returns** (return document)

| Column                 | Notes                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| id, doc_no (unique)    | e.g. `RT6909-0001`                                                                          |
| sale_id                | the original receipt                                                                        |
| returned_at, reason    | reason required (e.g. เสีย, ไม่ตรงสเปก, เปลี่ยนใจ)                                          |
| refund                 | `none` \| `cash` \| `transfer`                                                              |
| refund_satang          | defaults to what the customer paid for the returned lines; **only the owner can change it** |
| created_by, created_at |                                                                                             |

**sale_return_items**

| Column                                    | Notes                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| id, return_id, sale_item_id, product_id   |                                                                                                 |
| qty                                       | ≤ sold qty − already returned qty                                                               |
| serial_item_id (nullable)                 | required for serial products                                                                    |
| disposition                               | `pending` (status "Returned", in quarantine) \| `restocked` \| `sent_to_claim` \| `written_off` |
| resolved_at, resolved_by, resolution_note |                                                                                                 |

### 6.5 Phase 3 tables — Builds / quotes / upgrades

**customer_devices**: `id`, `customer_id`, `name` (e.g. "เครื่องประกอบ Ryzen 5 7600"), `build_id` (if the shop built it), `sale_id`, `notes`, `created_at`

**customer_device_parts**: `id`, `device_id`, `category_kind`, `description`, `product_id` (nullable), `serial_item_id` (nullable),
`specs` (JSON, used for compatibility checks on upgrades), `installed_at`, `removed_at` (upgrade history, rows never deleted)

**builds**

| Column                                                  | Notes                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| id, name                                                |                                                                   |
| type                                                    | `new` \| `upgrade`                                                |
| status                                                  | `draft` \| `assembled` \| `sold` \| `disassembled` \| `cancelled` |
| is_preset (bool)                                        | reusable spec set, or for sales posts                             |
| customer_id, customer_device_id                         | for upgrades                                                      |
| labor_fee_satang                                        | defaults from settings; owner-only to change                      |
| regular_price_satang                                    | computed: Σ part prices + labor fee                               |
| package_price_satang (nullable)                         | owner-set lower price → "-X%" badge (OQ2)                         |
| total_cost_satang                                       | owner only                                                        |
| compat_acknowledged (JSON)                              | rule IDs the user explicitly overrode                             |
| sold_sale_id, notes, created_by, created_at, updated_at |                                                                   |

**build_items**: `id`, `build_id`, `product_id`, `qty`, `unit_price_satang` (snapshot), `unit_cost_satang` (snapshot, owner only), `serial_item_id` (chosen at assembly or sale), `sort_order`

**build_removed_parts** (upgrades): `id`, `build_id`, `device_part_id` (nullable), `description`, `trade_in_value_satang`

**build_photos**: `build_id`, `file_id`, `sort_order`

**quotes**: `id`, `doc_no`, `customer_id` + customer snapshot, `issued_at`, `expires_at`, `status` (`draft`|`sent`|`accepted`|`expired`|`cancelled`), `accepted_option_id`, `converted_sale_id`, `note`, `created_by`
→ `expired` is derived when reading (past `expires_at`), so no cron job is needed. Quotes show the PromptPay QR so an online customer can pay after seeing the quote.

**quote_options**: `id`, `quote_id`, `label` (e.g. "ตัวเลือก A: อัปเกรด"), `sort_order`, `source_build_id`, `labor_fee_satang`, `total_satang`, `savings_satang`, `trade_in_credit_satang`, `total_cost_satang` (owner only)

**quote_items**: same shape as `sale_items` but tied to `option_id` (lines are copied from the build, so editing the build later doesn't change the quote)

### 6.6 Phase 4–6 tables (outline; details proposed at the start of each phase)

- **post_templates**: `id`, `name`, `size` (`square`|`portrait`|`story`), `design_json`, `is_builtin`, `created_by`
- **post_designs**: `id`, `name`, `size`, `template_id`, `product_id`, `build_id`, `design_json`, `preview_file_id`, `updated_at`
  - `design_json` = `{ width, height, background, elements: [{ id, type: 'text'|'image'|'rect'|'ellipse'|'badge', x, y, width, height, rotation, props, binding? }] }` where `binding` is a placeholder such as `{{price}}`, `{{regularPrice}}`, `{{discountPercent}}`
- **repair_jobs**: `id`, `doc_no`, `customer_id`, `customer_device_id`, `problem`, `accessories`, `device_password` (hidden from list views and **cleared automatically when the machine is returned**), `estimated_price_satang`, `technician_id`, `status`, `received_at`, `promised_at`, `completed_at`, `returned_at`, `sale_id`
- **repair_status_history**, **repair_photos**, **repair_parts** (stock out as `repair_use` on explicit confirmation), **repair_labor**
- **warranty_claims**: `id`, `doc_no`, `serial_item_id`, `customer_id`, `sale_id`, `sale_return_item_id` (when a returned item is sent to claim), `supplier_id`, `problem`, `status` (`received`|`sent_to_supplier`|`returned`|`replaced`|`rejected`), `sent_at`, `returned_at`, `replacement_serial_item_id`, `notes`
- **trade_ins**: `id`, `doc_no`, seller info (name, phone, address, **national ID number/ID photo**; Thai second-hand dealer law requires recording seller identity, to be confirmed with you in Phase 6), `purchased_at`, `total_satang`, `payment_method`, `status`, `sale_id` (when used as credit)
- **trade_in_items**, **trade_in_photos**, **breakdowns** (split a used machine into parts with an owner-specified cost allocation)

---

## 7. Core business logic

### 7.1 Stock ledger

- **Single entry point:** `stockService.move(tx, { productId, qtyChange, type, ref, serialIds, unitCost, reason, userId })`, which in one transaction:
  1. reads the current `on_hand`
  2. checks for negative stock (disallowed unless `allow_negative_stock`; serial-tracked stock can **never** go negative)
  3. inserts into `stock_movements` with `balance_after`
  4. updates `products.on_hand`
  5. updates the affected serial statuses
- **Per Q1, it's called only from explicit confirmation actions:** confirm checkout, confirm goods receipt, confirm build assembly/disassembly, confirm adjustment, confirm restocking a return, void, and (later) confirm repair parts, trade-ins, and claims. Carts, build drafts, presets, and quotes never call it and never reserve stock.
- better-sqlite3 transactions are **synchronous**, so they can't be interleaved. If two terminals sell the last unit at the same time, the second one reliably gets "insufficient stock". ⚠️ Never `await` inside a transaction.
- **Invariants:**
  - `products.on_hand = SUM(stock_movements.qty_change)`
  - for serial products: `on_hand = COUNT(serial_items WHERE status='in_stock')`
  - `GET /api/stock/integrity` (owner) checks both, the server checks at startup, and tests cover them

### 7.2 Cost (moving weighted average) and goods-receipt cost review

- On receipt: `newAvg = divRound(onHand × avg + qty × unitCost, onHand + qty)`. If `onHand ≤ 0`, `newAvg = unitCost`.
- **Staff receipts:** quantities and serials go into stock immediately, and the average cost is updated **provisionally** with the staff-entered cost. The receipt is `cost_status = 'unverified'`. If staff leave a line's cost empty, that line uses the product's current average as its provisional cost.
- **Owner review:** the owner confirms the receipt or corrects line costs. For each changed line:
  `delta = qty × (finalCost − provisionalCost)`. If the product's `onHand > 0`: `avg = max(0, divRound(onHand × avg + delta, onHand))`. Serial items from that line get the final `unit_cost_satang`.
  Sales made between receipt and review keep their provisional cost snapshot (a document snapshot is never rewritten), and the audit log records the before and after values. Then `cost_status = 'verified'`.
- Voiding a receipt reverses the average when the result is sensible, otherwise it keeps the current average and logs it.
- Sale, build, and quote lines snapshot `unit_cost_satang` = the average at that time.

### 7.3 Pricing and discount badges (`shared/pricing.ts`, pure functions with unit tests)

```
isDiscounted(p)   = p.regularPrice != null && p.regularPrice > p.price
discountPercent   = floor((regularPrice − price) × 100 / regularPrice)       (rounded DOWN, P18)

lineTotal         = unitPrice × qty
total             = Σ lineTotal                                (no manual discounts, no VAT)
savings           = Σ (regularPrice − unitPrice) × qty         (discounted lines only)
cost              = Σ (unitCost × qty)
profit            = total − cost                               (owner only)

cash change       = received − total                           (received ≥ total required)
transfer          = received must equal total                  (else the confirm button stays disabled)
```

**Owner pricing rules** (`PUT /products/:id/pricing`, owner only, audited + price history):

- The form has **Selling price** and **Regular price (before discount)**.
- If the owner **lowers** the selling price and no regular price is set → the old selling price automatically becomes the regular price (this is the "-20%" example: 100 → 80 shows "-20%").
- If the owner sets the selling price **≥ regular price** → the regular price is cleared (no longer discounted).
- **"End discount"** button → selling price = regular price, regular price cleared.
- The owner can also edit the regular price directly (e.g. to show a manufacturer's list price).

**Builds (OQ2):** `regularPrice = Σ part prices + labor fee`, and the owner can set a lower `packagePrice`. Badge % uses the same formula.

### 7.4 Checkout (POS, Q9)

1. The cart shows each line with its price, struck-through regular price, and badge. Staff can't change prices.
2. Pressing **ชำระเงิน** opens the payment dialog: choose **เงินสด** or **โอน/พร้อมเพย์**.
   - Cash: type the amount received → the change is shown in large text. Confirm is enabled once received ≥ total.
   - Transfer: the PromptPay QR for the exact total is shown (for the customer to scan). Type the amount received → Confirm is enabled only when it equals the total.
3. **Confirm** → one transaction: allocate doc number → sale + lines (snapshots) → payment → stock out → serial statuses → done. Then the receipt preview opens with PNG/PDF download.

### 7.5 Document numbers

- Allocated inside the document's transaction. Periods (month/year) follow the **Thai (Bangkok) date**.
- Tokens: `{YYYY}` `{YY}` (B.E. or C.E. per settings), `{MM}`, `{DD}`, `{SEQ:n}`

### 7.6 Void

- Owner only, reason required, all in one transaction: set the document status → restore stock (`void` movements) → restore serial statuses → void the payment → write an audit log entry
- A sale that already has returns can't be voided; handle the remaining items with a return instead
- A goods receipt can be voided only if its stock hasn't been sold (serials still `in_stock`, enough `on_hand`)

### 7.7 Serial lifecycle

```
received → in_stock ──confirm assembly──→ in_build ──sale──→ sold
             │                              └──disassemble──→ in_stock
             ├──sale (direct)──→ sold ──customer return──→ customer_returned (quarantine)
             │                                              ├──restock──→ in_stock (was_returned = true)
             │                                              ├──send to claim──→ in_claim (Phase 5)
             │                                              └──write off──→ written_off
             ├──adjustment out──→ written_off
             └──void sale──→ back to in_stock (or in_build if it was part of an assembled build)
sold ──warranty claim (Phase 5)──→ in_claim → sold (same unit back) | replaced: old = returned_to_supplier, new = sold
```

### 7.8 Returns (Q8, Phase 2)

- **Who:** staff and owner can record a return. Only the owner can change the refund amount.
- **Flow:** open the original receipt (search by doc no, phone, or serial) → pick the lines/serials being returned and the qty → enter a reason → choose refund: none / cash / transfer (the amount is pre-filled from what the customer paid for those lines) → **Confirm**.
- **Effect of confirming:** a return document (`RT…`) is created, returned serials become `customer_returned`, and the lines are `pending` (status **"Returned"**). **Sellable stock does not change yet**: the item is physically back but quarantined.
- **Resolving a pending item** (explicit confirmation, staff or owner):
  - **Restock** → `stock_movements` type `return_restock` (+qty). Serial goes back to `in_stock` with `was_returned = true` (shows a "เคยถูกคืน" tag on that unit).
  - **Send to claim** → links to a warranty claim (Phase 5). Until Phase 5 exists, it just records the decision.
  - **Write off** → no stock change (it never re-entered sellable stock). Serial becomes `written_off`.
- **Reporting:** net sales = sales − refunds, and the returned lines' revenue and cost are excluded from profit.
- A return slip (PNG/PDF) can be sent to the customer like a receipt.

### 7.9 Tags (Q8)

- **Automatic tags** (derived in `shared/tags.ts`, always up to date, can't be edited):
  | Tag            | Example                                                   | Source                              |
  | -------------- | --------------------------------------------------------- | ----------------------------------- |
  | Condition      | "ใหม่" / "มือสอง"                                         | `condition`                         |
  | Warranty       | "ประกันศูนย์ 3 ปี" / "ประกันร้าน 6 เดือน" / "ไม่มีประกัน" | `warranty_type` + `warranty_months` |
  | Discount       | "-20%"                                                    | regular vs. selling price           |
  | Returned       | "สินค้าคืน 1 ชิ้น" (units pending in quarantine)          | `sale_return_items` (pending)       |
  | Stock          | "หมด" / "ใกล้หมด"                                         | `on_hand` vs. `min_stock`           |
  | Awaiting price | "รอตั้งราคา"                                              | `price_satang IS NULL`              |
- **Custom tags:** the owner creates them (name + color) in settings and assigns them to products, e.g. "Open box", "กล่องไม่สวย", "ไม่มีกล่อง", "สินค้าแนะนำ".
- **Unit-level badges** in the serial list: status ("คืนแล้ว – รอตรวจสอบ", "อยู่ระหว่างเคลม") and "เคยถูกคืน".
- **Shown on:** product list, product detail, phone stock lookup, POS search results and cart, and the build part picker. Warranty and discount also appear on receipts.
- Tags are filterable in the product list (e.g. show all "มือสอง" or all "-X%").

### 7.10 Time

- Thai time is a fixed UTC+7 with no DST, so "today" and "this month" boundaries are exact with a constant offset (`shared/datetime.ts`)
- Display via `Intl.DateTimeFormat('th-TH-u-ca-buddhist' | 'th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok' })`
- SQLite day grouping: `date(sold_at/1000, 'unixepoch', '+7 hours')`

---

## 8. Auth and roles

### 8.1 Authentication

- First run: when there are no users, every route redirects to `/setup`. `POST /api/setup` works **only while no users exist** and shows a one-time recovery code.
- Login → random 32-byte token → cookie `sid` (`HttpOnly`, `SameSite=Lax`, no `Secure` because the LAN uses plain http). The DB stores only the token hash.
- **CSRF:** non-GET requests must send the `X-PCShop: 1` header (other origins can't set it without a CORS preflight, which we never allow), in addition to SameSite=Lax
- Login throttling: 5 failures within 5 minutes per username+IP → 5-minute lockout
- Deactivating a user deletes all their sessions immediately
- `/uploads/*` requires a session (same-origin with cookies, so Konva/html-to-image canvases aren't tainted)

### 8.2 Permission matrix (`shared/permissions.ts`)

| Action                                                                                  | Owner |                      Staff                       |
| --------------------------------------------------------------------------------------- | :---: | :----------------------------------------------: |
| See cost / profit / inventory value / receipt cost totals                               |  ✅   |                        ❌                        |
| See selling price, regular price, discount badge, price history                         |  ✅   |                        ✅                        |
| Create products                                                                         |  ✅   | ✅ non-money fields only, "awaiting price" (OQ3) |
| Edit product images, description, specs                                                 |  ✅   |                        ✅                        |
| Edit product name/category/SKU/barcode/condition/warranty/stock settings                |  ✅   |                        ❌                        |
| Set selling price / regular price / end discount / cost override                        |  ✅   |                        ❌                        |
| Manage custom tags and assign tags to products                                          |  ✅   |                        ❌                        |
| Archive products/categories/customers/suppliers                                         |  ✅   |                        ❌                        |
| Receive goods (confirm stock in) and enter supplier unit costs (write-only, unverified) |  ✅   |                        ✅                        |
| Review/verify goods-receipt costs                                                       |  ✅   |                        ❌                        |
| Void goods receipts / adjust stock                                                      |  ✅   |                        ❌                        |
| Sell: checkout with cash/transfer and the amount received                               |  ✅   |                        ✅                        |
| Void sales                                                                              |  ✅   |                        ❌                        |
| Record customer returns; resolve pending returns (restock/claim/write off)              |  ✅   |                        ✅                        |
| Change a return's refund amount                                                         |  ✅   |                        ❌                        |
| Builds / quotes / convert to sale / confirm assembly / post images                      |  ✅   |                        ✅                        |
| Set a build's package price or labor fee                                                |  ✅   |                        ❌                        |
| Delete own drafts (builds/quotes)                                                       |  ✅   |                        ✅                        |
| Repairs / warranty claims                                                               |  ✅   |                        ✅                        |
| Shop settings, users, backup/restore, audit log                                         |  ✅   |                        ❌                        |
| View the phone-access URL + QR                                                          |  ✅   |                        ✅                        |

### 8.3 Server-side cost hiding and money-field protection (most important)

1. For every entity with cost data, `shared/schemas` defines `xxxStaffSchema` (no cost fields) and `xxxOwnerSchema = xxxStaffSchema.extend({...cost fields})`
2. Routes respond via `respondByRole(req, { owner, staff }, data)`, which `parse`s with the role's schema. Zod strips unknown keys, so **forgetting a field in a schema means it isn't sent**, which is the safe failure.
3. Forbidden keys are listed in `shared/permissions.ts`: `costSatang`, `unitCostSatang`, `totalCostSatang`, `lineCostSatang`, `profitSatang`, `marginBp`, `inventoryValueSatang` …
4. **Integration test:** seed every entity type → log in as staff → call every registered GET route (enumerated from Fastify automatically) → recursively scan each JSON response for forbidden keys. A new route that fails means the build fails.
5. **Money fields on input (Q7):** product money fields exist only in the owner-only pricing endpoint. The staff product-update schema is `.strict()` and contains only `description` and `specs`, so any other key is rejected with 403. There are tests for this.
6. Indirect leaks to close: sorting/filtering by cost, the dashboard, stock movement history, goods-receipt details, backup downloads (all owner-only), post data (selling/regular price only), error messages, and the cost-review status (staff may see "unverified" but never the values)

---

## 9. Main API endpoints

Conventions: `/api` prefix, JSON, errors `{ error: { code: 'INSUFFICIENT_STOCK', message: 'สินค้าคงเหลือไม่พอ', details? } }`,
lists return `{ items, total }` and accept `?page=&pageSize=&q=`.
🔒 = owner only, (c) = cost fields stripped for staff

### Phase 1

| Method         | Path                                          | Notes                                                                               |
| -------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET            | /setup/status                                 | installed yet?                                                                      |
| POST           | /setup                                        | create owner + shop info + optional seed; returns recovery code                     |
| POST           | /auth/login · /auth/logout                    |                                                                                     |
| GET            | /auth/me                                      | user + permissions                                                                  |
| POST           | /auth/change-password                         |                                                                                     |
| GET/POST       | /users 🔒                                     |                                                                                     |
| PATCH          | /users/:id 🔒                                 | name, role, active                                                                  |
| POST           | /users/:id/reset-password 🔒                  |                                                                                     |
| GET            | /settings                                     | staff get the subset they need (shop name, PromptPay …)                             |
| PATCH          | /settings 🔒                                  |                                                                                     |
| GET/PATCH      | /settings/sequences 🔒                        | document number formats                                                             |
| GET            | /system/network                               | LAN URLs (QR is rendered on the client)                                             |
| GET            | /system/info 🔒                               | version, data dir                                                                   |
| POST           | /files                                        | upload (multipart: image + thumb)                                                   |
| GET            | /uploads/:path                                | session required                                                                    |
| GET/POST/PATCH | /categories · /categories/:id                 | POST/PATCH 🔒                                                                       |
| POST           | /categories/:id/archive 🔒                    |                                                                                     |
| GET/POST/PATCH | /tags · /tags/:id                             | POST/PATCH 🔒                                                                       |
| GET            | /products (c)                                 | `q`, `categoryId`, `condition`, `tagId`, `discounted`, `stock=low\|out\|in`, `sort` |
| GET            | /products/lookup?code= (c)                    | exact barcode/SKU/serial match (scanners)                                           |
| GET            | /products/:id (c)                             | includes derived tags                                                               |
| POST           | /products                                     | staff: non-money fields only (OQ3); owner may include an initial `pricing` object   |
| PATCH          | /products/:id                                 | owner: all non-money fields; staff: `description`, `specs` only (strict)            |
| PUT            | /products/:id/pricing 🔒                      | `{ priceSatang, regularPriceSatang? , costSatang? }` + "end discount" rules (§7.3)  |
| GET            | /products/:id/price-history                   |                                                                                     |
| PUT            | /products/:id/images                          | image order (staff allowed)                                                         |
| PUT            | /products/:id/tags 🔒                         |                                                                                     |
| POST           | /products/:id/archive 🔒                      |                                                                                     |
| GET            | /products/:id/movements (c)                   |                                                                                     |
| GET            | /products/:id/serials (c)                     |                                                                                     |
| GET/POST/PATCH | /suppliers · /suppliers/:id                   |                                                                                     |
| GET            | /goods-receipts (c) · /goods-receipts/:id (c) | filter `costStatus=unverified` 🔒                                                   |
| POST           | /goods-receipts                               | confirm receipt → stock in immediately; `cost_status` depends on role               |
| POST           | /goods-receipts/:id/verify-costs 🔒           | `{ lines: [{ itemId, unitCostSatang }] }` confirm/correct                           |
| POST           | /goods-receipts/:id/void 🔒                   |                                                                                     |
| POST           | /stock/adjustments 🔒                         | reason required; serials required for serial products                               |
| GET            | /stock/movements (c)                          | filter by product, type, date range                                                 |
| GET            | /stock/integrity 🔒                           |                                                                                     |
| GET            | /serials?q= (c)                               | serial search                                                                       |
| GET/POST       | /backups 🔒                                   | list / back up now                                                                  |
| POST           | /backups/restore 🔒                           | `{ backupId }` or `{ path }`                                                        |
| POST           | /seed/clear 🔒                                | only before any sale exists                                                         |
| GET            | /audit-logs 🔒                                |                                                                                     |

### Phase 2

| Method         | Path                               | Notes                                                                                                                                        |
| -------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET/POST/PATCH | /customers · /customers/:id        | search by name or phone                                                                                                                      |
| GET            | /customers/:id/history (c)         | purchases, returns, devices, repairs                                                                                                         |
| POST           | /sales                             | confirm checkout: `{ items, customerId?, payment: { method, receivedSatang } }` → sale + payment + stock out in one transaction              |
| GET            | /sales (c) · /sales/:id (c)        | `/sales/:id` returns everything needed to render the receipt                                                                                 |
| POST           | /sales/:id/void 🔒                 |                                                                                                                                              |
| POST           | /sales/:id/returns                 | record a return `{ lines, reason, refund }` (refund amount override 🔒)                                                                      |
| GET            | /returns (c) · /returns/:id (c)    | filter `pending=true`                                                                                                                        |
| POST           | /returns/:id/items/:itemId/resolve | `{ disposition: 'restocked' \| 'sent_to_claim' \| 'written_off', note }`                                                                     |
| GET            | /dashboard/summary?from=&to= (c)   | net sales, daily chart, best sellers, low stock, pending returns; owner also gets profit, inventory value, and receipts awaiting cost review |

### Phase 3

| Method                | Path                                               | Notes                                                        |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| GET/POST/PATCH/DELETE | /builds · /builds/:id (c)                          | DELETE only for drafts                                       |
| PUT                   | /builds/:id/pricing 🔒                             | package price, labor fee (OQ2)                               |
| POST                  | /builds/check-compat                               | parts in → warnings out                                      |
| POST                  | /builds/:id/assemble · /builds/:id/disassemble     | explicit confirmation (Q1)                                   |
| POST                  | /builds/:id/duplicate · /builds/:id/refresh-prices |                                                              |
| GET/POST/PATCH        | /customer-devices · /customer-devices/:id          |                                                              |
| GET/POST/PATCH        | /quotes · /quotes/:id (c)                          |                                                              |
| POST                  | /quotes/:id/status                                 |                                                              |
| POST                  | /quotes/:id/convert                                | `{ optionId, payment }`, checks stock, then creates the sale |

### Phase 4–6 (outline)

- `/post-templates`, `/post-designs`, `GET /post-context?productId=|buildId=` (public fields only: price, regular price, discount %, specs, tags, no cost)
- `/repairs`, `/repairs/:id/status`, `/repairs/:id/parts`, `/repairs/:id/close` (→ creates a sale)
- `GET /warranty/lookup?serial=|phone=`, `/claims`, `/claims/:id/status`
- `/trade-ins`, `/trade-ins/:id/breakdown`

---

## 10. Screens

Layout: sidebar on desktop, bottom nav on phones (stock lookup / photo / repairs / menu). The header has an
"open on phone" button that shows the QR code. All UI text is Thai. A shared `PriceTag` component shows the
price, the struck-through regular price, and the "-X%" badge everywhere, and `ProductTags` shows the tag chips.

| Phase | Screen                  | Path                                       | Description                                                                                                                                           | Primary device                    |
| ----- | ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1     | First-run setup         | /setup                                     | wizard: owner account → shop info → sample data → recovery code                                                                                       | desktop                           |
| 1     | Login                   | /login                                     |                                                                                                                                                       | both                              |
| 1     | Home                    | /                                          | Phase 1: shortcuts + owner badge "receipts awaiting cost review"; Phase 2: dashboard                                                                  | both                              |
| 1     | Products                | /products                                  | table + search + filters (category/condition/tag/discounted/stock); price with badge; tag chips                                                       | desktop                           |
| 1     | Product form            | /products/new, /products/:id/edit          | main fields + category-specific spec form + description + images; staff see only images/description/specs as editable, and money fields are hidden    | desktop                           |
| 1     | Product pricing         | dialog on product detail 🔒                | selling price, regular price, "end discount", badge preview                                                                                           | desktop                           |
| 1     | Product detail          | /products/:id                              | info, tags, price + badge, price history, serials tab (with unit badges), movement history tab                                                        | both                              |
| 1     | Stock lookup            | /stock/lookup                              | large search box, results as cards (on hand + price + badge + tags)                                                                                   | **phone**                         |
| 1     | Categories              | /categories 🔒                             |                                                                                                                                                       | desktop                           |
| 1     | Settings › Tags         | /settings/tags 🔒                          | create/edit custom tags with color                                                                                                                    | desktop                           |
| 1     | Suppliers               | /suppliers                                 |                                                                                                                                                       | desktop                           |
| 1     | Goods receiving         | /receiving, /receiving/new, /receiving/:id | line-by-line entry, serial scan field (auto-advance, counts for you), confirm dialog; owner review/correct costs                                      | desktop                           |
| 1     | Stock adjustment        | /stock/adjust 🔒                           |                                                                                                                                                       | desktop                           |
| 1     | Stock movements         | /stock/movements                           | all products + filters                                                                                                                                | desktop                           |
| 1     | Settings › Shop         | /settings/shop 🔒                          | shop info, logo, PromptPay, receipt footer, negative stock, default assembly fee                                                                      | desktop                           |
| 1     | Settings › Numbering    | /settings/numbering 🔒                     |                                                                                                                                                       | desktop                           |
| 1     | Settings › Users        | /settings/users 🔒                         |                                                                                                                                                       | desktop                           |
| 1     | Settings › Backup       | /settings/backup 🔒                        | location, keep count, "back up now", backup list + restore                                                                                            | desktop                           |
| 1     | Settings › Phone access | /settings/network                          | LAN URL + large QR + firewall tips                                                                                                                    | both                              |
| 1     | My account              | /account                                   | change password                                                                                                                                       | both                              |
| 2     | POS                     | /pos                                       | always-focused search/scan box, cart with badges, serial picker, customer, **payment dialog** (cash/transfer + amount received + change/QR) → confirm | desktop                           |
| 2     | Sales history           | /sales, /sales/:id                         | view/export receipt PNG/PDF, record a return, void                                                                                                    | desktop                           |
| 2     | Returns                 | /returns, /returns/:id                     | pending returned items with restock / claim / write-off actions; return slip export                                                                   | both                              |
| 2     | Customers               | /customers, /customers/:id                 | history, devices                                                                                                                                      | both                              |
| 2     | Dashboard               | /                                          |                                                                                                                                                       | desktop                           |
| 3     | Builds                  | /builds, /builds/:id                       | pick parts by category, compat warnings, live totals, package price (owner), confirm assembly                                                         | desktop                           |
| 3     | Quotes                  | /quotes, /quotes/:id                       | side-by-side options, export with PromptPay QR, convert to sale                                                                                       | desktop                           |
| 3     | Upgrade calculator      | /upgrade                                   | 5-step wizard per spec                                                                                                                                | desktop                           |
| 4     | Sales posts             | /posts, /posts/:id                         | gallery + editor                                                                                                                                      | desktop (photo upload from phone) |
| 5     | Repairs                 | /repairs, /repairs/new, /repairs/:id       | status board                                                                                                                                          | **phone**                         |
| 5     | Warranty/claims         | /warranty, /claims                         |                                                                                                                                                       | both                              |
| 6     | Trade-ins               | /trade-ins, /trade-ins/new                 |                                                                                                                                                       | both                              |

---

## 11. Documents, images, and Thai text

- **Fonts:** all via `@fontsource`. UI: IBM Plex Sans Thai or Noto Sans Thai (variable). Documents: Sarabun.
- **Receipts, return slips, quotes, and repair slips are online documents (Q5):** React components sharing a `DocumentLayout` → rendered into a hidden DOM node → `await document.fonts.ready` → `html-to-image` produces a PNG (`pixelRatio: 2`, with `fontEmbedCSS` computed once and reused) → jsPDF `addImage` for an A4 PDF (split across pages if it's tall)
  - The PNG is sized for LINE/Messenger: 1080px wide (540px layout × pixelRatio 2), with height following the content
  - **Receipt content:** logo, shop info, doc no/date, customer, lines (serials, warranty type + period, struck regular price + badge on discounted lines), total, "ประหยัดไป ฿X", total in Thai words, payment method + amount received + change, footer. A paid receipt has no PromptPay QR (the QR appears on the transfer payment step and on quotes instead).
  - A **download** button is always the primary action (Clipboard/Share APIs don't work over http on phones)
  - No print layout or print button
- **Konva (Phase 4):** wait for fonts (`document.fonts.load`) before rendering, and wrap Thai lines yourself with `Intl.Segmenter('th', { granularity: 'word' })` + `measureText`, then pass the pre-wrapped text to Konva. Truncate only at grapheme boundaries so vowels and tone marks never separate from their consonant.
- **Standard test string:** `ผู้ใหญ่ น้ำแข็ง ที่นี่ ฟรี!` for every export path
- **Image upload:** `<input type="file" accept="image/*" capture="environment">` → client resizes with canvas to longest side ≤ 1600px, JPEG 0.82 (logos stay PNG for transparency), plus a 320px thumbnail → both uploaded in one request → the server checks magic bytes, limits size to ≤ 5MB, and names the file by sha256 (dedup)
- ⚠️ **LAN http is not a secure context:** `getUserMedia`, `navigator.clipboard`, `navigator.share`, and **`crypto.randomUUID()`** are unavailable on phones. Use `crypto.getRandomValues` if a client-side ID is ever needed.
- **Barcode scanners:** the POS/lookup search handles Enter → `/products/lookup?code=`. An exact match adds the item to the cart and clears the box. If there's no match, it retries after the Thai → QWERTY layout conversion (P6).

---

## 12. Backup and restore

**Backup format** (one folder per backup):

```
<backup_dir>/pcshop-backup-2026-09-10_2300/
├── shop.db          ← better-sqlite3 db.backup() (SQLite online backup API, safe while the DB is in use)
├── uploads/         ← full copy
└── manifest.json    { appVersion, schemaVersion, createdAt, productCount, saleCount, sizeBytes, ok: true }
```

- Written to a `….partial` folder first and renamed on success, so incomplete backups never show up in the list
- **Automatic:** an hourly check runs the backup once the configured `backup_hour` has passed and today's backup hasn't run (if the PC was off at that hour, it runs at the next start). After a successful backup, anything beyond the latest N is pruned. State is kept in `backup-state.json`.
- **Restore (owner):**
  1. Validate: open read-only → `PRAGMA integrity_check` → require `schemaVersion ≤` the app's version (a backup from a newer app version is refused)
  2. **Always back up the current state first** (safety net)
  3. Pause requests → close the DB → replace `shop.db` (removing `-wal`/`-shm`) and `uploads/`
  4. Reopen → run migrations (for older backups) → check stock integrity
  5. All sessions become invalid, so everyone logs in again
- Automated test: create data → back up → change data → restore → data matches the backup

---

## 13. Testing

- **Unit (Vitest, `shared/`):** money, divRound, bahttext, pricing (badge % rounding down, savings, auto regular-price rules, change calculation, transfer amount match, profit), tags derivation, docNumber, datetime (Bangkok day boundaries), barcode layout mapping, compat rules
- **Integration (Vitest + Fastify `inject()` + in-memory SQLite, `server/test/`):** stock ledger (receive/sell/void/adjust/return-restock keep the invariants), goods-receipt cost review (average cost correction), serial lifecycle including returns, no negative stock, per-endpoint permissions, **staff can't write money fields** (strict schema → 403), **no cost leak to staff**, backup/restore, unique document numbers
- **Manual:** each phase ends with a step-by-step checklist for you, including testing on a real phone
- No E2E/browser tests for now (that would need Playwright, a new dependency; we can discuss later)

---

## 14. Technical risks

| #   | Risk                                                                                                                                        | Impact                                                                 | Mitigation                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Konva wraps Thai text wrongly** (no spaces between Thai words)                                                                            | Vowels/tone marks split, lines overflow                                | Custom wrapping with Intl.Segmenter (P11), prototyped at the start of Phase 4                                                                           |
| R2  | **html-to-image on Safari/iOS:** images or fonts may be missing on the first render                                                         | Receipts exported from phones look wrong                               | Wait for `document.fonts.ready`, pre-embed fonts, do one throwaway render on Safari, test on a real iPhone                                              |
| R3  | **Scanner with the Thai keyboard layout active**                                                                                            | Scans don't find products                                              | P6 automatic layout mapping                                                                                                                             |
| R4  | **better-sqlite3 is native:** needs a prebuilt binary for the Node version (currently Node 24), and in Phase 7 a rebuild for Electron's ABI | Install fails on Windows without prebuilds (would need VS Build Tools) | Use the latest better-sqlite3 with Node 24 prebuilds; `@electron/rebuild` in Phase 7                                                                    |
| R5  | **Windows Firewall blocks port 3300 / DHCP changes the PC's IP / multiple adapters** (VirtualBox, WSL, Hyper-V)                             | Phones can't connect                                                   | Phone-access page lists every plausible IP (virtual adapters filtered out) with firewall/static-IP tips; Phase 7 installer adds a firewall rule         |
| R6  | **Shop WiFi shared with customers**                                                                                                         | Outsiders can reach the login page                                     | Recommend a separate guest network, require an owner password of ≥ 8 characters, login rate limiting                                                    |
| R7  | **Indirect cost leaks / staff writing money fields**                                                                                        | Violates core requirements                                             | Whitelist schemas, strict staff input schema, route-scanning tests (§8.3)                                                                               |
| R8  | **Restoring while the server runs** / backups from different versions                                                                       | Corrupt DB                                                             | Procedure in §12, backup before restore, tests                                                                                                          |
| R9  | **Disk fills up** from images and daily full-copy backups                                                                                   | Backups fail                                                           | Client-side resizing, keep-N limit, backup page shows sizes and free space; image dedup across backups can be added later if needed                     |
| R10 | **Automatic regular-price behavior surprises the owner** (e.g. raising a price by mistake clears the discount)                              | Wrong badge shown                                                      | The pricing dialog previews the badge before saving, price history lets the owner see and redo changes, and the "end discount" action is explicit       |
| R11 | **Provisional costs from staff receipts** make profit on sales made before review slightly off                                              | Small profit inaccuracies                                              | Owner badge for pending reviews; corrections adjust the average for remaining stock; audit log shows what changed                                       |
| R12 | **Owner forgets the password** (offline, no email)                                                                                          | Locked out                                                             | Recovery code + CLI (P10)                                                                                                                               |
| R13 | **Electron: closing the window stops the server**, and phones lose access                                                                   | Inconvenient                                                           | Phase 7: probably minimize to the system tray instead of quitting (will ask then)                                                                       |
| R14 | **Thai characters in the Windows user path** (e.g. `C:\Users\สมชาย\AppData\…`)                                                              | DB fails to open (unlikely)                                            | Test in Phase 7 (Node and better-sqlite3 support Unicode paths)                                                                                         |
| R15 | **Seed prices go stale**                                                                                                                    | Sample data doesn't match market prices                                | Clearly labeled as samples + clear action (Q10)                                                                                                         |
| R16 | **HEIC photos from iPhones** or very large photos on old phones                                                                             | Resize fails / out of memory                                           | iOS converts to JPEG for file inputs; show a Thai error message if decoding fails; resize one file at a time                                            |
| R17 | **Adding VAT, split payments, or deposits later** (if the client hires further)                                                             | Rework                                                                 | VAT is isolated to one step in `pricing.ts`; the `payments` table already supports multiple rows; receipts render from data, so only the layout changes |

---

## 15. Phase 1 sub-tasks

(One commit per item. Phase 1 ends with a test checklist for you.)

1. **Scaffold:** workspaces, tsconfig, eslint/prettier, Vite + Tailwind + shadcn, Fastify hello, `dev`/`build`/`start`/`test`/`lint` scripts
2. **Shared core:** money, divRound, pricing (badge %, regular-price rules), datetime, enums, permissions + unit tests
3. **DB:** Phase 1 Drizzle schema + migrations + client (WAL, reopen) + config/data dir
4. **Auth + setup wizard:** sessions, scrypt, login/logout, rate limit, recovery code, reset-password CLI, `respondByRole`
5. **Users + audit log**
6. **Shop settings + document numbering + phone access page (LAN URL + QR)**
7. **File upload:** client-side resize + endpoint + authenticated serving
8. **Categories + spec definitions** (spec forms per kind)
9. **Products:** CRUD with the role-based field rules, search/filters, images, owner pricing endpoint + price history + `PriceTag` badge, barcode lookup (+ Thai layout mapping)
10. **Tags:** custom tag management, product tag assignment, automatic tag derivation, `ProductTags` chips + filters
11. **Stock service + suppliers + goods receiving (serials, confirm dialog)** + ledger integration tests
12. **Goods-receipt cost review** (owner confirm/correct, average cost correction) + tests
13. **Stock adjustments + movement history + integrity check + phone stock lookup**
14. **No-cost-leak + no-money-write tests** (every route as staff)
15. **Backup/restore:** automatic + button + restore page + tests
16. **Seed data:** 40–60 products across every category (some discounted, some used, with tags) + clear action
17. **Polish + Phase 1 test checklist**
