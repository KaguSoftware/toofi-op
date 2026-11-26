# 05: Guest UI: basket, order and status

Status: ready-for-agent
Blocked by: 04

Let the guest build an order, send it, and see what staff decided.

## Build

- The order lives on the phone until it is sent (`localStorage`, per table session), so a refresh or an expired session does not lose it. Prices shown are a mirror of the menu; the server prices the real thing.
- Plus adds one. A dish with modifier groups opens the options sheet first: one block per group with its minimum and maximum, options as tiles, "Add to order". Enforce min and max before adding; the server checks again.
- In the order: minus, count, olive-filled plus on the row. Cap one dish at 20.
- **Your order** sheet: lines with photo, stepper and line total, the optional note (140 characters, with a counter near the limit), the total, **Send order**, and the confirmation hint.
- Send: one idempotency key per attempt, kept until the server answers, so a retry after a dropped reply cannot create a second order. While the outcome is unknown, lock the sheet and say so (the staff app's "unclear send" pattern in `apps/operator/src/lib/unclearLogic.ts` is the model).
- After sending: clear the order, show the status strip. Pending, accepted, declined, expired; after 3 minutes pending add "ask a waiter". Poll `/api/status` every 5 seconds only while something is waiting.
- Handle: ordering switched off, restaurant closed, 3 orders already waiting, a dish that went unavailable (refresh the menu and mark the line), expired session (keep the order, ask for a scan).

## Rules

- Pure logic in `basketLogic.ts` with tests: add, remove, merge equal lines, totals, the 20 and 40 caps, modifier validation, what is sent to the server.
- The request carries item ids, quantities, modifier ids and the note. Never a price.
- **Send order** is the one terra cotta control while the sheet is open.

## Done when

- Scan, add dishes with and without options, send, and the order appears in `app.guest_inbox()`; accepting or declining it in the database changes the strip on the phone within a few seconds.
- A double tap on Send, or a retry after a cut connection, creates exactly one `guest_orders` row.
- Tests cover the logic file and every state above, in both languages.
