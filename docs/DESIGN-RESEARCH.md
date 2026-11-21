# Design research and direction: Kagu Restaurant

Status: adopted on 2026-11-21. The owner delegated the direction, so the recommendations here were taken as decisions and the first pass is built. "Kagu Restaurant" is a placeholder name.

This document feeds phase 4 of `docs/PLAN.md`. It does not replace `DESIGN.md`, which describes the code as it is and the hard constraints (right-to-left, touch targets, kiosk, content security policy, performance). Once the direction below is confirmed, `DESIGN.md` gets the new tokens and `PRODUCT.md` is written from section 2.

Register: **product**. The interface serves a task; it should disappear into the work.

## 1. What the research says

Sources are listed in section 10. Most are vendor documentation; where a point is my own judgment it is marked.

| Topic | Finding | Consequence |
|---|---|---|
| Speed | Every extra step in a point-of-sale flow repeats thousands of times a day. Staff under pressure invent workarounds, and those reveal missing features. | Count taps on the three core flows and treat each added tap as a cost. |
| Newcomers | Design for someone on their first shift; forced prompts and clear categories reduce entry errors. | Required modifiers prompt; optional ones never interrupt. |
| Touch targets | The research minimum is 1 cm by 1 cm, larger when the user is moving. | The current 48px token passes. Waiters walk, so primary targets on the tab screen go larger. |
| Table status | Toast colours tables by order status and greys out tables that are not yours. Square colours a table after a set time since the check opened. Lightspeed adds inactivity reminders. | Status plus elapsed time on every table; own tables emphasised; a time-based warning. |
| Theme | Toast sets light or dark per device. Square follows the system setting, and merchants reported a dark customer screen being unreadable in sunlight. Claims that dark mode reduces glare come from vendors, not studies. | Theme is per device, chosen by where the device stands. |
| Right-to-left | Back and forward icons mirror; time icons and media controls do not. Material's Arabic example keeps numbers left-to-right. Chart mirroring is unsettled: Wikimedia's guide lists charts among things not to mirror. | Time axes stay left-to-right in both languages. Text lists inside charts follow the reading direction. |
| Dashboards | Three to six figures a viewer can act on, each with a direction. Order: summary, trend, breakdown, table. Some figures are better as an alert than a chart. Strong colour is for alerts. | "Needs attention" first, a short figures strip, detail on demand. |
| Kitchen tickets | Toast prints per station and per course, with item counts and the guest or table name bold on top. Printed tickets keep working when screens do not. | One ticket per station, table label largest, modifiers and notes impossible to miss. |
| Arabic typefaces | IBM Plex Sans Arabic is an open-licence family designed alongside its Latin companion. Noto Sans Arabic has a cut made for buttons and menus. Readex Pro was built for reading ease. No source compared them head to head or confirmed tabular figures. | Choose one family, then verify tabular figures and file size before committing. |

## 2. PRODUCT.md (adopted)

This section is now `PRODUCT.md` at the repository root. Users, purpose and accessibility come from the repository; personality and anti-references were the recommendation the owner delegated.

**Users**

- **Waiter.** Standing, moving between tables, tablet in one hand, often interrupted. May be on their first week. Reads Arabic first.
- **Cashier.** Seated or standing at a fixed till for a whole shift. Handles cash while guests wait. Speed and certainty matter more than anything else.
- **Manager.** Opens and closes the day, authorizes exceptions with a PIN, counts stock. Uses every screen.
- **Owner.** Often not in the venue. Wants to know in under a minute whether today is normal and whether anyone is taking money or stock.

**Product purpose.** One system for a single restaurant: take orders, get them to the kitchen, take payment, control cash and stock, and show the owner what is true. Success is a full service with no order lost, a drawer that matches, and an owner who trusts the numbers.

**Brand personality.** Calm, exact, plain-spoken. It behaves like a good head waiter: quick, never flustered, tells you what happened in a few words. Arabic and English are equals; neither is a translation layer over the other.

**Anti-references**

- The grey, cramped legacy till: tiny buttons, a button for every function, colour everywhere.
- The food-delivery app look: appetite reds and oranges, rounded cartoon shapes, food photography as decoration.
- The software dashboard look: a grid of identical metric cards, gradients, glass panels.

**Design principles**

