# DESIGN.md: restyling the restaurant operator app

For the frontend design team. Everything here is derived from the code as it is now. The brand name is a placeholder (strings live in `brand.config.json`).

## 1. Purpose and ground rules

The UI is deliberately plain: semantic HTML, a small component kit, and CSS variables. Logic and UI are separated, so a restyle should touch only these places:

| Touch | Path |
|---|---|
| Tokens and global styles | `apps/operator/src/styles/base.css` |
| Per-feature styles | `apps/operator/src/features/floor/floor.css`, `tab/tab.css`, `manage/manage.css` |
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

- Only 4 CSS files exist (about 190 lines in total). No CSS framework, no CSS modules, no CSS-in-JS.
- Classes are BEM-like: `rop-*` for the kit and shell, `floor__*`, `tab__*`, `basket__*`, `item-sheet__*`, `manage__*` per feature.
- State is exposed through ARIA and data attributes (`aria-selected`, `aria-pressed`, `aria-current`, `aria-busy`, `data-state`, `data-inactive`, `data-voided`, `data-align`). Style those; do not replace them with new class toggles.
- Gap to know about: the `rop-till-*` and `rop-shift*` classes exist in markup but have **no CSS at all**. The till and shift screens render as an unstyled single column (see the till screenshot: radios, pad and split panel all stack). The till is the largest design job.

## 2. Tokens

All tokens are defined once on `:root` in `base.css`, with `color-scheme: light`.

| Token | Value | Used by |
|---|---|---|
| `--rop-space-1` | 0.25rem | tight gaps (field, card text) |
| `--rop-space-2` | 0.5rem | default gap, small padding, toolbar rows |
| `--rop-space-3` | 1rem | form gap, card padding, topbar, table cell padding |
| `--rop-space-4` | 1.5rem | main padding, modal body, section margin |
| `--rop-radius` | 0.5rem | buttons, inputs, cards, tiles, modals, toasts |
| `--rop-target` | 3rem (48px) | min size of buttons, inputs, nav links, radio and checkbox rows |
| `--rop-font-sm` | 0.875rem | hints, meta text, deltas, notes |
| `--rop-font` | 1rem | body |
| `--rop-font-lg` | 1.25rem | h2, figures, pad keys |
| `--rop-font-xl` | 1.75rem | h1, pad display |
| `--rop-bg` | #ffffff | page, info toast text |
| `--rop-surface` | #f5f5f4 | buttons, topbar, cards, floor tables, menu items, pad display |
| `--rop-border` | #d6d3d1 | all borders, chart grid |
| `--rop-text` | #1c1917 | body text, info toast background |
| `--rop-text-muted` | #57534e | hints, meta, struck text, chart axes |
| `--rop-accent` | #1d4ed8 | primary button, focus ring, selected tab/area/category, active nav, occupied table border, chart bars |
| `--rop-accent-text` | #ffffff | text on accent |
| `--rop-danger` | #b91c1c | danger button, field errors, error states, notices, alert rows, error toast |
| `--rop-danger-text` | #ffffff | text on danger |
| `--rop-success` | #15803d | "free" table label, success toast |
| `--rop-success-text` | #ffffff | text on success (success toast) |

Token gaps to consider during the restyle:

- `rgb(0 0 0 / 0.5)` is the modal backdrop; consider a `--rop-scrim` token.
- No tokens yet for font family (currently `system-ui, sans-serif`), shadows, z-index (toasts use a literal `10`), warning or info colours, or motion.

How to theme:

- Change values on `:root`; every component follows. Add new tokens beside the existing ones, prefixed `--rop-`.
- **Dark mode is not implemented.** `color-scheme: light` is hard-set and nothing switches themes. To add it, define a second token set (for example under `:root[data-theme='dark']` or `prefers-color-scheme`), switch `color-scheme`, and recheck contrast. Screens already use tokens only, so no markup change is needed.
- **No raw colours outside `base.css`** (project rule). Feature CSS and TSX must use `var(--rop-*)`.
- Exception: the receipt and day-report HTML (section 5) are standalone documents and cannot read tokens.

Charts read the CSS variables directly. `ManageScreen.tsx` uses Recharts `BarChart` and passes strings as SVG attributes: `stroke="var(--rop-border)"` (grid), `stroke="var(--rop-text-muted)"` (axes), `fill="var(--rop-accent)"` (bars). The browser resolves them, so a theme change recolours charts with no JS. There is one series colour today. Each chart sits in `.manage__chart` (16rem high) with `role="img"` and an `aria-label` summary, and a table alternative next to it.

