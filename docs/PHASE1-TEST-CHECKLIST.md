# Phase 1 test checklist

Everything Phase 1 built, in the order a shop would actually meet it. Work through it once from a clean
database; it takes roughly 45–60 minutes. The app's UI is Thai, so Thai labels are quoted like
"เพิ่มสินค้า" — those are the buttons to look for.

Report anything that fails with: the step number, what you expected, what happened.

> Scope reminder: Phase 1 is **foundation + inventory**. There is no POS, no receipt/PDF export, no
> builds, no repairs, and no VAT yet — see [What is deliberately missing](#what-is-deliberately-missing).

---

## 0. Setup

### Run it

```bash
npm install
npm run dev          # Fastify :3300 + Vite :5173
```

Open <http://localhost:5173> in Chrome or Edge. Keep the terminal visible — server errors show up there.

### Starting from a clean database

Development data lives in `./data` (production uses `%APPDATA%\PCShopManager`). To start over:

```bash
# stop `npm run dev` first
rm -rf data          # PowerShell: Remove-Item -Recurse -Force data
```

Next start recreates the database and sends you to the setup wizard.

### Automated checks (should all pass before you click anything)

```bash
npm test             # 224 tests: shared unit tests + server integration tests
npm run typecheck
npm run lint
npm run build        # web/dist + server/dist bundle
```

- [ ] **0.1** All four commands finish without errors.
- [ ] **0.2** `npm start` (after `npm run build`) serves the whole app on <http://localhost:3300> —
      one process, no Vite. Stop it again and go back to `npm run dev` for the rest of this list.

---

## A. First run, login, and account recovery

- [ ] **A.1** With an empty `./data`, opening any URL redirects to the wizard at `/setup`.
- [ ] **A.2** Step 1 "บัญชีเจ้าของร้าน": a password under 8 characters and mismatched confirmation are
      both refused with Thai messages. Then fill it in correctly.
- [ ] **A.3** Step 2 "ข้อมูลร้าน": enter a shop name, phone, and a PromptPay number (a mobile number is
      fine). Tick **"ใส่ข้อมูลตัวอย่างให้ทดลองใช้งาน"** — that is the sample catalogue.
- [ ] **A.4** Step 3 shows the **recovery code** once. Download it (the button) and keep the file — you
      need it in A.7. The "เริ่มใช้งานระบบ" button stays disabled until you tick that you saved it.
- [ ] **A.5** You land on the home page, logged in, with the shop name in the header. The browser tab
      title changes per screen (e.g. "สินค้า · PC Shop Manager").
- [ ] **A.6** Log out ("ออกจากระบบ" in the user menu), then log in with a **wrong** password 5 times:
      the 6th attempt is refused with a "try again in N minutes" message even if the password is right.
      (The lockout is per username + IP and clears after 5 minutes, or restart `npm run dev`.)
- [ ] **A.7** "ลืมรหัสผ่าน" → `/recover`: username + the recovery code from A.4 + a new password. You are
      logged in and shown a **new** recovery code (the old one is now dead). Log out and back in with the
      new password.
- [ ] **A.8** Emergency reset from the shop PC, with the dev server stopped:
      `npm run reset-password -- owner` prints a temporary password; log in with it, then change it on
      "บัญชีของฉัน".

---

## B. Shop settings, document numbers, phone access

- [ ] **B.1** ตั้งค่า → "ข้อมูลร้าน": upload a logo (any JPEG/PNG). It appears immediately; reload to
      confirm it stuck. Check `data/uploads/` has the file.
- [ ] **B.2** Change the shop name → the header and the login page show the new name.
- [ ] **B.3** "เกี่ยวกับระบบ" at the bottom shows the version and the **data folder** path. Confirm the
      path exists on disk.
- [ ] **B.4** ตั้งค่า → "เลขที่เอกสาร": the goods-receipt format is `GR{YY}{MM}-{SEQ:4}` with a preview.
      Enter a nonsense format (e.g. remove `{SEQ}`) → refused in Thai. Switch "ปีพุทธศักราช" off and on
      in ข้อมูลร้าน and watch the preview year change (2569 ↔ 2026).
- [ ] **B.5** ตั้งค่า → "เชื่อมต่อมือถือ" shows a LAN URL and a big QR code. **On a phone on the same
      WiFi**, scan it: the app opens, you log in, and "เช็คสต็อก" works. (In development the URL uses
      port 5173 automatically.)

---

## C. Catalogue: categories, products, prices, tags

- [ ] **C.1** "หมวดหมู่สินค้า": the 12 built-in categories are there and cannot be archived. Add your own
      (e.g. "จอยเกม", kind "อุปกรณ์เสริม"), then archive it again.
- [ ] **C.2** "สินค้า" → "เพิ่มสินค้า": pick category "ซีพียู (CPU)" and note the spec form is
      CPU-specific (ซ็อกเก็ต, จำนวนคอร์, TDP …). Switch the category to "จอมอนิเตอร์" — the spec fields
      change to size/resolution/refresh rate.
- [ ] **C.3** Create a product with SKU left blank → it gets a generated code like `CPU-0007`.
      Set ราคาขาย 5,000 and ต้นทุน 4,000.
- [ ] **C.4** On the product page, "แก้ไขราคา": lower the price to 4,000. The old price is kept
      automatically as ราคาปกติ and a **"-20%"** badge appears in the list, the detail page, and
      "เช็คสต็อก". "ยกเลิกลดราคา" puts the price back to 5,000 and removes the badge.
- [ ] **C.5** "ประวัติราคา" on the product page lists every change with who made it and when.
- [ ] **C.6** Add a barcode (type any digits, e.g. `8850999000001`). In the search box at the top of
      "สินค้า", type that barcode and press **Enter** → it jumps straight to the product.
- [ ] **C.7** Thai keyboard layout: switch Windows to Thai, type the barcode/SKU again (you will get
      Thai characters), press Enter → it still finds the product.
- [ ] **C.8** Images: on the product page add 2–3 photos. **On the phone**, use the camera button on the
      product's image editor — the photo uploads and shows as the thumbnail in the list. Check the file
      in `data/uploads/` is a resized JPEG (well under 1 MB), not the original camera file.
- [ ] **C.9** ตั้งค่า → "แท็กสินค้า": create "Open box" (amber) and "ของโชว์" (blue), reorder them, then
      assign both to a product ("แก้ไขแท็ก"). The chips appear in the list, the detail page, and
      "เช็คสต็อก", and the product list can filter by tag.
- [ ] **C.10** Automatic tags need no setup: a used product shows "มือสอง", a product with no stock
      shows "หมด", one at or below its minimum shows "ใกล้หมด", a discounted one shows "-X%", and one
      without a price shows "รอตั้งราคา". Archive a tag → it disappears everywhere but comes back
      unarchived with the same products.
- [ ] **C.11** Archiving: a product with stock refuses to be archived ("ปรับสต็อกให้เป็น 0 ก่อน"). Set
      the stock to 0 (part F), archive it, and confirm it only shows under status "ที่ซ่อนไว้".

---

## D. The money wall (most important — PLAN §8.3)

Create a staff account first: ตั้งค่า → "ผู้ใช้งาน" → "เพิ่มผู้ใช้", role "พนักงาน". Then open a **second
browser profile or a private window** and log in as that staff member, so you can switch roles quickly.

As **staff**:

- [ ] **D.1** Nowhere in the app is there a cost, profit, or margin: not in the product list or detail
      page, not in movement history, not on goods receipts, not on the serial list.
- [ ] **D.2** The product form has **no price fields at all**, and there is no "แก้ไขราคา" button.
- [ ] **D.3** Creating a product works, but it comes out as **"รอตั้งราคา"** and cannot be sold.
- [ ] **D.4** Editing an existing product: only images, description and specs are editable. Name,
      category, SKU, barcode, condition, warranty and stock settings are not offered.
- [ ] **D.5** These menus are missing for staff: หมวดหมู่สินค้า, ปรับสต็อก, and in ตั้งค่า only
      "เชื่อมต่อมือถือ" is available (no users, backup, numbering, tags, sample data).
- [ ] **D.6** Guessing a URL does not help: opening `/settings/users`, `/stock/adjust` or
      `/settings/backup` as staff shows a Thai "ไม่มีสิทธิ์" error instead of the page.

Back as **owner**:

- [ ] **D.7** The same screens now show ต้นทุน/กำไร columns, the pricing dialog, and all settings tabs.
- [ ] **D.8** The home page shows "มีสินค้ารอตั้งราคา N รายการ" for the product staff created in D.3.
      Click it → the filtered list → set a price → the to-do disappears.

---

## E. Suppliers, goods receiving, and cost review

- [ ] **E.1** "ผู้จำหน่าย": add one, edit it, archive it, and confirm an archived supplier cannot be
      picked on a new receipt.
- [ ] **E.2** As **owner**, "รับสินค้าเข้า" → "รับสินค้าใหม่": pick a supplier, add a non-serial product
      with qty 10 and a unit cost, and a **serial-tracked** product with qty 3. The serial field
      auto-advances and counts "2/3"; saving with only 2 serials is refused.
- [ ] **E.3** Confirming shows a dialog that **summarizes the stock effect** before anything changes.
      After confirming: a `GR…` document number, stock on hand went up, and the product's average cost
      equals what you typed.
- [ ] **E.4** Receive the same product again at a **different** cost → the average moves to the weighted
      average (e.g. 10 @ 100 then 10 @ 120 → 110), not to the latest cost.
- [ ] **E.5** As **staff**, create a receipt and type a supplier cost. Save it, then reopen it: the cost
      is **gone from view** (write-only) and the receipt is marked "รอตรวจสอบต้นทุน".
- [ ] **E.6** As **owner**, the home page shows "มีใบรับสินค้ารอตรวจสอบต้นทุน N ใบ". Open that receipt →
      "ตรวจสอบต้นทุน": the dialog shows what staff typed. **Correct** one line and confirm → the receipt
      becomes "ตรวจสอบแล้ว", and the product's average cost moves only for the units still in stock.
- [ ] **E.7** Void a receipt ("ยกเลิกใบรับสินค้า") with a reason → stock goes back out, serial units
      become "คืนผู้จำหน่ายแล้ว", the average cost is reversed, and the receipt shows as voided but is
      **not deleted** (its document number is not reused).
- [ ] **E.8** Try to void a receipt whose serial unit you already wrote off in part F → refused with a
      Thai explanation telling you to adjust stock instead.

---

## F. Stock: adjustments, history, integrity, phone lookup

- [ ] **F.1** "ปรับสต็อก" (owner only): saving without a reason is refused. Adjust a non-serial product
      +2 and a serial product −1 (pick the unit). The confirmation dialog spells out the stock effect.
- [ ] **F.2** After saving: one `AJ…` number covers both lines, the removed serial unit is
      "ตัดจำหน่าย", and both products' on-hand figures changed accordingly.
- [ ] **F.3** Serial stock can never go negative: try to remove more units than exist → refused.
      Non-serial stock is also refused unless you tick "อนุญาตให้ขายเกินสต็อก" in ข้อมูลร้าน (try it,
      then turn it back off).
- [ ] **F.4** "ความเคลื่อนไหวสต็อก": every movement from parts E and F is listed with type, quantity,
      balance after, document number, and who did it. Filters by product, type, date range and document
      number work. Nothing here can be edited or deleted.
- [ ] **F.5** "ตรวจสอบความถูกต้องของสต็อก" → "ตรวจสอบตอนนี้" reports **ถูกต้องทั้งหมด** with the product
      count.
- [ ] **F.6** **On the phone**, "เช็คสต็อก": search by name, and type a serial number then press Enter →
      the exact unit's product comes up with a "ตรงกับซีเรียล" note, stock, price, badge and tags in big
      readable type.
- [ ] **F.7** If you have a **barcode scanner**, scan a product's barcode into the "เช็คสต็อก" box and
      into the receiving serial field: it behaves like typing plus Enter, and the right product appears.

---

## G. Backup and restore

- [ ] **G.1** ตั้งค่า → "สำรองข้อมูล" → "สำรองข้อมูลตอนนี้" creates a `pcshop-backup-…` folder in
      `data/backups/` containing `shop.db`, `uploads/`, and `manifest.json`. The list shows its size and
      product count.
- [ ] **G.2** Change something obvious afterwards (e.g. delete a product's images, or archive a
      product), then restore the backup from G.1: read the confirmation dialog, tick the box, confirm.
      You are signed out, and after logging in again the change is gone.
- [ ] **G.3** A **safety backup** of the pre-restore state appears in the list ("ก่อนกู้คืนข้อมูล"), so
      a wrong restore can itself be undone. Restore that one to get back.
- [ ] **G.4** Set "เก็บข้อมูลสำรองล่าสุด" to 2, back up three times, and confirm the oldest folder is
      deleted automatically.
- [ ] **G.5** Point "โฟลเดอร์เก็บข้อมูลสำรอง" at a USB drive or another folder, back up, and confirm the
      files land there. (Also try restoring via "กู้คืนจากโฟลเดอร์อื่น" with that full path.)

---

## H. Sample data

- [ ] **H.1** ตั้งค่า → "ข้อมูลตัวอย่าง" lists what the wizard created (~59 products, 4 suppliers,
      4 tags, 4 receipts) and warns that the prices are only samples.
- [ ] **H.2** Because you adjusted sample stock in part F, clearing is now **blocked** with a Thai
      explanation, and the button is disabled. (That is the guard: sample data can only be deleted while
      untouched.)
- [ ] **H.3** To see a successful clear: start from a clean database (section 0), tick the sample-data
      box in the wizard, then go straight to ตั้งค่า → "ข้อมูลตัวอย่าง" → "ลบข้อมูลตัวอย่างทั้งชุด".
      Read the confirmation, confirm, and check that products, receipts, suppliers, tags and stock
      history are all gone, the 12 categories remain, and the integrity check (F.5) still passes.
- [ ] **H.4** A shop that was set up **without** sample data can still load it:
      `npm run seed` (dev server stopped), then reload the app.

---

## I. Offline, LAN, and Thai text

- [ ] **I.1** **Unplug the internet** (or disable the WAN adapter) and use the whole app: it works
      completely. Nothing loads from a CDN — the Thai font is bundled, so no text falls back to another
      typeface.
- [ ] **I.2** Thai rendering: put `ผู้ใหญ่ น้ำแข็ง ที่นี่ ฟรี!` into a product name, description and a
      tag. Stacked vowels and tone marks are drawn correctly in the list, detail page, dialogs, and on
      the phone.
- [ ] **I.3** Dates: "วันที่" values show Thai months and Buddhist years (e.g. 12 ก.ย. 2569) and match
      Bangkok time, including around midnight.
- [ ] **I.4** Money: prices show thousand separators and exactly two decimals (1,234.50). Try
      entering `1234.567` as a price → refused, no silent rounding.
- [ ] **I.5** Two devices at once: change a price on the PC, then pull to refresh on the phone → the
      phone shows the new price.
- [ ] **I.6** Restart the server (Ctrl+C, `npm run dev`) while the phone has the app open: the phone
      shows a Thai "cannot reach the server" message and recovers when the server is back.

---

## What is deliberately missing

Not yet built, by plan — please don't file these as bugs:

| Not here yet                                                      | Arrives in               |
| ----------------------------------------------------------------- | ------------------------ |
| POS / selling, payments, receipts, returns                        | Phase 2                  |
| Customers, dashboard                                              | Phase 2                  |
| Builds (จัดสเปก), quotes, compatibility rules, upgrade calculator | Phase 3                  |
| Sales post images (Konva editor)                                  | Phase 4                  |
| Repairs, warranty claims                                          | Phase 5                  |
| Trade-ins, reports                                                | Phase 6                  |
| Electron desktop packaging, auto-start                            | Phase 7                  |
| VAT, tax invoices                                                 | not in this version (Q4) |

Also by design: no printing (receipts will be PNG/PDF for LINE in Phase 2), no manual discounts
(a discount is a price reduction, Q6), no staff access to money (Q7), and stock changes only on an
explicit confirmation (Q1).
