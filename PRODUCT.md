# Product

Working name: Kagu Restaurant (placeholder; the string lives in `brand.config.json`).

## Register

product

## Users

- **Waiter.** Standing, moving between tables, a tablet in one hand, often interrupted. May be in their first week. Reads Arabic first. Job: open a table, get the order right, send it.
- **Cashier.** At a fixed till for a whole shift, handling cash while guests wait. Job: take payment quickly and end the shift with a drawer that matches.
- **Manager.** Opens and closes the day, authorizes exceptions with a PIN, counts stock. Uses every screen.
- **Owner.** Often not in the venue. Job: know in under a minute whether today is normal and whether money or stock is leaking.
- **Guest.** A diner at a table with their own phone, in warm dim light or on a bright terrace, with no login and no training. Scans the code on the table, reads the menu in Arabic or English, and either calls a waiter or sends an order. Job: get the waiter's attention or put an order in without waiting to be noticed, and know that staff saw it. The guest never pays on the phone and never sees the bill.

## Product Purpose

One system for a single restaurant: take orders (from waiters, and from guests at the table through a QR menu that staff confirm), get them to the kitchen, take payment, control cash and stock, and show the owner what is true. It runs in English and Arabic (right to left), in Iraqi dinar.

Success is a full service with no order lost, a drawer that matches, and an owner who trusts the numbers.

## Brand Personality

Calm, exact, plain-spoken.

It behaves like a good head waiter: quick, never flustered, says what happened in a few words. Arabic and English are equals; neither is a translation layer over the other. The interface should disappear into the work.

## Anti-references

- **The legacy grey till:** tiny buttons, a button for every function, colour everywhere.
- **The food-delivery app:** appetite reds and oranges, rounded cartoon shapes, decorative food imagery (hero banners, backgrounds, stock photos). A real photo of the dish itself is content, not decoration: the guest menu shows one small photo per dish, in its row, and nowhere else.
- **The software dashboard:** a grid of identical metric cards, gradients, glass panels.

## Design Principles

1. **The next tap is obvious.** Each screen has one primary action, and it is where the hand already is.
2. **Colour has a job.** Deep Forest is the brand and marks structure and selection; Terra Cotta marks the action to take; copper draws the ornament; green, amber and crimson mean free, needs attention and danger. Status colour is never decoration and never the only signal.
3. **Numbers are the content.** Money and quantities are the largest, clearest things on a screen, aligned and stable.
4. **Nothing is hidden, nothing is lost.** Voids stay visible, locked states look locked, and the app says so when it is unsure whether an order went through.
5. **Arabic is first-class.** Layout, type and rhythm are designed in both directions at once.

## Accessibility & Inclusion

- WCAG 2.1 AA. Every text and state colour pair in `@rop/tokens` (and the guest site's dark set) is measured at 4.5:1 or better; control boundaries at 3:1.
- Status never relies on colour alone: fill, a label or an icon carries it too.
- Touch targets are at least 48px.
- Reduced motion is respected.
- It must stay fast on low-end Android tablets: flat colours, no blur, two or three font weights bundled locally.

## How these were decided

The owner delegated the direction on 2026-11-21 ("do whatever you think is best"). The personality, anti-references and the light-first theme are the designer's recommendation, recorded in `docs/DESIGN-RESEARCH.md`. On 2026-11-22 the owner found the restrained "ink and paper" result lifeless and chose the palette (Deep Forest #1E3A2F, Terra Cotta #B84C2E, Charcoal Ink #1C1C1E, Warm Cream #F2E9D8) and asked for Arabic geometric ornament (zakhrafa), depth and motion. That choice overrides the earlier "colour only for state" strategy.

On 2026-11-26 the owner added the guest QR menu and picked its look ("white rows with green ornament", following the phone's light or dark setting) and asked for a photo on every dish; that is why the food-delivery anti-reference above now separates content photos from decoration. `DESIGN.md` section 9 describes the guest site.