1. **The next tap is obvious.** Each screen has one primary action, and it is where the hand already is.
2. **Colour means state.** If something is coloured, something is true about it. Decoration is not a reason.
3. **Numbers are the content.** Money and quantities are the largest, clearest things on any screen, aligned and stable.
4. **Nothing is hidden, nothing is lost.** Voids stay visible, locked states look locked, and the app says so when it is unsure whether an order went through.
5. **Arabic first-class.** Layout, type and rhythm are designed in both directions at once.

**Accessibility.** WCAG 2.1 AA. Status never relies on colour alone. Targets at least 48px. Reduced motion respected. Works on low-end Android tablets.

## 3. Design direction

### Theme

Three scenes, not one:

- A cashier at a fixed till near the entrance, under overhead lighting, eight hours a day, reading totals while counting notes. This forces **light**.
- A waiter on a low-brightness Android tablet, moving between a lit dining room and a terrace in daylight. A dark interface washes out on a weak panel in sun. This forces **light**.
- A waiter in a dim lounge in the evening, where a bright tablet glares at guests. This forces **dark**.

Decision: ship the light theme first. Structure the tokens so a dark theme is a second set of values, chosen per device, as Toast does. Dark is not part of the first design pass.

### Colour strategy: Restrained, "ink and paper"

The reflex answers for this category are appetite red or orange (food), blue (point of sale), and purple (the main regional competitor). The direction avoids all three as identity.

- **Paper.** Warm-tinted near-white surfaces, like a menu or a receipt. Easy on a cheap panel.
- **Ink.** Primary actions and the current selection are filled with near-black ink, not a brand colour.
- **Colour is reserved for state.** Green means free or paid. Amber means waiting or low. Red means danger, void or shortage. One blue is used for focus, links, information and the main chart series, because blue stays distinct from red, amber and green for colour-blind users.

Because status must never rely on colour alone, fill carries the first signal: a free table is an outline, an occupied table is filled, and the label and icon say the rest.

Tokens (OKLCH). The table shows the first proposal; the shipped values in `base.css` differ slightly after measurement (the strong border was darkened to reach 3:1, and tints were pulled into gamut). Measured contrast: body text 16.2:1, muted text 6.5:1, information blue 6.5:1, success 5.9:1, danger 6.3:1, ink on amber 8.9:1, strong border 3.5:1.

| Token | Value | Role |
|---|---|---|
| `--rop-bg` | `oklch(0.985 0.004 85)` | Page |
| `--rop-surface` | `oklch(0.965 0.006 85)` | Panels, tiles |
| `--rop-surface-2` | `oklch(0.94 0.008 85)` | Rail, toolbars |
| `--rop-border` | `oklch(0.87 0.008 85)` | Hairlines |
| `--rop-border-strong` | `oklch(0.72 0.010 85)` | Outlined free tables, inputs |
| `--rop-text` | `oklch(0.23 0.010 85)` | Body, ink fills |
| `--rop-text-muted` | `oklch(0.47 0.012 85)` | Meta, hints |
| `--rop-ink` | `oklch(0.23 0.010 85)` | Primary button, selected tab |
| `--rop-ink-text` | `oklch(0.985 0.004 85)` | Text on ink |
| `--rop-info` | `oklch(0.48 0.16 264)` | Focus ring, links, main chart series |
| `--rop-success` | `oklch(0.50 0.13 150)` | Free, paid, in range |
| `--rop-success-tint` | `oklch(0.95 0.04 150)` | Quiet success background |
| `--rop-warning` | `oklch(0.76 0.15 75)` | Waiting, low stock (ink text on top) |
| `--rop-warning-tint` | `oklch(0.95 0.05 80)` | Quiet warning background |
| `--rop-danger` | `oklch(0.50 0.19 27)` | Void, shortage, destructive action |
| `--rop-danger-tint` | `oklch(0.95 0.03 27)` | Quiet danger background |
| `--rop-scrim` | `oklch(0.23 0.010 85 / 0.5)` | Dialog backdrop |

The existing `--rop-accent` becomes `--rop-ink` for actions and selection and `--rop-info` for focus and charts. Charts read CSS variables already, so they follow.

### Typography

One family for both scripts, bundled locally (the content security policy forbids remote fonts).

