# Sales Orders — Discovery Prototype

Frozen discovery prototype (`orders-v1`) for the **Foodbridge Module Sales Orders** module,
built to the Application Module Development Standard (AMDS).

**▶ Live site:** https://nishant-devekar.github.io/foodbridge-sales-orders-mockup/

## What this is

A fidelity port of the **whole orders list screen** on the live storefront admin route
`/orders` — rebuilt as plain HTML, CSS and vanilla JavaScript.

It is a **prototype, not the product**: every screen is driven by `seed-data/seed.json`. There
are no API calls, no framework, and no build step.

| Screen | What it shows |
| ------ | ------------- |
| [01 — Orders list](screens/orders/screen-01-orders-list.html) | The landing state: search, status filter, date range, export |
| [02 — Filtered by status](screens/orders/screen-02-status-filtered.html) | Narrowed to Delivered |
| [03 — Date range filter](screens/orders/screen-03-date-range.html) | The range picker open |
| [04 — Order expanded](screens/orders/screen-04-order-expanded.html) | A row opened to its fulfilment section |
| [05 — No results](screens/orders/screen-05-no-results.html) | A filter that matches nothing |
| [06 — Empty state](screens/orders/screen-06-empty.html) | No orders at all |
| [07 — Loading](screens/orders/screen-07-loading.html) | Skeleton |
| [08 — Action bar](screens/orders/screen-08-action-bar.html) | Every action, each behind its feature flag |
| [09 — Smart Insights](screens/orders/screen-09-smart-insights.html) | The rule-driven hover card |

Append `?bare=1` to any screen URL to hide the discovery back-link for a clean comparison.

## Coverage

**Covered:** every control on the list screen — the table and its filters, the action bar, the
bulk-order mode dropdown, the mobile sticky footer and Smart Insights.

**Matched against a live reference.** A screenshot of the real `/orders` page and its DOM were used
to verify this. The container tree matched exactly; ten content and configuration differences were
found and corrected, including two things that had been invented and do not exist in the live app
(a selection-checkbox column and an allocation-status column this tenant has switched off). Feature
flags, status values, order-id format and amount ranges all now follow the reference.

Customer names and numbers are **not** copied from that reference — it carries real-looking tenant
data and this site is public. Invented equivalents matched for shape and length are used instead.

**Not covered:** what sits *behind* those controls. `/orders` is the largest route in this set —
about 13,800 lines of reachable UI — so the destinations were split into later phases:
`CreateOrderDrawer` (4,832 lines on its own), `BulkOrderDrawer`, `CreateDeliveryModal`,
`OrderReminderModal`, `OrderCartModal`, `OrderFulfillmentMetadata`, `OrderEditDrawer`,
`SubOrderDrawer`, `DemandReportDrawer`, `OrderForecastDrawer`. Each is reachable from the list and
names itself rather than doing nothing.

**Deliberately dropped:** the Google Sheet export/sync subsystem. It was built and then removed by
decision, so the action bar shows 7 controls where the live tenant shows 8.

**Not ported because unreachable live:** the Batch Management, Production and Reports tabs.
`OrderTabView` is the only caller of `setActiveTab` and it is commented out, so `activeTab` is
permanently `"TabOrders"` and those branches can never render.

## Frozen version

[`versions/orders-v1/`](versions/orders-v1/index.html) — accepted 2026-08-11, self-contained with
its own hub, assets and seed data.

## About the data

**All customer, order and product data here is invented.** No real tenant data was used. Order
dates are stored as day offsets and resolved at load, so the date-range filter stays meaningful
however long after freezing this is opened.

## On fidelity

Fidelity is verified two ways: **structurally** against the source JSX, and against a **real
screenshot and DOM** of the live page. The container tree is an exact match.

One thing remains unsettled: row pitch measures 78px here against roughly 68px read off the
reference image, while computing it from the live JSX gives ~74. The reference reading is most
likely a scaled-capture artifact rather than a real gap, but confirming that needs the
authenticated app running, which was not available.

## Running locally

The screens read `seed.json` via `fetch()`, which browsers block on `file://`. Serve over HTTP:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Provenance

Snapshot of `discovery/` from the `foodbridge-module-sales-orders` module repo, where the decision
log and the sources of truth this feeds into live.