## 3. Component inventory

All in `apps/operator/src/components/`, exported from `index.ts`.

| Component | Props | Classes | States and behaviour to preserve |
|---|---|---|---|
| `Button` | `variant` (`primary`, `secondary` default, `danger`), `busy`, native button props | `rop-btn rop-btn--{variant}` | `busy` sets `aria-busy="true"` and drops `onClick`. `disabled` and busy render at 0.6 opacity, `not-allowed`. Default `type="button"`. Min 3rem square. Toggles use `aria-pressed` (till view, split mode). |
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
| Skip link | `a.rop-skip.rop-btn` to `#main` | Off-screen until focused. Keep it first in tab order. |
| Top bar | `header.rop-topbar`, `p.rop-topbar__user` | User name and role, language toggle (shows the other language), kiosk buttons (desktop only), sign out. |
| Nav | `nav.rop-nav`, `a[aria-current=page]` | Links per role from `navFor`; active link filled with accent. Up to 9 links for an owner: must wrap or scroll on tablets. |
| Main | `main#main.rop-main[tabindex=-1]` | Focus target of the skip link. |
| Idle lock | non-dismissible `Modal` | After N idle minutes (saved in `localStorage`) a PIN prompt covers the app: PIN, "Switch user", "Unlock". Esc and close are disabled. A reload keeps the lock, so it can be present on first paint. |
| Kiosk controls | `Button`s plus `PinReasonModal` | Leave full screen or quit, each behind a manager PIN and reason. Rendered only under Electron (`isDesktop()`). |

## 4. Screens

Roles come from `ROUTE_ROLES` in `@rop/core`: `/floor` and `/tab` are open to every signed-in role; `/till` is cashier and up; `/manage` and `/stock` are manager and up; `/manage/staff` is owner only. A role opening a forbidden URL is redirected home. Screenshots are in `docs/screenshots/en/` and `docs/screenshots/ar/` with identical file names.

| Route | Role | Purpose | Key regions and class prefixes | Screenshots |
|---|---|---|---|---|
| `/login` | public | Sign in | `rop-login`, `rop-form`, `Field` | [en](docs/screenshots/en/login.png) / [ar](docs/screenshots/ar/login.png) |
| `/floor` | all | Table grid by area; tap a table to open or resume its tab | `floor`, `floor__areas` (tablist of `floor__area`), `floor__grid` with `floor__table[data-state=free\|occupied]`, `floor__label`, `floor__meta`, `floor__state`, `floor__due`, `floor__notice`; open-tab dialog | [en](docs/screenshots/en/floor.png) / [ar](docs/screenshots/ar/floor.png) |
| `/tab/$tabId` | all | Waiter order screen: menu, basket, sent orders, totals, actions | `tab`, `tab__header`, `tab__body` (2 columns), `tab__menu`, `tab__categories` (tablist), `tab__items`, `tab__item`, `tab__side`, `tab__order`, `tab__sent-line[data-voided]`, `tab__struck`, `tab__totals`, `tab__actions`, `basket__*`, `item-sheet__*` | [en](docs/screenshots/en/tab.png), [item sheet](docs/screenshots/en/tab-item-sheet.png) / [ar](docs/screenshots/ar/tab.png), [item sheet](docs/screenshots/ar/tab-item-sheet.png) |
| `/till` | cashier+ | Open and settled tab list, then bill, discount, payment, split, refund | `rop-till`, `rop-till-banner`, `rop-till-layout`, `rop-till-list`, `rop-till-tabs`, `rop-till-detail`, `rop-till-bill` (`__head`), `rop-till-totals`, `rop-till-paid` (`__change`), `rop-till-pay`, `rop-till-method`, `rop-till-cash`, `rop-till-quick`, `rop-till-change`, `rop-till-picklist`, `rop-till-payments`, kit `rop-pad` | [en](docs/screenshots/en/till.png), [settled](docs/screenshots/en/till-settled.png) / [ar](docs/screenshots/ar/till.png), [settled](docs/screenshots/ar/till-settled.png) |
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

What the screenshots show today (AR is the same CSS mirrored by `dir`, not separate styles):

