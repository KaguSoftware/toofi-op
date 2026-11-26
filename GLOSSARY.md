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
| **Cash movement** | Cash that enters or leaves the drawer without a sale, recorded on the till shift. Three kinds: **paid-out** (cash taken out to pay for something), **pay-in** (cash put in that is not a sale) and **drop** (cash moved to the safe). The shift's expected cash counts them. | petty cash, expense (an expense is a later, separate thing) |
| **Manager PIN** | A short numeric code that authorizes a sensitive action through a short-lived grant. | password |
| **Ingredient** | A stock item measured in g, ml or pc. | product, SKU |
| **Recipe line** | How much of an ingredient one unit of a menu item uses. | BOM |
| **Movement** | An append-only row in the stock ledger. On-hand is the sum of movements. | transaction |
| **Count** | A blind physical stock count; finalizing it writes `count_adjust` movements. | stocktake |
| **Guest** | A diner who scans a table's QR code. A guest has no login and no staff role. | customer, user |
| **Table link** | The QR code's token for one table. Replacing it closes that table's live table sessions. | QR code (that is the picture), URL |
| **Table session** | A guest's temporary, login-free access to one table's menu, calls and orders. It expires after 90 minutes without activity. | login, guest account |
| **Waiter call** | A guest's request for a waiter, with a reason: order, bill, water or help. One tap on **OK** by staff answers it. | ping, buzz |
| **Guest order** | A basket a guest sent from their phone. It is only a request held in `guest_orders`: it becomes an **Order** on a tab when staff accept it. | order (until accepted), online order |
| **Accept / Decline** | Staff's answer to a guest order. Accept opens the tab if the table is free and adds the lines; Decline closes the request and changes nothing else. | confirm, reject |
| **Guest inbox** | The panel on every staff screen listing open waiter calls and pending guest orders, oldest first, each with OK (and Decline for an order). | notifications, alerts |
| **Table card** | The printed A6 card on a table: the restaurant name, the table label and the QR code. Managers and owners print it from Manage → Floor plan → QR codes. | sticker, QR code (that is only the picture on it) |
