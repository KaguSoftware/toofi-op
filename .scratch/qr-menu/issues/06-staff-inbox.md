# 06: Staff app: alerts, sound, OK and Decline

Status: ready-for-agent
Blocked by: 01

Staff must see a guest's call or order on whatever screen they are on, and answer with one tap. All four roles can do this.

## Build (in `apps/operator`)

- New feature folder `features/guest/`: `GuestInbox.tsx` and `guestLogic.ts` with its test. Mount the inbox in `shell/RootLayout.tsx` so it shows on every screen.
- Data: `app.guest_inbox()` through `appRpc`, a new key in `lib/queryKeys.ts`, and `['guest']` added to the `tabs` topic prefixes so the existing realtime signal refetches it. Also refetch every 30 seconds in case a signal is missed.
- A call row: table label, reason, how long it has waited, **OK** (`answer_waiter_call`). The first tap wins; a second device gets `already` and just refreshes.
- An order row: table label, the lines, the total, and a note when the price changed or a dish is unavailable. **OK** runs `accept_guest_order`; when `table_has_tab` is false, ask for the guest count first (reuse the one-tap counts from `features/floor/FloorScreen.tsx`). **Decline** runs `decline_guest_order` behind a confirm. If accept fails because a dish went inactive, say so and leave Decline as the way out. On `TABLE_OCCUPIED`, retry once.
- Accepting uses one idempotency key per tap (`newIdem('guest_accept')`), then refreshes floor, tab and bill (`refreshTabs`).
- Order: your own tables first, then oldest first. Waiting time turns amber at 2 minutes and red at 5; the words say the time, colour only supports it.
- Sound: a short chime on a new call or order, and a repeat every 60 seconds while something has waited over 5 minutes. Adapt `../TouchPadel/apps/operator/src/lib/audio.ts` and `features/till/alarms.ts` + `useAlarms.ts` (tones made in code, no audio files; browsers need one tap to enable sound, Electron does not).
- Floor: a "Calling" badge with the waiting time on the table's tile, free tables included, from the same inbox data.
- Idle lock: the chime still plays; the list shows after unlock.

## Rules

- Role checks come from `@rop/core`; the server is the real gate.
- Kit components and tokens only (`DESIGN.md`); every string in both catalogs; logical properties.
- One primary action per row. Decline is a quiet secondary.

## Done when

- A call or an order raised through the guest functions appears on a second signed-in device within a few seconds, with sound; OK clears it on both and updates `guest_status`.
- Accepting on a free table opens the tab with the chosen guest count and the lines appear on the tab screen and the bill; stock moves once.
- `guestLogic.test.ts` covers ordering, urgency and the re-chime rule; component tests cover OK, Decline, the guest-count step and the failure messages.
