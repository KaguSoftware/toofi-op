# Guest QR menu: the design the owner picked

Decided on 2026-11-26. The owner chose the screen called **"White rows with green ornament"** on the design canvas, after several rounds. Build this, not an earlier variant.

- Canvas (owner's private link): https://claude.ai/artifact/LmsHMRf3g8LK4KSHgW3nZD
- Mock source in this repo: `design/guest-menu-mock.dc.html`. The picked screen is that file with `theme` = light or dark, `topBar` = `cream`, `rows` = `ornament`.

The mock is a 390 px wide phone. Every number below comes from it. Hex colours in the mock are close matches to the `--rop-*` tokens; production reads tokens, never raw hex (see "Tokens").

## Direction

A diner at their own table, phone in one hand, in warm dim light or on a bright terrace. The page is the restaurant's menu card: warm cream paper, charcoal ink, forest for selection, terra cotta for the single action, copper and olive ornament. It follows the phone's light or dark setting. Arabic and English are designed together; Arabic is the default unless the phone asks for English.

`PRODUCT.md` rules out "food photography as decoration". The owner has since asked for a photo on every dish. Photos here are content: one real photo per dish, small, in the row. No hero images, no decorative food imagery. Ticket 08 rewords that line.

## Screen, top to bottom

| Region | Spec |
|---|---|
| Corner ornament | One, in the top inline-end corner, behind the content. 180 × 128. A curved band (olive line, dotted soft-terra line, copper line, faint outer echo) sweeping from the top edge to the side edge, with one eight-petal flower, copper scrolls, outlined olive leaves. Opacity 0.78 light, 0.65 dark. Mirrors in Arabic. No straight frame. There is **no all-over page pattern**. |
| Top bar | One row, padding 14 16 12, transparent over the page. Table plate, then the restaurant name (20/600), then one language button. No "prices in Iraqi dinar" line. |
| Table plate | 54 × 54, radius 12, Charcoal Ink fill, 1 px copper border with a second copper hairline inside (the staff app's doorplate). Small label "TABLE" (10 px uppercase, tracking 0.08em; Arabic 11 px, no tracking) over the table label at 22/600. |
| Language button | 46 × 46, radius 12, raised fill, 1 px border. Shows the other language ("ع" in English, "EN" in Arabic). |
| Strip | Under the top bar: rule fading in, copper star, short rule, olive star, rule fading out (the staff app's header strip). |
| Category rail | Horizontal, scrolls sideways, gap 8, padding 10 16 12. Each category is a tile: min 74 × 70, radius 14, icon 24 (stroke 1.6) above the name (13/600). Selected: forest fill, cream text, light copper icon. Others: raised fill, 1 px border, forest icon. Tapping scrolls to the section; the selected tile follows the scroll. |
| Section heading | 15/600, uppercase with 0.08em tracking in English, forest ink (light copper in dark). The category icon at 18, the name, a copper rule, an olive star. |
| Dish row | A solid warm-white card: radius 16, padding 10, 8 px between rows, 1 px inner line and a soft shadow. Photo 76 × 76, radius 14, at the inline start. Name 16/600, then the price 15/500 as a plain number with thousands separator and **no currency**. Controls at the inline end. |
| Row controls | Not in the order: one plus button, 44 px circle, 1.5 px forest border, transparent. In the order: minus button (44, raised, bordered), the count (16/600, olive), then the plus button filled olive. Tapping plus adds one; an item with modifier groups opens the options sheet first. |
| Row ornament | One scroll motif lying on its side, 90 × 54, vertically centred, its inline-end edge 64 px from the row's inline-end edge (so it sits in the gap between the name and the plus). Soft green `#4F7A46` at opacity 0.14 (dark: `#A9B45A` at 0.10). **It never moves**: when the minus and count appear they sit on top of it. Mirrors in Arabic by position. |
| Status strips | Above the bottom bar, only when there is something to say. Waiting: amber tint, clock or bell icon. Good news: olive tint, check icon. 44 px min height, radius 10, 14/500. |
| Bottom bar | Fixed, page fill, 1 px top border, padding 10 12 14, gap 10. **Call waiter**: 136 × 60, radius 14, Charcoal Ink fill, bell icon (dark theme: raised fill with a border). **Your order**: fills the rest, 60 high, radius 14; terra cotta with "3 items · IQD 25,000" under the title when it has items, recessed and muted with "Nothing added yet" when empty. |

## Sheets

Both rise from the bottom over a scrim, radius 22 on the top corners, a 40 × 4 grip, a title at 20/600 and a 44 px close button.

- **Your order.** Table label beside the title. One line per dish: 44 px photo, name, minus, count, plus, line total. A labelled note field (140 characters, optional). "Total" with the amount at 28/600 including the currency. **Send order**: 56 high, terra cotta, the only terra cotta control on screen. Under it: "A member of staff confirms your order before it is prepared." Empty: a sentence saying how to add dishes, and Send is recessed and disabled.
- **Call waiter.** "What do you need?" and four tiles in a 2 × 2 grid (min height 92, radius 14, icon above the label): To order, The bill, Water, Help. Under them: "A waiter will come to table 5."
- **Item options.** Not in the mock. Same sheet shell; one group per modifier group with its min and max, options as tiles (as the staff app's item sheet does), quantity stepper, "Add to order".

## States the build must cover

| State | What the guest sees |
|---|---|
| No table (opened without a QR code) | The menu, browsable. Call waiter and Send order open a sheet asking to scan the table's code; the order is kept. |
| Bound to a table | The table plate shows the label. |
| Session expired | "Scan the code on your table again." The order is kept on the phone. |
| Restaurant closed (no open business day) | Menu readable; both actions say service is closed. |
| Calls or ordering switched off | That action is hidden or explained; the other still works. |
| Call waiting, then answered | Strip "Waiter called. Please wait a moment." then "A waiter is on the way." |
| Wait before calling again | The call button shows the time left; tapping explains it. |
| Order pending, accepted, declined, expired | Strip per status. Declined and expired say to ask a waiter. After 3 minutes pending, add "ask a waiter" to the waiting text. |
| Limits | 3 orders waiting, 20 of one dish, 40 lines: a plain sentence, no error code. |
| Dish no longer available at send | The menu refreshes and the line is marked so the guest can remove it. |
| Offline | A banner; nothing is sent until the connection returns. |
| Menu loading, empty, failed | Skeleton rows; "Nothing on the menu yet"; "The menu is taking a moment" with Retry. Never a blank page. |
| Dish without a photo | The 76 px tile in the recessed fill with the category icon, so rows keep their shape. |

The staff reply is polled every 5 seconds, only while a call or an order is waiting.

## Colours used in the mock

Production uses tokens (next section). These are the mock's values, for matching.

| Role | Light | Dark |
|---|---|---|
| Page | `#F2E9D8` | `#18181A` |
| Raised (tiles, buttons, sheets) | `#FBF6EC` | `#232325` |
| Recessed | `#E7DCC6` | `#2D2D30` |
| Dish row card | `#FFFDF8` | `#242426` |
| Border / row line | `#D6C9B0` / `#E0D4BC` | `#3B3B3E` / `#2F2F32` |
| Text / muted | `#1C1C1E` / `#55615A` | `#F2E9D8` / `#B5AE9F` |
| Heading ink | `#1E3A2F` | `#D9B089` |
| Forest (selection) / on it | `#1E3A2F` / `#F2E9D8` | `#2F5C4A` / `#F2E9D8` |
| Terra cotta (the action) / on it | `#B84C2E` / `#FFF7EE` | same |
| Olive (in-order, good news) / on it | `#5B6A2B` / `#FBF6EC` | `#A9B45A` / `#18181A` |
| Copper (ornament) | `#C98A5E`, soft terra `#B9684A` | same |
| Waiting strip fill / border | `#F6E6B4` / `#B98A22` | `#3A3013` / `#9A7A22` |
| Good strip fill / border | `#E3E6C6` / `#8E9850` | `#28301A` / `#6F7A36` |
| Call button fill / text / border | `#1C1C1E` / `#F2E9D8` / same | `#2D2D30` / `#F2E9D8` / the border-strong token (the mock's `#5C5952` measured 2.5:1 against the page, under the 3:1 rule) |
| Scrim | forest at 50% | near-black at 62% |

Check every text and state pair at 4.5:1 in both themes, and control boundaries at 3:1.

## Tokens

- Ticket 03 moves the `--rop-*` tokens out of `apps/operator/src/styles/base.css` into a shared package that both apps import. The staff app must look identical afterwards and stays light only.
- The guest site adds a dark set under `prefers-color-scheme: dark`, from the Dark column above, converted to OKLCH like the existing tokens.
- New tokens the guest site needs: the dish row card fill, the row ornament green, and the dark set. Name them `--rop-*` beside the existing ones.
- No raw hex in guest site feature CSS or TSX.

## Ornaments and icons

All drawings are original and live in the mock as inline SVG. Lift them into components; keep the path data.

| Drawing | In the mock | Build as |
|---|---|---|
| Corner ornament | the first `<svg viewBox="0 0 180 128">` | `CornerOrnament` |
| Row ornament | `<svg viewBox="0 0 100 60">` inside the dish row (a 60 × 100 motif rotated a quarter turn) | `RowOrnament` |
| Header strip and heading star | the 12 × 12 four-point star paths | reuse the staff app's strip from the shared tokens if it fits |
| Category icons | the `icon` strings in `menu()` (bowl, flame, cloche, cupcake, cup) | one icon set keyed by the category icon key from ticket 02 |
| Bell, plus, minus, close, check, clock, order, bill, water, help | inline in the mock | the guest site's `Icon` component: 24 grid, stroke 1.75, `currentColor` |

The dish "photos" in the mock are drawn plates. They are stand-ins. Production shows the real photo from ticket 02.

## Type, motion, access

- IBM Plex Sans and IBM Plex Sans Arabic, weights 400, 500, 600, bundled locally (no font CDN). Line height 1.5, and 1.7 in Arabic. Tabular figures; Western digits in both languages.
- Motion: 150 to 240 ms, ease-out, transform and opacity only. Sheets slide up, the count pops when it changes. `prefers-reduced-motion` turns it off.
- Every control is at least 44 px (48 where the layout allows). A visible focus ring everywhere. Real buttons, links, labels. Status is never colour alone.
- Works from 360 px wide. On wider screens the column stays phone-width and centred.

## Copy

English and Arabic strings for every label, status and hint are in the mock's `copy()` function. Move them into the `@rop/i18n` catalogs under a `guest.*` namespace and have a native reader check the Arabic. Guest wording must never mention staff tools (see "Reused codes with staff wording" in `spec.md`).
