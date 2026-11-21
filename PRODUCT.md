# Product

Working name: Kagu Restaurant (placeholder; the string lives in `brand.config.json`).

## Register

product

## Users

- **Waiter.** Standing, moving between tables, a tablet in one hand, often interrupted. May be in their first week. Reads Arabic first. Job: open a table, get the order right, send it.
- **Cashier.** At a fixed till for a whole shift, handling cash while guests wait. Job: take payment quickly and end the shift with a drawer that matches.
- **Manager.** Opens and closes the day, authorizes exceptions with a PIN, counts stock. Uses every screen.
- **Owner.** Often not in the venue. Job: know in under a minute whether today is normal and whether money or stock is leaking.

## Product Purpose

One system for a single restaurant: take orders, get them to the kitchen, take payment, control cash and stock, and show the owner what is true. It runs in English and Arabic (right to left), in Iraqi dinar.

Success is a full service with no order lost, a drawer that matches, and an owner who trusts the numbers.

## Brand Personality

Calm, exact, plain-spoken.

It behaves like a good head waiter: quick, never flustered, says what happened in a few words. Arabic and English are equals; neither is a translation layer over the other. The interface should disappear into the work.

## Anti-references

- **The legacy grey till:** tiny buttons, a button for every function, colour everywhere.
- **The food-delivery app:** appetite reds and oranges, rounded cartoon shapes, food photography as decoration.
- **The software dashboard:** a grid of identical metric cards, gradients, glass panels.

## Design Principles

1. **The next tap is obvious.** Each screen has one primary action, and it is where the hand already is.
2. **Colour means state.** If something is coloured, something is true about it. Decoration is not a reason. Primary actions are ink, not a brand colour.
3. **Numbers are the content.** Money and quantities are the largest, clearest things on a screen, aligned and stable.
4. **Nothing is hidden, nothing is lost.** Voids stay visible, locked states look locked, and the app says so when it is unsure whether an order went through.
5. **Arabic is first-class.** Layout, type and rhythm are designed in both directions at once.

## Accessibility & Inclusion

- WCAG 2.1 AA. Every text and state colour pair in `base.css` is measured at 4.5:1 or better; control boundaries at 3:1.
- Status never relies on colour alone: fill, a label or an icon carries it too.
- Touch targets are at least 48px.
- Reduced motion is respected.
- It must stay fast on low-end Android tablets: flat colours, no blur, two or three font weights bundled locally.

## How these were decided

The owner delegated the direction on 2026-11-21 ("do whatever you think is best"). The personality, anti-references, the "ink and paper" colour strategy and the light-first theme are therefore the designer's recommendation, recorded in `docs/DESIGN-RESEARCH.md`, and can be overridden.
