# Discovery version `orders-v1` — snapshot

Frozen snapshot of the `/orders` discovery prototype, accepted **2026-08-11**, taken per discovery
working rule **R6** ("an accepted iteration becomes a version").

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

**What is *not* here** is what sits *behind* those controls — the drawers and modals each button
opens. Every one is reachable from the list and says what it is rather than doing nothing.

**Immutable.** Do not edit anything in this folder.

| | |
| --- | --- |
| Published | <https://nishant-devekar.github.io/foodbridge-sales-orders-mockup/versions/orders-v1/index.html> |
| Accepted | 2026-08-11 |
| Route | `/orders` (TabOrders branch — the only reachable tab) |
| Ported from | `storefront-frontend@develop`, `src/pages/Orders.jsx` |
| Addendum | [`../../instructions/addendum-002-live-orders-port.md`](../../instructions/addendum-002-live-orders-port.md) |
| Screens | 9 |
| Deferred to later phases | `CreateOrderDrawer`, `BulkOrderDrawer`, `CreateDeliveryModal`, `OrderReminderModal`, `OrderCartModal`, `OrderFulfillmentMetadata`, `OrderEditDrawer`, `SubOrderDrawer`, `DemandReportDrawer`, `OrderForecastDrawer` |
| Not ported (unreachable live) | Batch Management / Production / Reports tabs, `CreateBatch`, `ProxyOrderSelection` |

All customer, order and product data is invented. Order dates are stored as day offsets and
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
