# Phase 2 test checklist

Everything Phase 2 built — customers, POS, receipts, voids, returns, and the dashboard — in the order a
shop would meet it. It builds on Phase 1, so finish (or at least start) the
[Phase 1 checklist](PHASE1-TEST-CHECKLIST.md) first. Allow about 60 minutes. Thai labels are quoted
like "ขายสินค้า" — those are the buttons to look for.

Report anything that fails with: the step number, what you expected, what happened.

> You need **two logins** for this list: the owner, and a staff account (ตั้งค่า → ผู้ใช้งาน → เพิ่มผู้ใช้,
> role "พนักงาน"). Use two different browsers (or a normal and a private window) so both can stay
> logged in at once.

---

## 0. Setup

```bash
npm install          # Phase 2 adds html-to-image, jspdf, @fontsource/sarabun, recharts
npm run dev
```

Start from a shop **with sample data** (see Phase 1, section 0) so there is stock to sell.

```bash
npm test             # 293 tests
npm run typecheck
npm run lint
npm run build
```

- [ ] **0.1** All four commands finish without errors.
- [ ] **0.2** `npm start` (after the build) serves everything on <http://localhost:3300>, including the
      dashboard chart and receipt downloads (those load on first use).

---

## A. Customers

- [ ] **A.1** "ลูกค้า" → "เพิ่มลูกค้า": only the name is required. Save one customer with phone
      `081-234-5678`.
- [ ] **A.2** Add a second customer and type `0812345678` as the phone: an amber warning names the
      first customer, but **saving still works** (families share phones).
- [ ] **A.3** Search the list by name, by `0812345678`, by `081-234` and by `+66 81 234 5678` — the
      customer is found every time.
- [ ] **A.4** As **staff**: you can add and edit customers, but there is no "ซ่อนลูกค้า" button. As the
      owner, hide a customer, tick "แสดงที่ซ่อนไว้" to see it again, and unhide it.

---

## B. Selling (POS)

Open "ขายสินค้า" as **staff**.

- [ ] **B.1** The search box has the cursor already. Type a product's SKU (e.g. `PSU-0003`) and press
      **Enter** → it's added to the cart. Scan a barcode with a USB scanner if you have one.
- [ ] **B.2** Switch Windows to the **Thai keyboard** and scan/type the same code again → it's still
      found (the server converts Thai-layout keys back). Switch back to English afterwards.
- [ ] **B.3** Type part of a name, use the arrow keys, press Enter → that product is added. Results show
      the price with the struck-through regular price and "-X%" badge.
- [ ] **B.4** Add a **serial product** by name → a "เลือกซีเรียล" dialog opens; pick one unit. Then type
      one of its **serial numbers** in the search box and press Enter → that exact unit is added.
- [ ] **B.5** Try to add the product that is "รอตั้งราคา" → refused with a Thai message.
- [ ] **B.6** Raise a non-serial line's quantity above its stock → the line turns red ("สต็อกไม่พอ") and
      "ชำระเงิน" is disabled.
- [ ] **B.7** Refresh the page (F5) → the cart is still there. (A cart never touches stock.)
- [ ] **B.8** "ลูกค้าทั่วไป" → pick a customer, or "เพิ่มลูกค้าใหม่" right there. The X puts it back
      to walk-in. Checkout never requires a customer.
- [ ] **B.9** "ชำระเงิน" → **เงินสด**: type less than the total → a Thai warning and a disabled confirm.
      Use a quick-amount button → the change appears in large green text. The dialog lists exactly
      what stock will be cut.
