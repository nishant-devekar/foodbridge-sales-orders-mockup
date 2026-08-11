# Design Principles — Foodbridge Module Sales Orders

> This document is the human-readable bridge between "what we role-played" and the SSOTs
> that will govern development.

**Basis:** this round is a fidelity port of the **already-live** `/orders` route in
`storefront-frontend` — specifically its list screen — not a greenfield exploration. It describes
behaviour that ships today. See [Addendum 002](./instructions/addendum-002-live-orders-port.md).

## 1. Problem statement

A store operator needs to see every order placed against the store, find a specific one fast, know
where each has got to, and move it forward — without leaving the list or losing the filters they
arrived with.

## 2. Primary user(s) / actor(s)

| Actor | What they do in this module |
| ----- | --------------------------- |
| Store admin / sales desk | Reads and searches orders, advances status, exports, opens an order to amend it |
| Dispatch / delivery staff | Consume order status downstream — they do not act here |
| Customer (buyer) | The **subject** of an order, never a user of this screen |

The list **reports and transitions**; the acts of creating, fulfilling and invoicing an order each
live behind their own surfaces.

## 3. What "good" looks like

- One search box finds an order by **customer name, phone, or order number** — the operator does
  not have to know which of the three they remember.
- Status is honest about what is possible: an order only offers the transitions its workflow
  permits, and an order that can no longer move says so by being inert rather than by failing.
- The list never silently lies about money: the amount shown is the payable total after discount,
  computed the same way everywhere.
- Filters compose. Status, date range and search narrow together, and clearing one keeps the rest.

Frustrating would be: a status dropdown offering a transition that then errors; an order that looks
editable until you try; losing your filters every time you look at an order.

## 4. Constraints learned during discovery

- **Order status is tenant configuration, not an enum in the code.** The set of statuses *and* the
  permitted moves between them come from the tenant's order workflow. Nothing may hardcode a status
  list.
- **Editability is not a status question alone.** An order is editable only while its status allows
  it **and** no dispatch has happened. Physical activity closes the door before status does.
- **The customer on an order may come from two places** — a buyer *location* when the order is
  placed against one, otherwise the ordering user. The location wins.
- **The list is server-driven.** Search, status, date range and paging are query parameters, not
  client-side array work; the list is a window onto a much larger set.
- **Money is derived, not stored flat.** The payable total is line totals less discount, with
  several fallbacks — a single shared calculation, not a field to read.
- **Fulfilment is a one-to-many tail.** An order accumulates dispatches, deliveries and returns,
  summarised on the row and expandable underneath.
- Page size is 20.

## 5. Decisions carried into Development

| Decision | Rationale | Feeds into SSOT |
|---|---|---|
| `Order` status values and transitions are **configuration**, sourced per tenant | The live app reads them from tenant settings; hardcoding would break every tenant that differs | 01-state-machine, 02-domain-model |
| Permitted transitions are `currentStatus → nextStatuses`, and a status with none is terminal | Directly observed in the row `<select>`; terminal renders disabled | 01-state-machine |
| An order is editable only when status allows **and** dispatch count is zero | Two independent gates, not one | 01-state-machine, 05-workflow-model |
| `Order` references a `Customer` **and optionally a buyer `Location`**; the location takes precedence for display | Both appear live; precedence is deterministic | 02-domain-model, 04-frontend-domain-model |
| Payable total = sum of line totals − discount, with defined fallbacks | Must be one shared calculation so list, detail and invoice agree | 02-domain-model |
| An `Order` has many `Dispatch`, `Delivery` and `Return` records | The row summarises counts of all three | 02-domain-model |
| Order creation, amendment, fulfilment and invoicing are **separate surfaces**, not part of the list | Each is a large flow with its own rules; the list only lists and transitions | 05-workflow-model, 07-collaboration-contract |
| Sourcing, invoicing and the order timeline sit **outside** this module | The list links out to them; it never owns them | 07-collaboration-contract |
| List queries are server-side: status, date range, free-text search, page | The contract the module depends on | 05-workflow-model, 06-test-bed-schema |
| Free-text search spans order number, customer name and customer phone | Mirrors how operators actually recall an order | 05-workflow-model |
| Filters compose and clearing one preserves the others | Otherwise narrowing is destructive | 05-workflow-model |
| List states are: loading → (rows \| empty) → error | Each is a distinct rendered state | 01-state-machine, 06-test-bed-schema |

## 6. Accepted version

Phase 1 (the orders list) is accepted and frozen. Later phases will freeze separately.

| Version | Scope | Date accepted | Accepted by | Path |
| ------- | ----- | ------------- | ----------- | ---- |
| `orders-v1` | `/orders` — the list | 2026-08-11 | Shreyas Devekar | `discovery/versions/orders-v1/index.html` |

Not yet started: order detail and amendment, order creation (`CreateOrderDrawer`), and reporting.
