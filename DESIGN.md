# DESIGN.md: the Kagu Restaurant interface

For anyone changing how the app looks. The direction is **charcoal, forest and terra cotta on warm cream, with Arabic geometric ornament**: Charcoal Ink (#1C1C1E) frames the app (rail and bars, header doorplates, the selected category, the ticket band, the amount-due plate, toasts) and sets the text; Deep Forest (#1E3A2F) marks seated tables and selection; Terra Cotta (#B84C2E) is the action colour; Warm Cream (#F2E9D8) is the page. Small details alternate copper (#C98A5E) and olive, and **the only greens are forest and olive**: good news (free tables, paid, day open) is olive. The zakhrafa is an eight-point-star lattice, an ornament strip under every page header, and a doorplate badge for page icons (a charcoal rounded square in a thin olive or copper double frame). The brand mark is a date-palm sprig with a terra cotta bud in a double copper frame (`BrandMark.tsx`). Depth comes from soft shadows and motion from short transform and opacity moves. `PRODUCT.md` holds the why; the palette is the owner's choice of 2026-11-22. The brand name is a placeholder (strings live in `brand.config.json`).

## 1. Purpose and ground rules

The UI is semantic HTML, a small component kit, and CSS variables. Logic and UI are separated, so visual work should touch only these places:

| Touch | Path |
|---|---|
| Tokens | `packages/tokens/tokens.css` (`@rop/tokens`, shared with the guest site; `guest.css` there is the guest site's own set) |
| Global styles | `apps/operator/src/styles/base.css` (imports the tokens and font faces first) |
| Per-feature styles | `apps/operator/src/features/floor/floor.css`, `tab/tab.css`, `till/till.css`, `manage/manage.css` |
| Kit markup | `apps/operator/src/components/*.tsx` (not `padLogic.ts`) |
| Screen markup | `apps/operator/src/features/*/*Screen.tsx` and sibling panels (`BasketPanel`, `BillPanel`, `PaymentPane`, ...) |
| Shell markup | `apps/operator/src/shell/RootLayout.tsx` (markup only) |

Do not touch:

- `*Logic.ts` files and their tests (`tillLogic`, `basketLogic`, `floorLogic`, `receiptLogic`, `splitLogic`, ...).
- Everything in `apps/operator/src/lib/` (`navLogic`, `idleLogic`, `pinLogic`, `appRpc`, `errors`, `realtime`, `queryKeys`).
- `appRpc()` calls, query keys, role gates (`canAccess`, `can`) and the PIN flow wiring.
- The behaviour of `IdleLock.tsx` and `KioskControls.tsx` (restyle their markup and classes only).
- Text: every string goes through `tr()`; never hard-code a string in markup.

Where things live today:

- Five CSS files: `base.css` plus one per feature area. No CSS framework, no CSS modules, no CSS-in-JS. `base.css` is imported first in `main.tsx` so feature files can override it at equal specificity; keep that order.
- Classes are BEM-like: `rop-*` for the kit and shell, `floor__*`, `tab__*`, `basket__*`, `item-sheet__*`, `manage__*` per feature.
- State is exposed through ARIA and data attributes (`aria-selected`, `aria-pressed`, `aria-current`, `aria-busy`, `data-state`, `data-inactive`, `data-voided`, `data-align`). Style those; do not replace them with new class toggles.
- The shift screen (`rop-shift*`) and the stock and setup screens are only lightly styled: they inherit the tokens and kit and still need their own pass.

## 2. Tokens

All tokens are defined once on `:root` in `packages/tokens/tokens.css`, with `color-scheme: light`. The guest site also imports `guest.css` from the same package (its dark set and row tokens); the staff app does not.

| Token | Value | Used by |
|---|---|---|
| `--rop-space-1` to `--rop-space-6` | 0.25, 0.5, 1, 1.5, 2, 3rem | gaps and padding |
| `--rop-radius-sm`, `--rop-radius`, `--rop-radius-lg` | 0.375, 0.5, 0.75rem | pills; buttons, inputs, tiles; panels, tables on the floor, dialogs |
| `--rop-target` | 3rem (48px) | minimum size of every control |
| `--rop-font-xs` to `--rop-font-display` | 0.8125, 0.875, 1, 1.25, 1.625, 2, 2.75rem | fixed scale; the display step is only for amount due, change and pad totals |
| `--rop-font-family` | IBM Plex Sans, IBM Plex Sans Arabic, system | everything; tabular figures are on globally |
| `--rop-leading` | 1.5, and 1.7 under `:lang(ar)` | body line height |
| `--rop-bg`, `--rop-raised`, `--rop-surface`, `--rop-surface-2` | Warm Cream `oklch(0.937 0.025 83)` and lighter and deeper steps | page; tiles, buttons, inputs, panels; quiet and recessed fills |
| `--rop-border`, `--rop-border-hover`, `--rop-border-strong` | cream to sage | hairlines; hover; input boundary (3:1) |
| `--rop-text`, `--rop-text-muted` | Charcoal Ink `oklch(0.227 0.004 286)`; sage `oklch(0.45 0.02 160)` | body; meta and hints (4.5:1 or better) |
| `--rop-brand`, `-hover`, `-deep`, `-ink`, `-tint`, `-tint-2`, `--rop-on-brand`, `--rop-on-brand-muted`, `--rop-grad-brand` | Deep Forest `oklch(0.322 0.04 167)`; its tints lean olive-cream, never mint | seated tables, selected rows, in-basket tiles, the forest text on cream |
| `--rop-terra`, `-ink`, `-tint`, `--rop-on-terra`, `--rop-grad-terra` | Terra Cotta `oklch(0.554 0.147 36)` | primary buttons, counts (basket, item quantity), focus ring, header tiles on business and setup screens |
| `--rop-charcoal`, `--rop-grad-charcoal`, `--rop-on-charcoal`, `--rop-on-charcoal-muted`, `--rop-shadow-charcoal`, `--rop-grad-rail` | Charcoal Ink `oklch(0.227 0.004 286)` | the app's frame and the dark details listed above |
| `--rop-olive`, `--rop-olive-bright`, `--rop-olive-tint`, `--rop-grad-olive` | `oklch(0.46 0.09 120)`; bright `0.72 0.1 118` on dark | half of the small details (logo leaves, service badges, current-item underlines, quantity badges, every second ornament star) and every "good" status |
| `--rop-copper`, `--rop-copper-tint` | `oklch(0.687 0.097 55)` | ornament lines, the brand mark outline, the current nav link's underline, your own tables |
| `--rop-zakhrafa-on-dark`, `-strip`, `-star` | inline SVG `data:` images | the star lattice on forest surfaces, the header ornament strip, the empty-state star |
| `--rop-zakhrafa-page` | `oklch(0.885 0.032 82)` | the woven eight-fold star pattern behind every screen (`packages/tokens/zakhrafa-page.svg`, fixed on `body::before`) |
| `--rop-panel`, `-sunk`, `-selected`, `-danger` | raised, surface-2, brand tint and danger tint at `--rop-panel-opacity` (80%) | every surface that lies on the page: panels, tiles, forms, fields, secondary buttons, segmented tracks, notices. `--rop-grad-success` follows the same opacity |
| `--rop-selected`, `--rop-occupied`, `--rop-ink`, `--rop-accent` | aliases of the brand tokens | older names kept so every screen follows the palette |
| `--rop-chart` | forest `oklch(0.42 0.06 165)` | chart series |
| `--rop-success*`, `--rop-grad-success` | aliases of olive | free, paid, in range; the payment and day-open confirmations (no other green) |
| `--rop-warning*`, `--rop-on-warning` | amber `oklch(0.79 0.14 78)` | waiting, low, open 90 minutes or more |
| `--rop-danger*` | crimson `oklch(0.5 0.19 15)` | void, shortage, destructive action, errors; kept apart from terra cotta by hue and by always being outlined except in a confirm dialog |
| `--rop-shadow-sm`, `-md`, `-lg`, `-brand`, `-terra`, `-success` | forest-tinted soft shadows | resting tiles and buttons; panels and hover lift; dialogs and toasts; coloured surfaces |
| `--rop-scrim` | forest at 50% | dialog backdrop |
| `--rop-ease`, `--rop-fast`, `--rop-base`, `--rop-slow` | ease-out quint; 150, 240, 380ms | feedback, state changes, entrances |
| `--rop-rail`, `--rop-bar`, `--rop-tabbar`, `--rop-chrome` | 6.25rem; 4rem; 4.25rem; block space the shell takes | icon rail width; top bar height; tablet bottom bar height; full-height screens subtract `--rop-chrome` from the viewport |

Rules that come with the tokens:

- **Terra cotta is the action colour, used once per screen.** Only the primary action (Send, Take payment, Save, Open the day) is terra cotta. A button that only prepares that action is secondary. A disabled primary drops to a recessed `--rop-surface-2` slot.
- **Forest is structure and selection.** The rail and bars, seated tables, selected category chips, the selected till row and the amount-due plate are forest. The current nav link is a cream pill with a copper underline. Horizontal option sets use the `.rop-segmented` track, the chosen option raised with a shadow.
- **Ornament is copper and quiet.** The lattice sits at low opacity on forest surfaces (the rail and top bar are plain); the strip under each page header fades out at both ends. Never put ornament behind text that must be read quickly, except as a faint corner motif. The one exception is the page pattern: it stays within 0.06 lightness of the cream.
- **Data never sits bare on the page.** Every table, figure, chart, form, filter and note is on a `--rop-panel*` surface, all at one opacity (`--rop-panel-opacity`, 80%). Solid: dialogs and toasts (they cover content), the rail and bars, the raised chip in a segmented track, and the dark or saturated state fills (seated tables, amount-due plate, primary buttons), where light text needs the full fill for contrast.
- **State borders are tinted.** Banners, notices and the variance pill use the `*-tint` fill with the matching `*-border`. Danger buttons are outlined, and solid crimson only in a dialog footer where they confirm.
- **Row actions in tables are ghost buttons** with no resting shadow.
- **Focus:** a 3px terra cotta ring everywhere, except on forest surfaces (rail, bars, seated tables), where it turns copper so it keeps 3:1.
- **Contrast on colour:** text on the terra cotta and forest gradients is checked at both ends of the gradient (4.5:1 or better); badges on forest use a darkening glass, never a lightening one.
- **Tables** keep their natural width (`min-inline-size: max-content`) and scroll inside their panel on small screens instead of squeezing controls.
- **Phones:** the floor drops floor-plan placement and flows tables two to a row.
- **Depth:** tiles and buttons rest on `--rop-shadow-sm`; panels on `-md`; dialogs and toasts on `-lg`. Tappable tiles lift on hover (pointer devices only) and squeeze on press.
- **Motion:** each screen rises in on arrival (`.rop-main > *`); grids cascade (`.rop-cascade`, up to 270ms of stagger); dialogs scale in; basket lines slide in; count badges pop when they change; a payment ends with a drawn checkmark. Only `transform` and `opacity` animate, entrances use `animation-fill-mode: backwards` so hover and press transforms still work, and `prefers-reduced-motion` turns it all off.

How to theme:

- Change values on `:root`; every component follows. Add new tokens beside the existing ones, prefixed `--rop-`.
- **Dark mode is not implemented, by decision: light ships first** (the till and daylight terraces force light). It is planned as a per-device setting. `color-scheme: light` is hard-set and nothing switches themes. To add it, define a second token set (for example under `:root[data-theme='dark']` or `prefers-color-scheme`), switch `color-scheme`, and recheck contrast. Screens already use tokens only, so no markup change is needed.
- **No raw colours outside `base.css` and `@rop/tokens`** (project rule). Feature CSS and TSX must use `var(--rop-*)`.
- Exception: the receipt and day-report HTML (section 5) are standalone documents and cannot read tokens.

Charts read the CSS variables directly. `ManageScreen.tsx` uses Recharts `BarChart` and passes strings as SVG attributes: `stroke="var(--rop-border)"` (grid and the category axis line), tick labels in `--rop-text-muted` at 12px with no tick marks and no value-axis line, `fill="var(--rop-chart)"` (bars, 44px at most, 3px top radius), and a `--rop-surface-2` hover cursor. The browser resolves them, so a theme change recolours charts with no JS. There is one series colour today, the information blue. Each chart container is `dir="ltr"`: time and value axes read left to right in both languages, which is the one intentional `dir` outside `LocaleProvider` and the bilingual inputs. Each chart sits in `.manage__chart` (13rem high) with `role="img"` and an `aria-label` summary, and a table alternative next to it.

## 3. Component inventory

All in `apps/operator/src/components/`, exported from `index.ts`.

| Component | Props | Classes | States and behaviour to preserve |
|---|---|---|---|
| `Button` | `variant` (`primary`, `secondary` default, `danger`), `busy`, native button props | `rop-btn rop-btn--{variant}` | `busy` sets `aria-busy="true"`, drops `onClick` and shows a spinner. `disabled` renders at 0.45 opacity, `not-allowed`; a disabled primary is a recessed slot instead. Default `type="button"`. Min 3rem square. Toggles use `aria-pressed` and stay `secondary`: never switch the variant to `primary` to show a pressed state. |
| `Icon` | `name` (`IconName`), `size?` (24) | `rop-icon`, `data-mirror` | The one icon set: inline SVG, 24px grid, 1.75 stroke, `currentColor`, `aria-hidden`. The control around it carries the name. Directional icons (back, forward, sign out, send) mirror under `dir="rtl"`. Add icons to `PATHS` in `Icon.tsx`; never add an icon font or a second set. |
| `PageHeader` | `title`, `meta?`, `actions?`, `lead?`, `children?`, `className?`, `icon?`, `tone?` (`brand` olive doorplate, `accent` copper doorplate) | `rop-page-head`, `__row`, `__title`, `__meta`, `__actions` | The top of every screen: the `h1`, one quiet status line (counts, shift or day status, who), the screen's own actions at the inline end, a `lead` such as a back link, and a sub-navigation row as `children`. |
| Badges and dots | markup only | `rop-badge[data-tone=success\|warning\|danger\|ink]`, `rop-dot` | Small status labels. The text always states the status; the tone only supports it. |
| Ghost and icon buttons | `className` on `Button` | `rop-btn--ghost`, `rop-btn--icon` | Ghost: no box until hovered. Icon: square, no padding; always give it an `aria-label`. |
| `.rop-segmented` | class on a `role="group"`, `role="tablist"` or `nav` wrapper | `rop-segmented` | Children are `.rop-btn` (with `aria-pressed` or `aria-selected`) or links (with `aria-current="page"`). Do not give the wrapper its own `display` or `gap` in feature CSS. |
| `Field` | `label`, `hint?`, `error?`, `children(p)` render prop | `rop-field`, `rop-field__hint`, `rop-field__error` | Wires `label for`, `aria-describedby` (hint, error) and `aria-invalid` via the render prop; the error is `role="alert"`. Always spread `{...p}` on the control. |
| `Modal` | `open`, `title`, `onClose`, `dismissible` (default true), `footer?` | `rop-modal`, `rop-modal__body`, `rop-modal__header`, `rop-modal__footer` | Native `<dialog>` opened with `showModal()`: browser traps focus, gives `::backdrop`, Esc calls `onClose` only when dismissible. `aria-labelledby` on the h2. Close button has `aria-label` and a "x" glyph. Content renders only while open. Width `min(32rem, 94vw)`. Do not replace with a div overlay. |
| `ConfirmDialog` | `open`, `title`, `message?`, `confirmLabel?`, `danger?`, `busy?`, `onConfirm`, `onCancel` | built on Modal | Cancel (secondary) then Confirm (primary or danger). Danger must stay visually distinct. |
| `PinReasonModal` | `open`, `action`, `title?`, `reasonRequired` (default true), `entityId?`, `value?`, `onGranted`, `onClose` | Modal + `rop-form`, `rop-field__error`, `rop-modal__footer` | See the PIN flow below. |
| `DataTable<T>` | `columns` (`key`, `header`, `cell`, `align`), `rows`, `rowKey`, `caption`, `loading?`, `emptyMessage?`, `rowClass?` | `rop-table-wrap`, `rop-table`, `data-align` | Loading renders `Loading`; no rows renders `EmptyState`. Caption is visually hidden but required. Headers use `scope="col"`. Wrapper scrolls horizontally. `rowClass` highlights a row and must never be the only signal. |
| `Money` | `amount` (integer IQD) | `rop-money` | A `<bdi>` with tabular figures. Keep `bdi` so numbers stay LTR-isolated inside RTL text. IQD has no decimals. |
| `AmountPad` | `value`, `onChange`, `max?`, `label?` | `rop-pad`, `rop-pad__value`, `rop-pad__keys` | `role="group"`; display is `<output aria-live="polite">`. Keys 7 8 9 / 4 5 6 / 1 2 3 / 0 00 000 / backspace, Clear in a 3-column grid, 4rem keys, max width 20rem. Key order comes from `PAD_KEYS`; do not reorder or mirror. |
| `Loading` | `label?` | `rop-state` | `role="status"`. |
| `EmptyState` | `message?`, `action?` | `rop-state rop-state--empty` | Should say what to do next via `action`. |
| `ErrorState` | `error`, `onRetry?` | `rop-state rop-state--error` | `role="alert"`, an h2, the translated reason, a Retry button. |
| `ToastProvider`, `useToast` | `toast(message, kind)`, kind `info`, `success`, `error`; `durationMs` 5000 | `rop-toasts`, `rop-toasts--errors`, `rop-toast`, `rop-toast--success`, `rop-toast--error` | Two regions: polite `role="status"` (bottom, inline-end) for info and success; assertive `role="alert"` (top) for errors. Keep both mounted so screen readers announce. Auto-dismiss at 5 s, so a toast cannot be the only place critical information appears. |

Related: `features/manage/formKit.tsx` has `TextField` and friends built on `Field`. EN and AR name inputs and the email input carry an intentional `dir` of `ltr` or `rtl`.

Global form styling (`base.css`): `input, select, textarea` are 3rem high, full width, bordered. Radios and checkboxes are 1.25rem inside a 3rem-high label. Focus ring is `:focus-visible`, 3px accent with 2px offset; keep a visible focus style on every interactive element.

### PIN flow (must not change)

1. A gated action (void a sent line, discount, refund, cancel tab, kiosk exit, quit) opens `PinReasonModal` with an `action` name.
2. The modal asks for a PIN (`type="password"`, `inputMode="numeric"`, `autoFocus`) and a reason (required unless `reasonRequired={false}`).
3. Submit calls `verify_manager_pin`. On failure the PIN is cleared and an inline `role="alert"` error shows. On success `onGranted({reason, authorizedBy})` fires and the caller must run the gated action within about 2 minutes.
4. Cancel and Esc reset the form. The submit button shows `busy`.

### Shell (`apps/operator/src/shell/`)

| Region | Markup and classes | Notes |
|---|---|---|
| Shell | `div.rop-shell[data-nav=rail\|bar]` | `navLayoutFor(role)` picks the layout. One destination (waiters): a single top bar with brand, nav and account. Several destinations: an icon rail from 64rem; under 64rem a top bar for brand and account plus a fixed bottom tab bar for the nav. A short landscape screen (under 52rem tall) tightens the rail rows so every destination fits. |
| Skip link | `a.rop-skip.rop-btn` to `#main` | Off-screen until focused. Keep it first in tab order. |
| Side | `div.rop-side` containing `p.rop-brand` (`__mark`, `__name`), `nav.rop-nav`, `header.rop-topbar` | A lettermark from the product name, then the nav, then the account block: avatar initials (`rop-avatar`), name and role, then language, kiosk buttons on desktop and sign out, each an icon with a label (`rop-topbar__btn`, `rop-topbar__label`). In the rail the labels are visually hidden but stay the accessible names. Sign out stays the last button in `header.rop-topbar` (the e2e helper relies on it). |
| Nav | `nav.rop-nav` > `div.rop-nav__group[role=group]` > `p.rop-nav__heading` + `a[aria-current=page]` > `Icon` + `span.rop-nav__label` | Links per role from `navGroupsFor`, grouped as Service, Business and Setup; each has an icon from `NAV_ICONS` in `RootLayout.tsx`. Group headings are for screen readers; in the rail, groups are split by hairlines. The current link gets the `--rop-selected` tint and weight 600. |
| Main | `main#main.rop-main[tabindex=-1]` | Focus target of the skip link. |
| Idle lock | non-dismissible `Modal` | After N idle minutes (saved in `localStorage`) a PIN prompt covers the app: PIN, "Switch user", "Unlock". Esc and close are disabled. A reload keeps the lock, so it can be present on first paint. |
| Kiosk controls | `Button`s plus `PinReasonModal` | Leave full screen or quit, each behind a manager PIN and reason. Rendered only under Electron (`isDesktop()`). |

## 4. Screens

Roles come from `ROUTE_ROLES` in `@rop/core`: `/floor` and `/tab` are open to every signed-in role; `/floor/bills` and `/till/shift` are cashier and up; `/manage` and `/stock` are manager and up; `/manage/staff` is owner only. A role opening a forbidden URL is redirected home. Screenshots are in `docs/screenshots/en/` and `docs/screenshots/ar/` with identical file names.

| Route | Role | Purpose | Key regions and class prefixes | Screenshots |
|---|---|---|---|---|
| `/login` | public | Sign in | `rop-login`, `rop-form`, `Field` | [en](docs/screenshots/en/login.png) / [ar](docs/screenshots/ar/login.png) |
| `/floor` | all | Every area on one page, each a heading over its table grid; tap a table to open or resume its tab | `floor`, `floor__area` (one section per area), `floor__grid` with `floor__table[data-state=free\|occupied]`, `floor__label`, `floor__meta`, `floor__state`, `floor__due`, `floor__notice`; open-tab dialog | [en](docs/screenshots/en/floor.png) / [ar](docs/screenshots/ar/floor.png) |
| `/tab/$tabId` | all | Order screen: menu, basket, sent orders, totals, actions; cashier and up also collect payment here (`tab__collect` swaps in the bill and payment pane) | `tab`, `tab__header`, `tab__body` (2 columns), `tab__menu`, `tab__categories` (tablist), `tab__items`, `tab__item`, `tab__side`, `tab__order`, `tab__sent-line[data-voided]`, `tab__struck`, `tab__totals`, `tab__actions`, `basket__*`, `item-sheet__*` | [en](docs/screenshots/en/tab.png), [item sheet](docs/screenshots/en/tab-item-sheet.png) / [ar](docs/screenshots/ar/tab.png), [item sheet](docs/screenshots/ar/tab-item-sheet.png) |
| `/floor/bills` | cashier+ | The bills view of the floor: open and settled tab list, then bill, discount, payment, split, refund (the old `/till` redirects here) | `floor__nav`, `rop-till`, `rop-till-banner`, `rop-till-layout`, `rop-till-list`, `rop-till-tabs`, `rop-till-detail`, `rop-till-bill` (`__head`, `__cols`, `__main`, `__side`), `rop-till-split`, `rop-till-totals`, `rop-till-paid` (`__change`), `rop-till-pay`, `rop-till-method`, `rop-till-cash`, `rop-till-quick`, `rop-till-change`, `rop-till-picklist`, `rop-till-payments`, kit `rop-pad` | [en](docs/screenshots/en/till.png), [settled](docs/screenshots/en/till-settled.png) / [ar](docs/screenshots/ar/till.png), [settled](docs/screenshots/ar/till-settled.png) |
| `/till/shift` | cashier+ | Open and close the cash-drawer shift, drawer count, close others (manager) | `rop-shift`, `rop-shift-result`, `rop-form`, `AmountPad` | [en](docs/screenshots/en/till-shift.png) / [ar](docs/screenshots/ar/till-shift.png) |
| `/manage` | manager+ | Analytics: range picker, headline cards, daily, hourly, best sellers, by waiter, payment mix, CSV export | `manage__range`, `manage__custom`, `manage__period`, `manage__cards`, `manage__card` (`dt`, `dd`, `manage__figure`, `manage__delta`), `manage__section`, `manage__section-head`, `manage__chart`, tables | [en](docs/screenshots/en/manage.png) / [ar](docs/screenshots/ar/manage.png) |
| `/manage/day` | manager+ | Open and close the business day, shifts, variance, printable report | `manage__summary`, `manage__alert`, `manage__row-alert`, `manage__notice` | [en](docs/screenshots/en/manage-day.png) / [ar](docs/screenshots/ar/manage-day.png) |
| `/manage/menu` | manager+ | Categories, items, modifiers (EN and AR names) | `manage__section`, `manage__form`, `manage__row`, `manage__note` | [en](docs/screenshots/en/manage-menu.png) / [ar](docs/screenshots/ar/manage-menu.png) |
| `/manage/floor` | manager+ | Edit areas and the table grid | `manage__grid` (inline grid columns), `manage__grid-cell[data-inactive]` (inline grid placement) | [en](docs/screenshots/en/manage-floor.png) / [ar](docs/screenshots/ar/manage-floor.png) |
| `/manage/staff` | owner | Create staff, roles, PINs | `manage__section`, `manage__form`, create-staff dialog | [en](docs/screenshots/en/manage-staff.png) / [ar](docs/screenshots/ar/manage-staff.png) |
| `/stock` | manager+ | On hand (index) plus sub-nav to the screens below | `manage`, `manage__tabs` (`a[aria-current=page]`), `DataTable` | [en](docs/screenshots/en/stock-on-hand.png) / [ar](docs/screenshots/ar/stock-on-hand.png) |
| `/stock/receive` | manager+ | Receive deliveries | `rop-form`, `manage__row` | [en](docs/screenshots/en/stock-receive.png) / [ar](docs/screenshots/ar/stock-receive.png) |
| `/stock/waste` | manager+ | Record waste | `rop-form` | [en](docs/screenshots/en/stock-waste.png) / [ar](docs/screenshots/ar/stock-waste.png) |
| `/stock/count` | manager+ | Blind stock count | `manage__count-input`, `rop-table`, `manage__row` | [en](docs/screenshots/en/stock-count.png) / [ar](docs/screenshots/ar/stock-count.png) |
| `/stock/recipes` | manager+ | Recipes per menu item | `rop-table`, `rop-form` | [en](docs/screenshots/en/stock-recipes.png) / [ar](docs/screenshots/ar/stock-recipes.png) |
| `/stock/margins` | manager+ | Item margins | `rop-table` | [en](docs/screenshots/en/stock-margins.png) / [ar](docs/screenshots/ar/stock-margins.png) |
| `/stock/admin` | manager+ | Ingredient and supplier admin | `rop-table`, `rop-form` | [en](docs/screenshots/en/stock-admin.png) / [ar](docs/screenshots/ar/stock-admin.png) |

What the screens do (AR is the same CSS mirrored by `dir`, not separate styles):

- **Floor:** the header line counts free tables, seated tables and tables open 90 minutes or more (`summarize`, `LONG_OPEN_MINUTES` in `floorLogic.ts`). Areas are listed one under another, each under its name, on a shared column count so tables line up. A free table is a raised tile with seats and a green "Free" mark. A seated table is a deeper warm fill (`--rop-occupied`) with guests, waiter, a time badge that turns amber at 90 minutes, and "Due" with the amount. The signed-in waiter's own tables are inked and say "Your table". Opening a tab offers one-tap guest counts 1 to 8 above the number field.
- **Order screen (`/tab`):** the header holds the back link, the table, guests, waiter and time, and the tab actions (Transfer, Merge, Cancel empty tab). Categories are chips over a full-width item grid; the ticket sits at the inline end. The screen fills the viewport and does not scroll as a page; items, basket lines and sent lines scroll inside their zones. An item with no modifier groups adds in one tap and its tile shows the quantity in the basket; an item with any modifier group opens the sheet, whose options are tiles. The ticket is a guest check: "New order" with an item count, lines with a stepper, note and remove, then the total and Send; under it the sent orders, and the totals with the amount due fixed below them.
- **Bills and payment (`/floor/bills`, and Collect payment on the tab):** the header line shows the shift status (a green badge, or a warning pill with the link to open a shift). Three panes on a wide screen: tab list with search, the bill as a check, and payment. Discount and "Split the bill" sit under the check; the split panel unfolds on request and opens by itself when a split is already under way. Payment leads with the amount due at display size; the change after a payment is display size too. Two-option controls are segmented tracks. A settled tab shows a green confirmation with Print receipt, then one card per payment for refunds.
- **Shift (`/till/shift`):** the count panel (open or close, blind) is the main column; cash in and out, the drawer and other open shifts sit beside it. The result shows expected, counted and the variance only after the server answers.
- **Day (`/manage/day`):** a status band (day open since, or closed) with Open or Close the day as the header action, then the till shifts and the day summary.
- **Setup and stock (`manage--setup`):** a page header with the main action and the sub-navigation, then tables and forms on raised panels; forms keep a readable width and form lines lay their fields side by side. The floor plan leads with one canvas per area, drawn as the floor shows it; tapping a table opens it for editing.
- **Reports (`/manage`):** a strip of figures divided by hairlines, then single-colour bar charts with a table alternative.
- **Guest inbox (every screen):** see the Guests waiting row in section 6. Logic is in `features/guest/guestLogic.ts` (urgency thresholds, sort, chime rule), UI in `GuestInbox.tsx`, styles in `guest.css`.
- **QR codes (`/manage/floor`, "QR codes" view, manager and owner):** a table of every active table with its on or off switch, Print and, for the owner, Replace code. Print makes one A6 card per page (`QrCard.tsx`): the code is always black on white, whatever the brand colours, with a four-module quiet zone. The address in the code is `VITE_MENU_URL` + `/t/` + the table's token; a production build refuses to print when that address is missing, local or private. Above the table, "Guest service" has the two venue-wide switches (waiter calls, orders). Dish photos and category icons are set in Manage → Menu.

## 5. Hard constraints

### RTL (EN and AR)

- Direction is set at runtime on `<html>` (`lang` and `dir`) by `LocaleProvider` in `lib/i18n.tsx` each time the language toggles. Do not set `dir` elsewhere, except the intentional per-field `dir` on bilingual name and email inputs.
- Use CSS **logical properties only**: `margin-inline-start`, `padding-block`, `inset-inline-end`, `text-align: start | end`, `border-start-start-radius`, `inline-size`, `block-size`.
- Enforcement: the ESLint `rtlGuard` in `packages/config/src/eslint.js` (part of `base`) rejects physical keys in JS and TS style objects: `left`, `right`, `margin`, `padding` and `border` Left and Right, physical corner radii, `textAlign: 'left' | 'right'`, and a conditional `row-reverse`. **Plain `.css` files are not linted**, so review every `left`, `right`, `float` and `translateX` in CSS by hand.
- A plain `flex-direction: row` already mirrors; never flip it manually. Mirror directional icons (chevrons, back arrows).
- Numbers and money go through `Money` (`<bdi>`).
- Test every screen in both languages; Arabic needs more line height and a bundled Arabic-capable font.

### Touch targets (tablets)

- `--rop-target` is 3rem (48px): minimum for buttons, inputs, selects, nav links and radio or checkbox rows.
- Other current minimums: pad keys 3.5rem tall; menu item tiles 5.75rem; floor tables 8.5rem; item-sheet options 3rem; Send and Take payment 3.5rem.
- Keep at least `--rop-space-2` between adjacent targets. Do not shrink below 3rem for density.

### Till station kiosk (Electron)

- The till runs in the Electron shell (`apps/operator-shell`), fullscreen in kiosk mode after station setup, with a receipt printer (host and port from the station config, default 9100). An unconfigured station opens as a normal window.
- Kiosk hardening blocks OS shortcuts and keeps the window on top. A manager PIN is needed to leave full screen or quit (`KioskControls`). There is no browser chrome and no back button, so every screen needs its own navigation, and nothing may rely on browser zoom or scroll restoration.
- Keep the top bar and nav visible and reachable; the exit buttons live in the top bar. Check the real till screen resolution.
- Electron uses hash history; links must stay `<Link>`.

### Receipt (80 mm) is separate

- `features/till/receiptLogic.ts` builds a standalone HTML document: `@page{size:80mm auto}`, 72 mm body, 13px system font, black on white, inline `STYLE` string, and its own CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data:`. It cannot read `--rop-*` tokens and must not load fonts, scripts or remote images. It is monochrome on purpose and is a print-design task, not part of the app restyle.
- `features/manage/dayLogic.ts` likewise builds a printable day-report document with inline style and `lang` and `dir`.

### Content Security Policy

`apps/operator/index.html` (filled by the Vite plugin) sets: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src <supabase>`.

- **No Google Fonts, CDN fonts, external stylesheets or external scripts.** Bundle fonts locally (`@font-face` with files in the build, or `data:`).
- The fonts are IBM Plex Sans and IBM Plex Sans Arabic from the `@fontsource` packages, imported at the top of `main.tsx` and emitted into the build as local `woff2` files (weights 400, 500, 600; about 205 KB in total; `font-display: swap`).
- Images must be same-origin or `data:`.

### Performance (low-end Android tablets for waiters)

- The floor and tab screens are used all day on weak hardware. Avoid large blurs, many box-shadows, `backdrop-filter`, big gradients, and animating layout properties. Prefer `transform` and `opacity`, and respect `prefers-reduced-motion`.
- Fonts: one or two weights, subset, local only. Use inline SVG, not icon fonts.
- Recharts is only used on `/manage`; keep chart code out of waiter screens.
- Floor and menu grids can hold dozens of tiles: keep tile CSS cheap (flat colours, border only).
- Breakpoints in use: 48rem (till bill and payment side by side; account labels show in the top bar), 56rem (order screen becomes full-height with the ticket beside the menu), 64rem (icon rail instead of the bottom tab bar; shift count and side column side by side), 80rem (till tab list as a third pane). Below them the screens stack. A height query at 52rem tightens the rail on short landscape screens.

## 6. States to design

| State | Where | How it shows now | Notes |
|---|---|---|---|
| Loading | every query screen | `Loading`: centred muted text, `role="status"` | Skeletons are fine; keep the status role. |
| Empty | tabs, menu, tables, lists, `DataTable` | `EmptyState`: centred muted text, optional action | Needs a clear next step. |
| Error | all reads | `ErrorState`: red text, h2, translated reason, Retry, `role="alert"` | Errors are text codes with EN and AR copy. |
| Offline or network error | any call that never reaches the server | `ErrorState` or error toast with the `errors.network` text | There is **no global offline banner**. Designing one needs new markup in `RootLayout`. |
| Field error | forms | `rop-field__error` under the field plus `aria-invalid` | |
| Busy | any `Button` | `aria-busy`, 60% opacity | Needs a spinner or label change. |
| Disabled | buttons, `tab__item` while sending | 60% opacity, `not-allowed` | Stay legible. |
| PIN prompt | gated actions | `PinReasonModal` | Wrong PIN clears the field and shows an error. |
| PIN-locked (too many attempts) | `PinReasonModal`, idle unlock | Server error code text in the same inline error | The server counts attempts; make the message clear. |
| Idle-locked | whole app | Non-dismissible modal over everything: PIN, "Switch user", "Unlock" | Background must not be readable or operable. |
| Day not open | `/floor` | `floor__notice`: 2px red-bordered box, h2 and hint, `role="alert"`; no grid | Waiters cannot open tabs until a manager opens the day. |
| Shift not open | `/floor/bills`, Collect payment on the tab | `rop-till-banner` (`role="status"`) "No shift is open on this till, so cash is off. Card still works." plus link; pay pane shows a hint and blocks cash | Not a full block: card still works. |
| Unclear-send lock | tab basket | After a failed send the basket locks: quantity buttons and menu items disabled, "Checking whether the order went through..." (`role="status"`). Payment has the same pattern | Must look locked and prevent re-sending (duplicate orders). |
| Voided line | sent orders | `tab__sent-line[data-voided=true]` with `tab__struck` (strike, muted) | Do not hide voids. |
| Paid or settled | till | `rop-till-paid` (`role="status"`) with change due | A large change figure helps the cashier. |
| Alert rows (variance) | `/manage/day` | `manage__row-alert` (2px red outline) plus `manage__alert` red pill | Colour must not be the only signal; keep text and consider an icon. Fix `--rop-surface-alt`. |
| Blind count | `/stock/count` | One counted input per ingredient (`manage__count-input`, labelled with name and unit), `aria-invalid` plus inline text on bad input, a "blind count" note, confirm dialog | **Must never show expected or on-hand quantities, or any variance, before finalize.** No extra columns, hints, tooltips or derived numbers here. |
| Selected, active | tabs, areas, categories, nav, range buttons | `aria-selected`, `aria-pressed`, `aria-current`: a `--rop-selected` tint or the raised option on a segmented track, plus weight 600 | Differ by more than colour. |
| Guest calls and orders waiting | every screen once signed in | `guest-inbox`: a raised panel fixed at the bottom inline-start corner (above the tab bar on tablets, beside the rail on wide screens), under the toasts. A charcoal header says "Guests waiting" with a count and collapses the list. Each row names the table and how long it has waited in words (amber from 2 minutes, red from 5; the words carry it, the colour only supports it), the reason or the order's lines and total, then **OK** (terra cotta) and, on an order, a quiet **Decline** that asks first. Your own tables come first. On a free table OK asks for the guest count before it accepts. | The chime plays once per new row and every minute while something has waited 5 minutes; browsers need one tap first, so an unarmed panel shows "Turn on sound". The floor shows a "Calling" badge on the table. Hidden under the idle lock. |
| Toasts | everywhere | Bottom for info and success, top for errors, 5 s. Info and success are ink (success adds a green mark); only errors are solid red | Cannot carry required information. |

## 7. Decisions, and what is still open

Decided on 2026-11-21 (reasoning in `docs/DESIGN-RESEARCH.md`):

| Question | Decision |
|---|---|
| Brand | "Kagu Restaurant" as a placeholder, set as plain text in the rail and bar. Logo and bilingual wordmark are still open. |
| Dark mode | Light first. Dark later, as a per-device setting with a second token set. |
| Floor-plan visual style | Keep the grid placed by `grid_x` and `grid_y`. Status by fill, label and time, not a drawn map. |
| Chart palette | One series in forest; red and amber only for values out of range. Categorical and sequential palettes are open until analytics v2 needs them. |
| Density: till vs tablets | Same components; the till uses side-by-side panes, waiter screens use larger tiles. No density token yet. |
| Status colours | Success, warning, danger and information, each with a tint. |
| Typography | IBM Plex Sans with IBM Plex Sans Arabic, fixed scale, tabular figures, Western digits in both languages. |
| Navigation | An icon rail for roles with several destinations (a bottom tab bar under 64rem), one top bar for waiters. Every screen starts with `PageHeader`. |
| Visual weight (quieter pass, 2026-11-21) | Ink only for the one primary action; selection by tint and weight; raised paper on a slightly deeper page; tinted state borders; softer chart blue; labels and table headers at weight 500. |
| Colour, ornament and motion (2026-11-22) | The owner's palette (forest, terra cotta, charcoal, cream) with copper zakhrafa; soft forest-tinted depth; entrances, cascades, pops and a payment checkmark. Supersedes the quieter pass. |
| Motion and feedback | 150 to 380ms ease-out; a spinner inside busy buttons and beside loading text; reduced motion respected. |
| Responsive breakpoints | 48, 56, 64, 72 and 80rem, listed in section 5. |

Still open:

- Skeleton loading states and a global offline banner (new markup in `RootLayout`).
- A phone bottom bar for the owner; today the bar's nav scrolls sideways.
- Own-table emphasis and a time warning on the floor.
- A full pass on the shift, stock and setup screens.
- The attention-first reports layout, with analytics v2 (`docs/PLAN.md` item 2.6).
- Logo and wordmark.

## 8. Checklist before handing back

- Only `.css`, `components/`, `*Screen.tsx` and sibling panel markup changed; no `*Logic.ts`, `lib/` or rpc changes.
- No raw hex or `rgb()` outside `base.css`; no physical CSS properties; both languages checked.
- Native `<dialog>`, `aria-live` toast regions, label wiring and the PIN flow unchanged.
- All targets at least 3rem; focus ring visible everywhere.
- Fonts bundled locally; no external requests.
- `pnpm --filter @rop/operator typecheck` and its tests pass; refresh `docs/screenshots` in EN and AR.

## 9. The guest site (`apps/menu`)

The diner's phone, not the staff app. Everything above about the staff app (rail, kit, light only) does not apply here; the tokens do. The look was chosen by the owner on 2026-11-26 ("white rows with green ornament"); the measurements, colours and states are in `.scratch/qr-menu/design.md`, and this section is the summary a designer needs. Screenshots: `docs/screenshots/guest/` (`menu-*`, `menu-with-order-*`, `order-*`, `call-*`, in `light`, `dark`, `ar-light` and `ar-dark`). `pnpm e2e` regenerates them.

**Tokens.** `@rop/tokens` holds every `--rop-*` value. The staff app imports `tokens.css` and `fonts.css`; the guest site also imports `guest.css`, which adds the dish row card, the row ornament green and its opacity, the charcoal border, and the **dark set** under `prefers-color-scheme: dark` (page `#18181A` family, converted to OKLCH like the rest). The guest site follows the phone's light or dark setting and has no switch. The staff app stays light only. No raw hex in guest CSS or TSX.

**Language.** Arabic unless the phone asks for English or the guest chose (`rop-locale` cookie, one button in the top bar). Layout mirrors by logical properties. Western digits in both languages; prices are plain numbers in the rows and carry the currency only in the order total.

**The screen**, top to bottom: the corner ornament (one curved olive, copper and soft terra band with an eight-petal flower, top inline-end corner, mirrored in Arabic, no all-over pattern); the top bar (table plate in the staff app's doorplate style, restaurant name, language button); the header strip; the category rail (tiles with an icon from `CATEGORY_ICONS`, selected tile in forest, following the scroll); sections with a copper rule and an olive star; **dish rows** (solid warm-white cards: 76 px photo or the category icon tile, name, price, the plus at the inline end, minus and count once in the order); status strips; and the fixed bottom bar with **Call waiter** (charcoal) and **Your order** (terra cotta once it has dishes).

**The two ornaments** live in `components/Ornaments.tsx`: `CornerOrnament` (180 × 128) and `RowOrnament` (a scroll lying on its side in every row, 90 × 54, soft green at 14% opacity, 10% in dark). The row ornament never moves: the minus and count sit on top of it.

**Sheets** rise from the bottom over a scrim: Call waiter (four reasons in a 2 × 2 grid), Your order (lines, one note, total, Send order as the only terra cotta control), the options sheet for a dish with modifier groups, and notice sheets (no table, session ended, closed, switched off, call again soon).

**States.** Menu loading (skeleton rows), empty, failed (with Try again); no table (browsable, actions ask to scan); session ended (the order stays on the phone); closed day; calls or orders switched off; call waiting then answered ("A waiter is on the way"); the countdown before another call; order waiting, confirmed, not accepted, expired (a waiting order gets "please ask a waiter" after 3 minutes); a limit reached (3 orders waiting, 20 of one dish, 40 lines: a plain sentence in a strip, no code); a dish that left the menu (marked, blocks Send until removed); offline banner; a dish without a photo (icon tile). Status is always an icon and words, never colour alone. The phone asks the server every 5 seconds only while a call or an order is waiting.

**Accessibility.** Every control is at least 44 px. Text pairs are measured at 4.5:1 and control edges at 3:1 in both sets (`apps/menu/src/lib/tokenContrast.test.ts` runs the real tokens). Motion is 150 to 240 ms, transform and opacity only, and off under `prefers-reduced-motion`. Works from 360 px wide; wider screens keep a centred phone-width column.

**Photos are content.** One real photo per dish, in its row only. No hero image, no decorative food imagery (`PRODUCT.md`).
