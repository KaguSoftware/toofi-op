# 04: Guest UI: menu and call waiter

Status: ready-for-agent
Blocked by: 03

Build the menu screen and the call-waiter flow exactly as `design.md` describes. The approved mock is `design/guest-menu-mock.dc.html` (`topBar` = `cream`, `rows` = `ornament`); lift its SVG drawings, icons and copy, not its code structure.

## Build

- Top bar (table plate, restaurant name from `guest_menu().venue.name`, one language button), the star strip, the single corner ornament.
- Category rail with icon tiles, section headings with the icon, tap-to-scroll and a selected tile that follows the scroll.
- Dish rows as solid cards with the photo (or the no-photo tile), name, plain-number price, the fixed row ornament, and the plus button. In this ticket the plus only needs to work visually if ticket 05 is not started; do not fake an order.
- Bottom bar with **Call waiter** and **Your order** (the order half shows its empty state until ticket 05).
- Call waiter: the four-reason sheet, then the status strip (waiting, on the way), the wait-before-calling-again countdown, and the "scan your table's code" sheet when there is no table.
- States from `design.md`: no table, expired session, closed, calls switched off, offline banner, menu loading, empty and failed.
- Light and dark from the phone's setting. Arabic and English, each checked at 360 px and 390 px.

## Rules

- Tokens only; logical properties only; every string through `@rop/i18n`.
- One terra cotta control per screen. On this screen that is **Your order** when it has items; Call waiter is charcoal.
- Poll `/api/status` every 5 seconds only while a call is waiting; stop when it is answered.
- Use the `impeccable` skill's product register and its `audit` and `polish` passes before handing back; the owner chose that skill for this design.

## Done when

- A phone on the same Wi-Fi can scan a printed or on-screen code, see the menu in both languages and both themes, call a waiter, and see "on the way" after `app.answer_waiter_call` runs.
- Component and logic tests cover every button state listed above.
- Contrast is measured at 4.5:1 for text in both themes; every control is at least 44 px.