- [ ] **B.10** Switch to **โอน/พร้อมเพย์**: a QR code for the exact total appears. Scan it with a banking
      app and check that it shows your shop's PromptPay name and **the exact amount** — then cancel in
      the banking app (don't pay). The confirm button works only when the typed amount equals the total.
- [ ] **B.11** Confirm a cash sale → "ขายสำเร็จ" with the change in large text. "ขายบิลถัดไป" gives
      an empty cart with the cursor back in the search box.
- [ ] **B.12** Stock went down by exactly what was sold, serial units show "ขายแล้ว", and
      "ความเคลื่อนไหวสต็อก" shows "ขาย" rows with the bill number.
- [ ] **B.13** **Price changed while the cart was open:** put a product in the cart as staff, then as the
      owner lower its price. Staff pays → refused with "ราคาสินค้ามีการเปลี่ยนแปลง…", and the cart now
      shows the new price. Pay again → it works at the new price.
- [ ] **B.14** Try to sell the same serial unit from two browsers at once → the second one is refused.

---

## C. Sales history and receipts

- [ ] **C.1** "ประวัติการขาย" lists the bills, newest first. Filter by date, status, payment method,
      and "เฉพาะบิลที่ฉันขาย"; search by bill number, customer phone, and a sold **serial number**.
- [ ] **C.2** As **staff**: the list and bill pages show prices and totals but **no cost and no profit**
      anywhere. As the owner: a กำไร column, cost per line, and profit on the bill page.
- [ ] **C.3** Open a bill → "ใบเสร็จ" → the receipt preview shows the shop name, lines with warranty
      and its end date, serial numbers, struck regular prices with the badge, "ประหยัดไป", the total in
      Thai words, and the payment with change.
- [ ] **C.4** "ดาวน์โหลดรูป (ส่ง LINE)" saves a PNG. Send it to your phone on LINE and open it: sharp,
      Thai text correct, readable without zooming.
- [ ] **C.5** "ดาวน์โหลด PDF (A4)" saves a one-page A4 PDF that opens in Edge/Acrobat.
- [ ] **C.6** **Thai rendering:** ตั้งค่า → ข้อมูลร้าน → "ดูตัวอย่างใบเสร็จ" shows a receipt whose first
      line is `ผู้ใหญ่ น้ำแข็ง ที่นี่ ฟรี!`. Download both files: stacked vowels and tone marks stay on
      their letters. Add a logo and a receipt footer, then check the sample again.
- [ ] **C.7** On a **phone** (and on an iPhone if you have one): open a bill → ใบเสร็จ → download the
      PNG. It saves to the phone and looks the same as on the PC.

---

## D. Voiding a sale (owner only)

- [ ] **D.1** As **staff**: a bill has no "ยกเลิกบิล" button.
- [ ] **D.2** As the owner: "ยกเลิกบิล" lists the stock that comes back and requires a reason.
      Confirm → the bill shows "ยกเลิกแล้ว" with the reason; stock and serial units are back; the
      receipt now carries a red "ยกเลิกแล้ว" stamp; the audit log has "ยกเลิกบิลขาย".
- [ ] **D.3** A bill that already has a return cannot be voided (the button is disabled and explains why).

---

## E. Returns (quarantine)

- [ ] **E.1** As **staff**, open a paid bill → "รับคืนสินค้า". Choose part of a non-serial line and one
      serial unit, a reason (quick buttons or text), and "คืนเป็นเงินสด". The refund amount fills in by
      itself; the request has no money field staff can edit.
- [ ] **E.2** The yellow note says the units go to "สินค้าคืน – รอตรวจสอบ". Confirm → you land on the
      return (`RT…`). **Sellable stock did not change**, the serial unit shows "สินค้าคืน – รอตรวจสอบ",
      and the product shows a "สินค้าคืน N ชิ้น" tag (also in "เช็คสต็อก").
- [ ] **E.3** The bill now shows the returned quantity, the unit marked "คืนแล้ว", the refund, and a
      link to the return. You can't return more than was bought, or the same serial twice.
- [ ] **E.4** "ใบรับคืน" → the return slip downloads as PNG/PDF like the receipt.
- [ ] **E.5** As the owner: "แก้ยอดคืนเงิน" on the return. More than the customer paid is refused; a
      lower amount is saved with who/when, and the bill's refund updates. Staff don't see this button.
- [ ] **E.6** A return with "ไม่คืนเงิน" records no refund. A service line (e.g. ค่าประกอบ) can't be
      returned.

---

## F. Deciding what happens to returned units

On a return with units waiting ("สินค้าคืน" → the "รอตรวจสอบ" tab):

- [ ] **F.1** "คืนเข้าสต็อก": the dialog says how much stock goes back. Confirm → stock goes up, the
      movement history shows "รับคืนเข้าสต็อก", and a serial unit is back as "พร้อมขาย" with a
      "เคยถูกคืน" badge (product page → serials, and in the POS serial picker). It can be sold again.
- [ ] **F.2** "ส่งเคลม" → the unit is "อยู่ระหว่างเคลม"; stock unchanged.
- [ ] **F.3** "ตัดจำหน่าย" → the unit is "ตัดจำหน่าย"; stock unchanged.
- [ ] **F.4** Each unit can be decided only once; when all are done the return shows "จัดการครบแล้ว"
      and the product's "สินค้าคืน" tag is gone.
- [ ] **F.5** Do these on a **phone** too — the buttons fit without scrolling sideways.
- [ ] **F.6** After all of this, the stock integrity check (ความเคลื่อนไหวสต็อก →
      "ตรวจสอบความถูกต้องของสต็อก") still says everything matches.

---

## G. Dashboard (home page)

- [ ] **G.1** As the owner: "เดือนนี้" is selected. Check the tiles against your own sums: ยอดขายสุทธิ =
      sales − refunds, จำนวนบิล (voided bills don't count), มูลค่าสต็อก = on hand × average cost.
- [ ] **G.2** The daily chart: hover a column for the day's amount and bill count; "ดูเป็นตาราง"
      shows the same numbers. Try วันนี้ / 7 วันล่าสุด / เดือนที่แล้ว and a custom range.
- [ ] **G.3** "สินค้าขายดี" (returned units subtracted) and "สินค้าใกล้หมด" look right; the links open
      the filtered product list.
- [ ] **G.4** Yellow to-dos appear for receipts awaiting cost review, products awaiting price, and
      returned units waiting, and each link goes to the right list.
- [ ] **G.5** As **staff**: shortcuts, "บิลที่ฉันขายวันนี้", the shop's bills today, returned units
      waiting, and low stock — **no baht amount anywhere** on the page (Q13).

---

## H. Backup, offline, and phones

- [ ] **H.1** ตั้งค่า → สำรองข้อมูล → "สำรองข้อมูลตอนนี้": the new row shows the number of bills ("บิลขาย").
      Restoring it brings sales and returns back exactly.
- [ ] **H.2** With the internet unplugged, a full sale → receipt download → return still works (fonts,
      the QR code, and exports are all local).
- [ ] **H.3** On a phone over the shop WiFi: sell something from "ขายสินค้า" (it works, though it's
      designed for the PC), then open the bill and the dashboard.

---

## What is deliberately missing

Not built in Phase 2, by plan — please don't file these as bugs:

| Not here yet                                                        | Arrives in               |
| ------------------------------------------------------------------- | ------------------------ |
| Builds (จัดสเปก), quotes and converting a quote to a sale           | Phase 3                  |
| Customer devices (the "devices" part of the customer page)          | Phase 3                  |
| Sales post images                                                   | Phase 4                  |
| Repairs; real warranty claims ("ส่งเคลม" only records the decision) | Phase 5                  |
| Trade-ins, reports beyond the dashboard                             | Phase 6                  |
| Card payments, split payments, deposits, printing                   | not in this version (Q9) |
| VAT, tax invoices                                                   | not in this version (Q4) |

Also by design: no manual discounts at the POS (Q6); staff never see cost, profit, or revenue totals
(Q7, Q13); returned units don't re-enter stock until someone decides (Q8); a service can't be
returned — void the bill instead while it has no returns.