- Floor: a card grid of tables. Free tables show a green "Free" label; occupied tables get an accent border plus guests, waiter, time open and the amount due in bold.
- Till: no layout. List, bill, payment (radios, pad, quick-tender buttons, change line) and split panel stack in one column. `rop-till-layout`, `rop-till-list` and `rop-till-detail` are ready hooks for a two-pane design.
- Manage: report page with a row of figure cards, single-colour bar charts, and tables.

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
- Other current minimums: pad keys 4rem tall; menu item tiles 5rem; floor tables 8rem; item-sheet options 3rem. `manage__tabs` links have no min height (about 2.5rem) and should be raised to the target.
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
- The font today is `system-ui`. A brand font needs Latin and Arabic coverage, subsetting and `font-display: swap`.
- Images must be same-origin or `data:`.

### Performance (low-end Android tablets for waiters)

- The floor and tab screens are used all day on weak hardware. Avoid large blurs, many box-shadows, `backdrop-filter`, big gradients, and animating layout properties. Prefer `transform` and `opacity`, and respect `prefers-reduced-motion`.
- Fonts: one or two weights, subset, local only. Use inline SVG, not icon fonts.
- Recharts is only used on `/manage`; keep chart code out of waiter screens.
- Floor and menu grids can hold dozens of tiles: keep tile CSS cheap (flat colours, border only).
- No breakpoints exist yet: `tab__body` is a fixed two-column grid and needs a portrait or narrow rule.

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
| Shift not open | `/till`, payment pane | `rop-till-banner` (`role="status"`) "No shift is open on this till, so cash is off. Card still works." plus link; pay pane shows a hint and blocks cash | Not a full block: card still works. |
| Unclear-send lock | tab basket | After a failed send the basket locks: quantity buttons and menu items disabled, "Checking whether the order went through..." (`role="status"`). Payment has the same pattern | Must look locked and prevent re-sending (duplicate orders). |
| Voided line | sent orders | `tab__sent-line[data-voided=true]` with `tab__struck` (strike, muted) | Do not hide voids. |
| Paid or settled | till | `rop-till-paid` (`role="status"`) with change due | A large change figure helps the cashier. |
| Alert rows (variance) | `/manage/day` | `manage__row-alert` (2px red outline) plus `manage__alert` red pill | Colour must not be the only signal; keep text and consider an icon. Fix `--rop-surface-alt`. |
| Blind count | `/stock/count` | One counted input per ingredient (`manage__count-input`, labelled with name and unit), `aria-invalid` plus inline text on bad input, a "blind count" note, confirm dialog | **Must never show expected or on-hand quantities, or any variance, before finalize.** No extra columns, hints, tooltips or derived numbers here. |
| Selected, active | tabs, areas, categories, nav, range buttons | `aria-selected`, `aria-pressed`, `aria-current`, filled with accent | Differ by more than colour. |
| Toasts | everywhere | Bottom for info and success, top for errors, 5 s | Cannot carry required information. |

## 7. Open design questions

| Question | Context and current default |
|---|---|
| Brand | Name is a placeholder. Logo, colour, voice, bilingual wordmark and its place in the top bar are open. |
| Dark mode | Not implemented. Decide yes or no (waiters in dim venues); if yes, define a second token set including chart colours. |
| Floor-plan visual style | Plain card grid today. Options: keep the grid, draw a true map (manage already stores `grid_x` and `grid_y`), add per-state colours. Status must not rely on colour alone. |
| Chart palette | One accent colour. Decide categorical and sequential palettes and axis styles, validated in AR and dark. |
| Density: till vs tablets | The till (cashier, fixed screen) can be denser and side by side; waiter tablets need large targets and simpler screens. Density token or per-screen classes? |
| Status colours | Only success and danger exist. Add warning and info? |
| Typography | A bundled Latin plus Arabic pair, a type scale and a money numeral style. |
| Navigation | 9 wrapping links for an owner; group them or use a bottom bar on tablets? |
| Motion and feedback | Busy spinners, post-payment and post-send confirmation, with reduced-motion support. |
| Responsive breakpoints | None exist; tab and till need portrait-tablet rules. |

## 8. Checklist before handing back

- Only `.css`, `components/`, `*Screen.tsx` and sibling panel markup changed; no `*Logic.ts`, `lib/` or rpc changes.
- No raw hex or `rgb()` outside `base.css`; no physical CSS properties; both languages checked.
- Native `<dialog>`, `aria-live` toast regions, label wiring and the PIN flow unchanged.
- All targets at least 3rem; focus ring visible everywhere.
- Fonts bundled locally; no external requests.
- `pnpm --filter @rop/operator typecheck` and its tests pass; refresh `docs/screenshots` in EN and AR.
