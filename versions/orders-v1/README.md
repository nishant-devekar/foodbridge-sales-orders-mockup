# Discovery version `orders-v1` — snapshot

Frozen snapshot of the `/orders` discovery prototype, accepted **2026-08-11** and re-cut
**2026-08-12** with three more overlays, taken per discovery working rule **R6** ("an accepted
iteration becomes a version").

**What it is:** phase 1 of a fidelity port of the live `storefront-frontend` route `/orders` — the
**whole list screen**, meaning every control on it:

- **The table** — search, status filter, date range, row expansion, per-row status transitions,
  pagination, and the Smart Insights hover card
- **The action bar** — Create Delivery, Create Order, Forecast Orders, Bulk Orders (with its mode
  menu), Generate Demand, Follow-up Reminders, Download All —
  each behind the same feature flag the live app uses
- **The mobile sticky footer** and its create menu
- **The empty / no-results / loading states**

Driven entirely by `seed-data/seed.json`. No API calls, no framework, no build step.

Plus five of the seven overlays those controls open:

- **Fulfilment panel** (row expand) — Details / Items / Comments / Fulfillment, with nested
  dispatch → delivery-run → return cards
- **Invoice menu** — A4 / Thermal
- **Follow-up Reminders** — customers with no orders in the window, filterable by search, since
  and catalogue; each row opens the order drawer
- **Create Delivery** — step 1 of 3, order selection
- **Create Sales Orders** — the right drawer in its empty state

**What is *not* here:** `OrderEditDrawer` and `BulkOrderDrawer` are unstarted, and two of the built
overlays are partial — steps 2–3 of the delivery wizard, and everything behind choosing a customer
in the order drawer (catalogue, cart, pricing). Every unbuilt destination is still reachable from
the list and says what it is rather than doing nothing.

**Immutable.** Do not edit anything in this folder.

| | |
| --- | --- |
| Published | <https://nishant-devekar.github.io/foodbridge-sales-orders-mockup/versions/orders-v1/index.html> |
| Accepted | 2026-08-11 · re-cut 2026-08-12 |
| Route | `/orders` (TabOrders branch — the only reachable tab) |
| Ported from | `storefront-frontend@develop`, `src/pages/Orders.jsx` |
| Addendum | [`../../instructions/addendum-002-live-orders-port.md`](../../instructions/addendum-002-live-orders-port.md) |
| Screens | 12 |
| Deferred to later phases | `OrderEditDrawer`, `BulkOrderDrawer`, `OrderCartModal`, `SubOrderDrawer`, `DemandReportDrawer`, `OrderForecastDrawer`; plus the unbuilt depth of `CreateOrderDrawer` and `CreateDeliveryModal` |
| Not ported (unreachable live) | Batch Management / Production / Reports tabs, `CreateBatch`, `ProxyOrderSelection` |

All customer, order and product data is invented — including the follow-up customers and delivery
candidates, which live are real tenant records. The lists are short (10 each) against the tenant
counts they report (24 and 161); the counts are shown so the framing stays honest. Order dates are stored as day offsets and
resolved at load, so the date-range filter stays meaningful however long after freezing this is
opened.

The **Google Sheet subsystem is deliberately dropped**. Live, `/orders` carries an export/sync
toolbar and an embedded sheet view; it was built here and then removed by decision, so the action
bar shows 7 controls where the live tenant shows 8.

Serve over HTTP to view — the screens read `seed.json` via `fetch()`, which browsers block on
`file://`:

```
python3 -m http.server 8000
```
