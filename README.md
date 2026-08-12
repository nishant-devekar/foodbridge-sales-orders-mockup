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
| [04 — Order expanded](screens/orders/screen-04-order-expanded.html) | The fulfilment panel: Details, Items, Comments, Fulfillment tabs |
| [05 — No results](screens/orders/screen-05-no-results.html) | A filter that matches nothing |
| [06 — Empty state](screens/orders/screen-06-empty.html) | No orders at all |
| [07 — Loading](screens/orders/screen-07-loading.html) | Skeleton |
| [08 — Action bar](screens/orders/screen-08-action-bar.html) | Every action, each behind its feature flag |
| [09 — Smart Insights](screens/orders/screen-09-smart-insights.html) | The rule-driven hover card |
| [10 — Follow-up Reminders](screens/orders/screen-10-follow-up-reminders.html) | Customers with no orders in the window; search, since and catalogue filters |
| [11 — Create Delivery](screens/orders/screen-11-create-delivery.html) | Step 1 of the route-delivery wizard — order selection |
| [12 — Create Sales Orders](screens/orders/screen-12-create-sales-orders.html) | The order drawer's empty state, before a customer is chosen |

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

**Overlays built so far — five of seven:**

- the row-expand fulfilment panel (`OrderFulfillmentMetadata` — four tabs, with dispatch →
  delivery-run → return cards)
- the Invoice dropdown (A4 / Thermal)
- **Follow-up Reminders** — the customer call list, with its three filters
- **Create Delivery** — step 1 of 3, order selection
- **Create Sales Orders** — the drawer's empty state

The last three were built **against the live app**, not from source: each trigger was opened in a
browser, the rendered DOM and computed geometry were read, and the overlay was closed again.
Nothing was submitted or changed. That method caught two things reading the source would not have
— the drawer mask is solid black at element `opacity: .3` rather than a 50% rgba fill, and the
drawer's footer total renders with no space after the currency symbol.

**Not covered:** `OrderEditDrawer` and `BulkOrderDrawer` are unstarted, and two of the built
overlays are partial — steps 2–3 of the delivery wizard, and everything behind choosing a customer
in the order drawer (catalogue, cart, pricing). `/orders` is the largest route in this set — about
13,800 lines of reachable UI — so `CreateOrderDrawer` (4,832 lines on its own), `OrderCartModal`,
`SubOrderDrawer`, `DemandReportDrawer` and `OrderForecastDrawer` were split into later phases. Each
is reachable from the list and names itself rather than doing nothing.

**Deliberately dropped:** the Google Sheet export/sync subsystem. It was built and then removed by
decision, so the action bar shows 7 controls where the live tenant shows 8.

**Not ported because unreachable live:** the Batch Management, Production and Reports tabs.
`OrderTabView` is the only caller of `setActiveTab` and it is commented out, so `activeTab` is
permanently `"TabOrders"` and those branches can never render.

## Frozen version

[`versions/orders-v1/`](versions/orders-v1/index.html) — accepted 2026-08-11 and re-cut 2026-08-12
with the three added overlays. Self-contained, with its own hub, assets and seed data.

## About the data

**All customer, order and product data here is invented.** No real tenant data was used. That
includes the follow-up customers and the delivery candidates, which in the live app are real
records with real phone numbers — the lists here are short (10 each) against the tenant counts
they report (24 and 161), and the counts are shown so the framing stays honest.

Order dates are stored as day offsets and resolved at load, so the date-range filter stays
meaningful however long after freezing this is opened.

## On fidelity

Fidelity is verified three ways: **structurally** against the source JSX, against a **screenshot
and DOM** of the live page, and — for the newest overlays — against the **running authenticated
app**, measured side by side in the same browser at the same viewport.

**The row-pitch question is now settled.** An earlier note here recorded it as open: 78px measured
in the prototype against roughly 68px read off a reference image, with the JSX suggesting ~74. With
the live app running, both were measured at the same 1353px viewport and they are identical —
127.5px for the first row, 127px thereafter, on both. All three earlier figures were
scaled-capture artifacts. There is no gap.

The same check retired a second suspected defect: the delivery wizard's first stepper label looks
clipped at the container edge, but the live app renders it at the same x, the same 69px width and
inside the same clipping ancestor. It was left as-is rather than "fixed" into a divergence.

## Running locally

The screens read `seed.json` via `fetch()`, which browsers block on `file://`. Serve over HTTP:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Provenance

Snapshot of `discovery/` from the `foodbridge-module-sales-orders` module repo, where the decision
log and the sources of truth this feeds into live.
