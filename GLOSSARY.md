# Glossary

| Term | Meaning | Avoid saying |
|---|---|---|
| **Venue** | One restaurant location. v1 has one; every branch-scoped row carries `venue_id`. | branch, store |
| **Business day** (`day_session`) | The trading day a manager opens and closes. Its date comes from the venue timezone and can run past midnight. | shift (that is something else) |
| **Table** (`dining_tables`) | A physical seating spot on the floor plan, grouped into **areas**. | desk, spot |
| **Tab** | The running bill for one party, usually on one table. Status: open → settled, or void. | check, ticket, order |
| **Covers** | Number of guests on a tab. | pax, seats |
| **Order** | One **send** of items to a tab. A tab has many orders. | ticket, round |
| **Line** (`order_item`) | One menu item at a quantity inside an order, with a price snapshot. | item row |
| **Basket** | Lines being built on the waiter's device that have not been sent yet. These exist only on the client. | cart, draft order |
| **Send** | Committing the basket to a tab as an order. After a line is sent, voiding it needs a manager PIN. | fire, submit |
| **Void** | Cancelling a sent line. It is recorded, never deleted. | delete, remove |
| **Adjustment** | A discount on a tab (percent or amount). | comp |
| **Settle** | Recording a payment against a tab; when `due` reaches 0, the tab is settled. | close, checkout |
| **Split** | Dividing a tab's due amount evenly or by line into shares, each paid separately. | |
| **Refund** | Money returned against a payment, recorded as a new row. | reversal |
| **Till shift** | One cashier's drawer session: opening float → blind count at close → variance. | session, day |
| **Manager PIN** | A short numeric code that authorizes a sensitive action through a short-lived grant. | password |
| **Ingredient** | A stock item measured in g, ml or pc. | product, SKU |
| **Recipe line** | How much of an ingredient one unit of a menu item uses. | BOM |
| **Movement** | An append-only row in the stock ledger. On-hand is the sum of movements. | transaction |
| **Count** | A blind physical stock count; finalizing it writes `count_adjust` movements. | stocktake |