- **Recommendation:** IBM Plex Sans for Latin with IBM Plex Sans Arabic, two weights (400 and 600), subset, `woff2`. They were designed as one family, so weight and height match across scripts, and the till (Windows) and tablets (Android) look the same.
- **Checked:** tabular figures work (ten 1s and ten 0s measure the same width in the browser). Three weights are bundled (400, 500, 600), about 205 KB of `woff2` in total; the Arabic files load only when Arabic text is on screen.
- **Still to check:** start-up time on the real waiter tablet. If it is noticeable, drop to two weights or fall back to the system stack.
- **Scale:** fixed rem steps at a ratio near 1.2: 0.8125, 0.9375 (body on dense screens), 1, 1.25, 1.5, 2, and a 2.75 display step used only for the amount due, change and the headline figure.
- **Numbers:** tabular figures everywhere; Western digits in both languages, as the app does today. Iraqi banknotes carry both digit forms, so this is safe, but ask the pilot venue.
- **Arabic:** line height about 1.7 against 1.5 for Latin; no letter-spacing; no uppercase tricks for labels, since Arabic has no capitals. Hierarchy comes from size and weight only.

### Layout and navigation

The top bar and nav row use about 136px of an 800px-tall tablet today. Replace both with:

- **A rail on the inline-start edge** on screens 1024px and wider (till, landscape tablets): icon plus label, 48px targets, user and language at the bottom.
- **A bottom bar** under 640px (the owner's phone): four destinations plus "More".
- **Role-based contents.** Waiter: Floor only (the tab screen has its own back control). Cashier: Till, Shift, Floor. Manager and owner: Service (Floor, Till), Reports, Stock, Day, Setup (Menu, Floor plan, Staff, Settings). Nine wrapping links become five groups.
- **Two densities.** Waiter screens are roomy: large targets, few things. Till and back-office screens are compact: more per screen, same components. One `data-density` attribute on the shell, not separate component sets.
- **Breakpoints:** 640px (phone), 1024px (landscape tablet and till). The tab screen needs a portrait rule.

### Motion

150 to 200 ms, ease-out, opacity and transform only, and only to show a state change: a line moving from basket to sent, a table changing state, a pane revealing. No page-load choreography. Everything is instant under reduced motion.

## 4. Screen direction

### Tab (order entry)

Primary action: add items and send. Today the basket sits below the sent lines and totals, so Send can be off-screen, and every sent line carries a large "Void line" button.

- Three zones: categories as a column on the inline-start side, the item grid in the middle, the ticket on the inline-end side.
- The ticket shows the basket first, then sent orders. Total and **Send** are pinned to its bottom edge and never scroll away.
- One tap on an item adds one. A second tap adds another, and the tile shows the quantity. The modifier sheet opens only when a choice is required; optional modifiers and notes are reached from the basket line.
- Sent lines are quiet text. Tapping one expands it in place to show Void (with PIN). Voided lines stay visible, struck through.
- Sold-out tiles are visibly unavailable with a label, not just faded.
- The "checking whether the order went through" lock covers the ticket and the grid with a clear message; it must look locked.
- Target tap counts: add an item with no required modifier, 1; send, 1; open a table and send a two-item order, 5.

### Floor

- Free: outlined tile, label, seats. Occupied: filled tile, label, guests, elapsed time, amount due. Bill printed: filled with a receipt icon and label.
- Elapsed time turns amber, with a clock icon, after a venue-set time without a new order.
- A waiter's own tables carry full emphasis; other waiters' tables are quieter. Managers see all equally.
- Table label is the largest text on the tile; the amount due is second.
- A takeaway list sits beside the grid on wide screens and behind a tab on narrow ones.
- Keep the grid, placed by the stored `grid_x` and `grid_y`. A drawn map adds cost without helping a waiter find a table faster.

### Till

Primary action: take payment. Today the whole screen is one unstyled column and the pay button is far below the bill.

- Three panes: open tabs list (inline-start), the bill (middle), payment (inline-end, always visible).
- The bill pane ends with totals; **Due** is the display-size figure.
- The payment pane, top to bottom: method as a two-option segmented control, quick-tender notes, the amount pad, the change line, **Take payment**. The pad never mirrors in Arabic (existing rule).
- After payment, the pane shows the change in display size until the cashier dismisses it or opens another tab.
- Split is a mode of the bill pane (evenly or by item), not a separate section below everything.
- Discount, comp and refund are secondary actions in the bill header, each behind the existing PIN flow.
- "No shift open" stays a banner with a direct action; card payments keep working.

### Analytics

Primary question: is anything wrong, and is today normal? Today the page is seven equal cards and four single-colour bar charts, and in Arabic the axis labels clip.

- **Needs attention** comes first: a short list of sentences with a figure and a link, such as "Cash short by 12,000 IQD on the evening shift". When there is nothing, it says so in one line.
- **Figures strip:** net sales, covers, spend per cover, food cost %. One row of large tabular numbers divided by hairlines, each with a direction and the comparison in words ("against the last four Fridays"). Not a card grid.
- **Sections on demand:** sales (daily bars and a weekday by hour grid), menu (four plain lists: promote, reprice, reposition, remove), stock (top losses by value), staff (exceptions per person as rates, outliers marked with an icon and label), cash (variance per cashier).
- **Charts:** bars for time, sorted horizontal bars for ranked items, a shaded grid for weekday by hour. No pies. The main series uses `--rop-info`; red and amber appear only on values that are out of range. Axis numbers are abbreviated (28K) and never clip. Every chart keeps its table alternative.
- **Right-to-left:** time axes run left to right in both languages. Ranked bar lists put their labels on the inline-start side. Titles, legends and tables follow the page direction.
- **Phone:** the attention list and the figures strip fit the first screen; sections stack; tables drop columns before they scroll sideways.
- Date range presets gain "This week" and a business-day label once analytics move to the business day.

### Stock and admin

Compact density. Tables with sticky headers, numbers end-aligned, inline editing where one field changes. The blind count shows one input per ingredient and nothing derived, exactly as `DESIGN.md` requires. Empty states say what to do next ("No recipes yet. Add one so sales deduct stock.").

### States

Skeleton rows for loading, not centred text. Busy buttons keep their width and show progress in place. The offline banner is persistent, sits above the content, and says what still works. Errors name the problem and the next step in plain words.

## 5. Kitchen ticket (print)

Monochrome, 80 mm, rendered as an image so Arabic prints correctly. Separate from the app tokens.

- Top: table label or "TAKEAWAY" in the largest type on the ticket, then station, waiter, time, and ticket x of y.
- Body: one line per item, quantity first and bold, name large. Modifiers indented beneath. Notes in reversed type (white on black) so they cannot be missed.
- A void prints as its own ticket with "VOID" across the top.
- Language is a venue setting; Arabic by default.
- No prices on kitchen tickets.

## 6. Design brief for phase 4

1. **Feature summary.** Restyle the whole operator app as Kagu Restaurant: a calm, exact tool for waiters, cashiers, managers and owners, in English and Arabic.
2. **Primary user action.** Per surface: send an order (tab), take payment (till), see what needs attention (analytics).
3. **Direction.** Restrained, ink and paper, colour only for state. Light theme first, dark per device later. Anchors: Square's point of sale for calm and restraint, Toast's table service view for status handling, a printed receipt for the numerals and alignment.
4. **Scope.** Production-ready, whole app, shipped components, built in the order of `docs/PLAN.md` phase 4.
5. **Layout.** Rail navigation, two densities, three-zone tab screen, three-pane till, attention-first analytics.
6. **Key states.** Every state in `DESIGN.md` section 6, plus sold out, bill printed, kitchen printer failing, offline.
7. **Interaction.** One-tap add, pinned Send, inline expansion instead of dialogs for line actions, the existing PIN flow unchanged.
8. **Content.** All strings through `tr()` in both languages; empty states that teach; error text that names the next step.
9. **References to load when building.** From the impeccable skill: `spatial-design`, `interaction-design`, `color-and-contrast`, `typography`, `responsive-design`, `ux-writing`, `cognitive-load`.

Visual direction probes (generated mock images) were skipped because the session had no image generation. The built screens in `docs/screenshots` are the reference instead.

## 7. What changes in the existing rules

- `DESIGN.md` section 2 gains the new tokens; `--rop-accent` splits into `--rop-ink` and `--rop-info`.
- `DESIGN.md` section 7 (open questions) is answered by this document for brand direction, dark mode, floor style, chart palette, density, status colours, typography, navigation, motion and breakpoints.
- `CLAUDE.md` frontend rule "deliberately plain UI, no design-system work" is replaced when phase 4 starts.
- The rail and bottom bar need new markup in `RootLayout.tsx`; `navLogic.ts` gains grouping. That is a logic change outside the "markup only" boundary and needs its own tests.

## 8. Risks

- **Font weight on weak tablets.** Mitigation: subset, two weights, test on the device, system stack as fallback.
- **Ink primary buttons next to ink-filled occupied tables.** On the floor screen there is no primary button, so they do not compete; check this again if a floor action is added.
- **Amber on paper.** Amber has poor contrast as text. Use it as a fill with ink text or with an icon, never as text colour.
- **Chart direction in Arabic.** Guidance is unsettled. Test the time axis with two or three Arabic-reading managers before the analytics pass is final.
- **Contrast was measured by calculation, not on the target hardware.** Check legibility on the real tablet in daylight.

## 9. Questions put to the owner (answered by delegation)

All three were delegated on 2026-11-21 and resolved as recommended: the personality stands, buttons are ink with colour kept for state, and the light theme ships first.

1. **Personality and anti-references.** Does "calm, exact, plain-spoken" and the three anti-references in section 2 match what you want, or is there a product whose feel you would rather follow?
2. **Ink and paper.** Are you comfortable with no brand colour on buttons (ink instead), with colour kept for state? The alternative is one brand accent for primary actions.
3. **Theme.** Light first with dark per device later, or is a dim venue the first customer, which would put dark in the first pass?

## 10. Sources

- Nielsen Norman Group: [touch target size](https://www.nngroup.com/articles/touch-target-size/)
- UXmatters: [designing point-of-sale systems](https://uxmatters.com/mt/archives/2018/04/designing-point-of-sale-systems.php)
- dev.pro: [ten point-of-sale usability tactics](https://dev.pro/insights/designing-a-pos-system-ten-user-experience-tactics-that-improve-usability/)
- WWT: [a restaurant associate turned product designer](https://www.wwt.com/article/confessions-from-a-qsr-associate-turned-ux-digital-product-designer)
- Menusifu: [touch-screen point of sale](https://www.menusifu.com/blog/what-is-touch-screen-pos-system)
- Toast: [service areas and table setup](https://support.toasttab.com/article/Creating-Service-Areas-and-Table-Setup-1493049150430), [light and dark mode per device](https://support.toasttab.com/en/article/Setting-Up-the-New-POS-Experience), [configuring kitchen tickets](https://doc.toasttab.com/doc/platformguide/platformKitchenConfiguringTickets.html), [details on kitchen tickets](https://support.toasttab.com/en/article/Adding-Due-Times-Ticket-Counts-and-Payment-Status-to-Kitchen-Tickets)
- Square: [table management settings](https://squareup.com/help/ca/en/article/8146-customize-table-management-settings), [dark mode community thread](https://community.squareup.com/t5/Payments-Troubleshooting/Dark-Mode-Removed-from-POS/m-p/775161/highlight/true)
- Lightspeed: [table status and reminders](https://www.lightspeedhq.com/pos/restaurant/speed/)
- SpotOn: [dark mode on handhelds](https://www.spoton.com/blog/darkmode-handheld-pos-benefits)
- Material Design: [bidirectionality](https://m2.material.io/go/design-bidirectionality), [Readex Pro and Arabic legibility](https://material.io/blog/readex-pro-legibility-arabic-type-design)
- Wikimedia Codex: [bidirectionality](https://doc.wikimedia.org/codex/latest/style-guide/bidirectionality.html)
- Apple: [right to left](https://developer.apple.com/design/human-interface-guidelines/right-to-left.md)
- Google Fonts: [IBM Plex Sans Arabic](https://fonts.google.com/specimen/IBM%2BPlex%2BSans%2BArabic/about)
- Toptal: [dashboard design](https://www.toptal.com/designers/ui/dashboard-design-best-practices), Growth-onomics: [mobile KPI dashboards](https://growth-onomics.com/how-to-design-mobile-kpi-dashboards/)
- Mews: [kitchen order tickets](https://www.mews.com/en/blog/kitchen-order-ticket)
