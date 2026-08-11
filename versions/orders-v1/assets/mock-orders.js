/*
  DISCOVERY MOCK — Sales Orders (live route: /orders).

  Hand-port of the live storefront-frontend orders list:
    src/pages/Orders.jsx                          → renderPage() (TabOrders branch only)
    src/components/order/OrderTable.jsx           → renderRows() + desktop row cells
    src/components/order/MobileOrderCard.jsx      → renderMobileCard()
    src/components/order/SelectOrderByStatus.jsx  → renderStatusSelect()
    src/components/common/CustomPagination.jsx    → renderPagination()
    src/components/preloader/TableLoading.jsx     → renderTableLoading()
    src/components/table/NotFound.jsx             → renderNotFound()
    src/utils/orders.js                           → status-workflow helpers

  Every Tailwind class string is copied verbatim from the source JSX so the
  rendered DOM carries the same classes the live app does. The table shell is
  Windmill (resolved against the app's own myTheme.js override, see WM); the
  row internals are hand-rolled slate/emerald Tailwind.

  SCOPE — Phase 1 is the orders LIST only. Deliberately not ported:
    • CreateOrderDrawer (4,832 lines), BulkOrderDrawer, OrderForecastDrawer,
      DemandReportDrawer, OrderEditDrawer, SubOrderDrawer, OrderCartModal,
      OrderFulfillmentMetadata — each its own phase.
    • The Google Sheet subsystem (toolbar, export/sync, embedded view) —
      dropped by decision; see addendum divergence D9.
    • The Batch Management / Production / Reports tabs, which are unreachable
      in the live app: OrderTabView is the only caller of setActiveTab and it
      is commented out, so activeTab is permanently "TabOrders". See D4.

  Data comes from seed-data/seed.json — nothing here talks to a real API.
*/
(function () {
  "use strict";

  const { esc, toTitleCaseFun } = window.MockShell.helpers;
  const icon = (name, cls, size, style) => window.MockIcons.get(name, cls, size, style);

  /* ── myTheme.js resolved ──────────────────────────────────────────────── */
  const WM = {
    card: "min-w-0 rounded-lg overflow-hidden bg-white dark:bg-gray-800",
    cardBody: "p-4",
    input:
      "block w-full h-10 border border-gray-200 bg-white px-3 py-1 text-sm focus:outline-none dark:text-gray-300 leading-5 rounded-md bg-gray-100 focus:bg-white dark:focus:bg-gray-700 focus:border-gray-200 border-gray-200 dark:border-gray-600 dark:focus:border-gray-500 dark:bg-gray-700",
    buttonPrimary:
      "align-bottom inline-flex items-center justify-center cursor-pointer leading-5 transition-colors duration-150 font-medium focus:outline-none px-4 py-2 rounded-md text-sm text-white bg-green-600 border border-transparent active:bg-green-700 hover:bg-green-700",
    tableContainer:
      "w-full overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg",
    tableHeader:
      "text-sm font-medium tracking-wide text-left text-zinc-500 uppercase border-b border-gray-200 dark:border-gray-700 bg-white dark:text-gray-400 dark:bg-gray-800",
    tableBody:
      "bg-white divide-y divide-gray-100 dark:divide-gray-700 dark:bg-gray-800 text-gray-800 dark:text-gray-400",
    tableCell: "px-4 py-2",
    tableFooter:
      "px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white text-gray-500 dark:text-gray-400 dark:bg-gray-800",
  };

  const PAGE_SIZE = 20; // SidebarContext.resultsPerPage

  /* ── State ────────────────────────────────────────────────────────────── */
  const state = {
    seed: null,
    label: "Sales Orders",
    currency: "₹",
    orders: [],
    loading: false,
    search: "",
    searchInput: "",
    status: "",
    startDate: null,
    endDate: null,
    page: 1,
    expanded: [],
    copied: "",
    statusOpen: false,
    dateOpen: false,
    exporting: false,

    // Action bar / Google Sheets / mobile footer
    bulkMenuOpen: false,
    mobileCreateMenuOpen: false,

    // Row-level
    insightFor: null,
    insightPos: { top: 0, left: 0 },
  };

  let outlet = null;
  let searchTimer = null;

  /* ── Date helpers ─────────────────────────────────────────────────────── */
  const todayStart = () => new Date(new Date().setHours(0, 0, 0, 0));
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

  const fmtDate = (v) =>
    new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const fmtDate2 = (v) =>
    new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const fmtTime = (v) =>
    new Date(v).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const fmtPickerDate = (d) =>
    d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, " ") : "";
  const toInputVal = (d) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
  const fromInputVal = (s) => {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  };

  // Order date offsets are resolved to real dates here; see seed `_dateComment`.
  // The invoice number is rebuilt to the live shape: the order date with no
  // zero padding (2026-8-11 -> "2026811") followed by a time-derived counter,
  // giving the 13-14 digit numeric ids the reference screenshot shows.
  function materialiseOrders(seed) {
    return (seed.orders || []).map((o) => {
      const d = new Date(Date.now() - o.createdMinutesAgo * 60000);
      d.setSeconds(0, 0);
      const datePart = `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
      return Object.assign({}, o, {
        createdAt: d.toISOString(),
        invoice: datePart + o.invoiceSuffix,
        createdDaysAgo: Math.floor(o.createdMinutesAgo / 1440),
      });
    });
  }

  /* ── src/utils/orders.js ──────────────────────────────────────────────── */
  const statusWorkflow = () => (state.seed && state.seed.statusWorkflow) || [];

  // Filter dropdown options — every distinct status in the workflow.
  const allStatuses = () =>
    Array.from(new Set(statusWorkflow().map((w) => w.status)));

  // Per-row select options — the current status plus whatever it can move to.
  // A terminal status yields a single option, which renders disabled.
  function statusOptionsFor(status) {
    const wf = statusWorkflow().find((w) => w.status === status);
    return Array.from(new Set([status].concat((wf && wf.nextStatuses) || [])));
  }

  /* ── Money ────────────────────────────────────────────────────────────── */
  const getNumberTwo = (n) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const getNumber = (n) =>
    Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  // OrderTable.calculateOrderPayableTotal — cart line totals less discount.
  function orderTotal(order) {
    if (Array.isArray(order.cart) && order.cart.length > 0) {
      const sum = order.cart.reduce((t, i) => t + (Number(i.itemTotal) || 0), 0);
      return Math.max(0, sum - (Number(order.discount) || 0));
    }
    if (order.total > 0) return order.total;
    if (order.subTotal > 0) return order.subTotal;
    return 0;
  }

  /* ── MobileOrderCard.jsx — status chip colours ────────────────────────── */
  function getStatusClasses(status) {
    const n = String(status || "").toLowerCase();
    if (n.includes("deliver") || n.includes("complete"))
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/10";
    if (n.includes("cancel") || n.includes("reject"))
      return "bg-rose-50 text-rose-700 ring-rose-600/10";
    if (n.includes("progress") || n.includes("transit"))
      return "bg-blue-50 text-blue-700 ring-blue-600/10";
    if (n.includes("pending") || n.includes("process"))
      return "bg-amber-50 text-amber-700 ring-amber-600/10";
    return "bg-slate-100 text-slate-700 ring-slate-600/10";
  }

  /* ── Filtering (server-side live; same contract reproduced here) ──────── */
  function filteredOrders() {
    let list = state.orders;
    if (state.status) list = list.filter((o) => o.status === state.status);
    if (state.startDate || state.endDate) {
      const from = state.startDate;
      const to = state.endDate ? new Date(state.endDate.getTime() + 86399999) : null;
      list = list.filter((o) => {
        const d = new Date(o.createdAt);
        return (!from || d >= from) && (!to || d <= to);
      });
    }
    if (state.search) {
      const q = state.search.toLowerCase();
      list = list.filter(
        (o) =>
          String(o.invoice || "").toLowerCase().includes(q) ||
          String((o.user_info && o.user_info.name) || "").toLowerCase().includes(q) ||
          String((o.user_info && o.user_info.contact) || "").includes(q)
      );
    }
    return list;
  }

  function customerFor(order) {
    const loc = order.buyer_location_id && (state.seed.locations || {})[order.buyer_location_id];
    return {
      name: toTitleCaseFun(loc ? loc.name : (order.user_info || {}).name),
      contact: toTitleCaseFun(loc ? loc.contact : (order.user_info || {}).contact),
    };
  }

  /* ── globalSetting.appProp.orderManagementFeatures ────────────────────── */
  const features = () => (state.seed.appProp && state.seed.appProp.orderManagementFeatures) || {};

  /* ── OrderTable.generateOrderInsights (rule subset) ───────────────────────
     Live this derives everything from the dispatch/delivery/return records.
     Those record sets are a later phase, so the seed carries the derived
     figures and the rules below run against them unchanged — same order, same
     thresholds, same copy, same slice(0, 3) cap. */
  function generateOrderInsights(order) {
    const insights = [];
    const cur = state.currency;
    const f = order.fulfillment || { dispatches: 0, deliveries: 0, returns: 0 };
    const age = order.createdDaysAgo;
    const value = orderTotal(order);
    const itemCount = (order.cart || []).length;
    const qty = order.totalQty || 0;
    const push = (severity, title, message, action) =>
      insights.push({ severity, title, message, action });

    if (String(order.status).toLowerCase() === "cancelled") {
      push("info", "Order Cancelled",
        `Cancelled ${age}d ago. ${cur}${value.toFixed(0)} order archived.`, null);
      return insights.slice(0, 3);
    }
    if (value >= 5000 && f.dispatches === 0 && age >= 2) {
      push("critical", "🔥 High-Value Order at Risk",
        `${cur}${value.toFixed(0)} order delayed ${age}d. No dispatch created. Customer escalation risk.`,
        "Prioritize & dispatch now");
    }
    if ((order.returnRate || 0) >= 30 && f.returns > 0) {
      push("critical", "⚠️ High Return Rate Alert",
        `${order.returnRate}% items returned. Quality or accuracy issue suspected.`,
        "Investigate root cause");
    }
    if ((order.dispatchRejected || 0) >= 2) {
      push("critical", "❌ Multiple Dispatch Failures",
        `${order.dispatchRejected} dispatches rejected. Fulfillment process breakdown.`,
        "Review & create new dispatch");
    }
    if ((order.returnsPending || 0) > 0) {
      push("high", "Return Pickup Required",
        `${order.returnsPending} return${order.returnsPending > 1 ? "s" : ""} awaiting collection.`,
        "Schedule pickup");
    }
    if (f.dispatches === 0) {
      if (age >= 3) {
        push("high", "Fulfillment Critically Delayed",
          `${age}d old, ${itemCount} item${itemCount > 1 ? "s" : ""}, ${qty} units. Zero progress.`,
          "Create dispatch urgently");
      } else if (age >= 1) {
        push("medium", "Dispatch Allocation Pending",
          `${age}d since order. ${itemCount} product${itemCount > 1 ? "s" : ""} (${qty} units) awaiting dispatch.`,
          "Allocate inventory");
      } else {
        push("normal", "🆕 Fresh Order Ready",
          `${itemCount} item${itemCount > 1 ? "s" : ""}, ${qty} units, ${cur}${value.toFixed(0)}. Ready for processing.`,
          "Create dispatch");
      }
      return insights.slice(0, 3);
    }
    const pct = order.fulfilledPct || 0;
    if (pct > 0 && pct < 100) {
      const dispatched = Math.round((qty * pct) / 100);
      push("medium", "Partial Fulfillment",
        `${pct}% dispatched (${dispatched}/${qty} units). ${qty - dispatched} units pending.`,
        "Complete remaining dispatch");
    }
    if ((order.dispatchRejected || 0) === 1) {
      push("high", "Dispatch Rejected",
        `1 dispatch rejected. ${f.returns > 0 ? "Return initiated." : "Create return for rejected items."}`,
        f.returns === 0 ? "Create return" : "Monitor return");
    }
    if ((order.returnsInTransit || 0) > 0) {
      push("warning", "Returns In Transit",
        `${order.returnsInTransit} return${order.returnsInTransit > 1 ? "s" : ""} being returned.`,
        "Track & verify receipt");
    }
    if ((order.unassignedDispatches || 0) > 0) {
      push("medium", "Delivery Assignment Needed",
        `${order.unassignedDispatches} of ${f.dispatches} dispatch${order.unassignedDispatches > 1 ? "es" : ""} not linked to delivery run.`,
        "Create or assign to delivery");
    }
    // ── Normal / success tail ──────────────────────────────────────────────
    if (f.deliveries > 0 && String(order.status).toUpperCase() !== "DELIVERED") {
      push("normal", "🚚 Delivery In Progress",
        `${f.deliveries} active run${f.deliveries > 1 ? "s" : ""} (${pct}% avg progress). ${Math.min(f.deliveries, f.dispatches)}/${f.dispatches} dispatches delivered.`,
        "Monitor delivery");
    }
    if (f.dispatches > 0 && f.deliveries === 0) {
      push("normal", "Dispatches Ready for Delivery",
        `${f.dispatches} dispatch${f.dispatches > 1 ? "es are" : " is"} packed and ready. No delivery run created.`,
        "Create delivery run");
    }
    if (f.returns > 0 && (order.returnsPending || 0) === 0 && (order.returnsInTransit || 0) === 0) {
      push("info", "Returns Received",
        `${f.returns} return${f.returns > 1 ? "s" : ""} received.`,
        "Process refund/exchange");
    }
    if (String(order.status).toUpperCase() === "DELIVERED" && pct >= 100 && f.returns === 0) {
      push("success", "✅ Order Fulfilled",
        `${qty} units delivered across ${f.deliveries} run${f.deliveries > 1 ? "s" : ""}. ${cur}${value.toFixed(0)} completed.`,
        null);
    }
    return insights.slice(0, 3);
  }

  const INSIGHT_STYLES = {
    critical: "bg-red-50 border-l-red-500",
    high: "bg-amber-50 border-l-amber-500",
    warning: "bg-orange-50 border-l-orange-500",
    medium: "bg-yellow-50 border-l-yellow-500",
    success: "bg-emerald-50 border-l-emerald-500",
  };
  const INSIGHT_TITLE = {
    critical: "text-red-900", high: "text-amber-900", warning: "text-orange-900",
    medium: "text-yellow-900", success: "text-emerald-900",
  };

  function renderInsightCard() {
    if (!state.insightFor) return "";
    const order = state.orders.find((o) => o._id === state.insightFor);
    if (!order) return "";
    const insights = generateOrderInsights(order);
    const body =
      insights.length === 0
        ? `<div class="py-8 px-4 text-center">${icon("zap", "w-6 h-6 text-slate-300 mx-auto mb-2")}<p class="text-xs text-slate-500">Analyzing order data...</p></div>`
        : insights
            .map(
              (ins) => `<div class="p-3 rounded border-l-4 transition-all duration-200 overflow-hidden ${
                INSIGHT_STYLES[ins.severity] || "bg-slate-50 border-l-slate-400"
              }">
                <div class="flex items-start justify-between gap-2">
                  <span class="text-xs font-bold ${INSIGHT_TITLE[ins.severity] || "text-slate-900"}">${esc(ins.title)}</span>
                  ${ins.severity === "critical" ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600 text-white whitespace-nowrap flex-shrink-0">URGENT</span>` : ""}
                  ${ins.severity === "high" ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-600 text-white whitespace-nowrap flex-shrink-0">HIGH</span>` : ""}
                </div>
                <p class="mt-1 text-[11px] leading-snug text-slate-600">${esc(ins.message)}</p>
                ${ins.action ? `<p class="mt-1.5 text-[11px] font-semibold text-slate-700">→ ${esc(ins.action)}</p>` : ""}
              </div>`
            )
            .join("");
    return `
      <div data-insightcard style="position:fixed;top:${state.insightPos.top}px;left:${state.insightPos.left}px;width:320px;max-width:calc(100vw - 32px);z-index:9999" class="pointer-events-auto">
        <div class="bg-white rounded-lg shadow-2xl border-2 border-purple-200 overflow-hidden transition-all duration-150">
          <div class="bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-2.5">
            <div class="flex items-center gap-2">
              <div class="flex-shrink-0">${icon("zap", "w-4 h-4 text-white")}</div>
              <div class="flex-1 min-w-0"><span class="text-sm font-bold text-white block">Smart Insights</span></div>
            </div>
          </div>
          <div class="p-3 space-y-2 max-h-96 overflow-y-auto overflow-x-hidden">${body}</div>
        </div>
      </div>`;
  }


  /* ── BulkOrderModeDropdown.jsx ────────────────────────────────────────── */
  function renderBulkOrderDropdown() {
    return `
      <div class="relative" data-bulkroot>
        <button type="button" data-bulktoggle
          class="w-full font-medium py-1 px-2 justify-center items-center border !border-gray-200 flex hover:!bg-gray-100 rounded-md h-10 text-sm bg-white text-black">
          ${icon("fileSpreadsheet", "mr-2 mt-[1px]", 14)}Bulk ${esc(state.label)}
          ${icon("chevronDown", `h-3.5 w-3.5 ml-2 shrink-0 transition-transform duration-150 ${state.bulkMenuOpen ? "rotate-180" : ""}`)}
        </button>
        ${state.bulkMenuOpen ? `<div class="absolute right-0 top-full mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden z-[9999]">
          <button type="button" data-bulkmode="STANDARD" class="w-full flex items-start gap-3 px-4 py-3 text-sm text-left text-gray-700 hover:bg-emerald-50 transition">
            ${icon("fileSpreadsheet", "h-4 w-4 shrink-0 mt-0.5 text-emerald-600")}
            <div><div class="font-medium">Bulk ${esc(state.label)}</div><div class="text-xs text-gray-400 mt-0.5">Create regular bulk orders</div></div>
          </button>
          <div class="border-t border-gray-100"></div>
          <button type="button" data-bulkmode="ROUTE" class="w-full flex items-start gap-3 px-4 py-3 text-sm text-left text-gray-700 hover:bg-indigo-50 transition">
            ${icon("route", "h-4 w-4 shrink-0 mt-0.5 text-indigo-500")}
            <div><div class="font-medium">Route Bulk ${esc(state.label)}</div><div class="text-xs text-gray-400 mt-0.5">Create orders for route delivery</div></div>
          </button>
        </div>` : ""}
      </div>`;
  }

  /* ── CustomPagination.jsx ─────────────────────────────────────────────── */
  function renderPagination(currentPage, totalPages, resultsPerPage, totalResults) {
    const pages = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("l");
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("r");
      pages.push(totalPages);
    }
    const btn = (p) =>
      p === "l" || p === "r"
        ? `<span class="px-2 text-gray-500 dark:text-gray-400 font-medium">...</span>`
        : `<li><button data-page="${p}" type="button" class="align-bottom inline-flex items-center justify-center cursor-pointer leading-5 transition-colors duration-150 font-medium focus:outline-none px-3 py-1 rounded-md text-xs ${
            currentPage === p
              ? "text-white bg-green-500 hover:bg-green-600"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }">${p}</button></li>`;
    const start = (currentPage - 1) * resultsPerPage + 1;
    const end = Math.min(currentPage * resultsPerPage, totalResults);
    return `
      <div class="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">
        <span class="font-semibold tracking-wide uppercase text-xs">SHOWING ${start}–${end} OF ${totalResults}</span>
        <div class="mt-2 sm:mt-0"><nav aria-label="Table navigation"><ul class="inline-flex items-center space-x-2">
          <li><button data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} class="px-2 py-1 text-sm rounded-md text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50">‹</button></li>
          ${pages.map(btn).join("")}
          <li><button data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} class="px-2 py-1 text-sm rounded-md text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50">›</button></li>
        </ul></nav></div>
      </div>`;
  }

  /* ── TableLoading.jsx (row=12 col=7 width=160 height=20) ──────────────── */
  function renderTableLoading(row = 12, col = 7, width = 160, height = 20) {
    const bar = (h, w) => `<span class="skeleton mx-1 my-1" style="height:${h}px;width:${w}px"></span>`;
    return `
      <div class="${WM.tableContainer} mb-8">
        <div class="text-center">
          ${Array.from({ length: col }, () => bar(40, width)).join("")}
          ${Array.from({ length: row }, () => `<div>${Array.from({ length: col }, () => bar(height, width)).join("")}</div>`).join("")}
        </div>
        <div class="${WM.tableFooter} flex justify-between">${bar(25, 290)}${bar(25, 290)}</div>
      </div>`;
  }

  /* ── NotFound.jsx ─────────────────────────────────────────────────────── */
  const NO_RESULT_SVG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><g fill="none" stroke="#d1d5db" stroke-width="3"><rect x="60" y="45" width="200" height="120" rx="10"/><line x1="60" y1="78" x2="260" y2="78"/><line x1="90" y1="103" x2="230" y2="103"/><line x1="90" y1="126" x2="200" y2="126"/></g><circle cx="215" cy="140" r="34" fill="#fff" stroke="#9ca3af" stroke-width="4"/><line x1="239" y1="164" x2="262" y2="187" stroke="#9ca3af" stroke-width="7" stroke-linecap="round"/></svg>'
    );

  function renderNotFound(title) {
    return `
      <div class="text-center align-middle mx-auto p-5 my-5">
        <div class="flex justify-center"><img class="my-4 w-full max-w-xs sm:max-w-sm md:max-w-md" src="${NO_RESULT_SVG}" alt="no-result" /></div>
        <h2 class="text-lg md:text-xl lg:text-2xl xl:text-2xl text-center mt-2 font-medium font-serif text-gray-600">We're sorry, ${esc(title)}</h2>
      </div>`;
  }

  /* ── SelectOrderByStatus (react-select stand-in) ──────────────────────── */
  function renderStatusSelect() {
    const opts = allStatuses();
    const label = state.status ? toTitleCaseFun(state.status) : null;
    return `
      <div class="relative" data-statusroot>
        <div class="rs-control ${state.statusOpen ? "is-focused" : ""}" data-statustoggle>
          <span class="${label ? "" : "rs-placeholder"}">${label ? esc(label) : "All Status"}</span>
          <span class="flex items-center gap-1">
            ${state.status ? `<button type="button" data-statusclear class="text-gray-400 hover:text-gray-600">${icon("x", "w-4 h-4")}</button>` : ""}
            ${icon("chevronDown", "w-4 h-4 text-gray-400")}
          </span>
        </div>
        ${
          state.statusOpen
            ? `<div class="rs-menu">${opts
                .map(
                  (s) =>
                    `<div data-statusopt="${esc(s)}" class="px-3 py-2 cursor-pointer text-sm ${
                      s === state.status ? "bg-blue-600 text-white" : "bg-white text-gray-800 hover:bg-blue-600 hover:text-white"
                    }">${esc(toTitleCaseFun(s))}</div>`
                )
                .join("")}</div>`
            : ""
        }
      </div>`;
  }

  /* ── MobileOrderCard.jsx ──────────────────────────────────────────────── */
  function renderMobileCard(order) {
    const cust = customerFor(order);
    const c = order.fulfillment || { dispatches: 0, deliveries: 0, returns: 0 };
    const isExpanded = state.expanded.includes(order._id);
    const opts = statusOptionsFor(order.status);
    const canChange = opts.length > 1;
    const statusLabel = String(order.status || "Pending").replace(/_/g, " ");

    const counts =
      c.dispatches > 0 || c.deliveries > 0 || c.returns > 0
        ? `<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
             ${c.dispatches > 0 ? `<span class="text-emerald-600"><span class="mr-1">●</span>${c.dispatches} dispatch${c.dispatches > 1 ? "es" : ""}</span>` : ""}
             ${c.deliveries > 0 ? `<span class="text-violet-600"><span class="mr-1">●</span>${c.deliveries} deliver${c.deliveries > 1 ? "ies" : "y"}</span>` : ""}
             ${c.returns > 0 ? `<span class="text-orange-600"><span class="mr-1">●</span>${c.returns} return${c.returns > 1 ? "s" : ""}</span>` : ""}
           </div>`
        : "";

    return `
      <div class="md:hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div role="button" tabindex="0" data-toggle="${esc(order._id)}" aria-expanded="${isExpanded}"
             class="w-full px-4 py-3.5 text-left transition-colors active:bg-slate-50">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-sm font-bold tracking-tight text-slate-800">${esc(order.invoice)}</span>
                <span role="button" tabindex="0" data-copy="${esc(order.invoice)}" aria-label="Copy order reference"
                      class="rounded p-1 text-violet-500 transition-colors hover:bg-violet-50">${icon("copy", "h-3.5 w-3.5")}</span>
                ${icon("zap", "h-3.5 w-3.5 flex-shrink-0 text-violet-500")}
              </div>
              ${counts}
            </div>
            <div class="flex-shrink-0 text-right">
              ${
                canChange
                  ? `<label class="relative inline-flex items-center rounded-md ring-1 ring-inset ${getStatusClasses(order.status)}">
                       <span class="pointer-events-none absolute right-1.5 text-current">${icon("chevronDown", "h-3 w-3")}</span>
                       <select data-rowstatus="${esc(order._id)}" aria-label="Change status for order ${esc(order.invoice)}"
                         class="cursor-pointer appearance-none border-0 bg-transparent py-1 pl-2 pr-6 text-[10px] font-semibold capitalize text-current outline-none">
                         ${opts.map((s) => `<option value="${esc(s)}" ${s === order.status ? "selected" : ""} class="bg-white text-slate-800">${esc(String(s).replace(/_/g, " "))}</option>`).join("")}
                       </select>
                     </label>`
                  : `<span class="inline-flex rounded-md px-2 py-1 text-[10px] font-semibold capitalize ring-1 ring-inset ${getStatusClasses(order.status)}">${esc(statusLabel)}</span>`
              }
              <div class="mt-1.5 text-[11px] leading-4 text-slate-500">
                <div>${fmtDate2(order.createdAt)}</div>
                <div>${fmtTime(order.createdAt)}</div>
              </div>
            </div>
          </div>
          <div class="mt-3 flex items-end justify-between gap-3">
            <div class="flex min-w-0 items-start gap-2">
              ${icon("user", "mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400")}
              <div class="min-w-0">
                <div class="truncate text-xs font-semibold text-slate-800">${esc(cust.name || "Customer")}</div>
                ${cust.contact ? `<div class="mt-0.5 text-[11px] text-slate-500">${esc(cust.contact)}</div>` : ""}
              </div>
            </div>
            <div class="flex-shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">${state.currency}${getNumberTwo(orderTotal(order))}</div>
          </div>
        </div>
        <div class="flex items-center border-t border-slate-100 bg-slate-50/70">
          <button type="button" data-toggle="${esc(order._id)}" aria-expanded="${isExpanded}"
            class="flex min-w-0 flex-1 items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100">
            <span>${isExpanded ? "Hide order details" : "View order details"}</span>
            ${icon("chevronDown", `h-4 w-4 text-slate-500 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`)}
          </button>
        </div>
        ${isExpanded ? `<div class="border-t border-slate-100">${renderExpandedStub(order)}</div>` : ""}
      </div>`;
  }

  /* Expanded row placeholder. Live this is <OrderFulfillmentMetadata/> — 685
     lines of dispatch/delivery/return detail, deferred to a later phase. The
     row still expands so the interaction is representable. */
  function renderExpandedStub(order) {
    const c = order.fulfillment || { dispatches: 0, deliveries: 0, returns: 0 };
    return `
      <div class="px-5 py-4 bg-slate-50">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span class="inline-flex items-center gap-1.5 text-slate-600 text-xs font-medium bg-slate-100 px-2.5 py-1 rounded-full">${
            (order.cart || []).length
          } line item${(order.cart || []).length !== 1 ? "s" : ""}</span>
          <span class="text-slate-600"><span class="text-slate-400">Dispatches</span> <span class="font-semibold text-emerald-700">${c.dispatches}</span></span>
          <span class="text-slate-600"><span class="text-slate-400">Deliveries</span> <span class="font-semibold text-violet-700">${c.deliveries}</span></span>
          <span class="text-slate-600"><span class="text-slate-400">Returns</span> <span class="font-semibold text-orange-700">${c.returns}</span></span>
        </div>
        <p class="mt-3 text-xs text-slate-500">
          The live app renders <code class="font-mono">OrderFulfillmentMetadata</code> here — per-dispatch,
          per-delivery and per-return detail. Not ported in this discovery round; see divergence D5.
        </p>
      </div>`;
  }

  /* ── OrderTable.jsx — desktop row ─────────────────────────────────────── */
  const ALLOC_STYLES = {
    FULLY_ALLOCATED: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Fully Allocated" },
    PARTIALLY_ALLOCATED: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Partially Allocated" },
    UNALLOCATED: { cls: "bg-slate-100 text-slate-600 border-slate-200", label: "Unallocated" },
  };

  function renderAllocationCell(order) {
    const a = ALLOC_STYLES[order.allocationStatus] || ALLOC_STYLES.UNALLOCATED;
    const pct = order.fulfilledPct || 0;
    return `<div class="flex flex-col gap-2">
      <span class="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${a.cls}">${a.label}</span>
      <div class="flex items-center gap-2">
        <div class="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-slate-300"}" style="width:${Math.min(100, pct)}%"></div>
        </div>
        <span class="text-[11px] tabular-nums text-slate-500">${order.allocatedQty || 0}/${order.totalQty || 0}</span>
      </div>
    </div>`;
  }

  function renderDesktopRow(order) {
    const cust = customerFor(order);
    const c = order.fulfillment || { dispatches: 0, deliveries: 0, returns: 0 };
    const isExpanded = state.expanded.includes(order._id);
    const opts = statusOptionsFor(order.status);
    const isDisabled = opts.length <= 1;
    // Live: editAllowedStatuses AND no dispatch activity yet.
    const isEditAllowed = ["PENDING", "PROCESSING"].includes(order.status) && c.dispatches === 0;
    const showInvoice = !!(state.seed.appProp && state.seed.appProp.canShowInvoiceAction);
    const showAllocation = features().allocationStatus === true;

    const countPills =
      c.dispatches > 0 || c.deliveries > 0 || c.returns > 0
        ? `<div class="flex items-center gap-2">
             ${c.dispatches > 0 ? `<div class="flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div><button data-toggle="${esc(order._id)}" class="text-xs font-medium text-emerald-600">${c.dispatches} dispatch${c.dispatches > 1 ? "es" : ""}</button></div>` : ""}
             ${c.deliveries > 0 ? `<div class="flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-purple-500"></div><button data-toggle="${esc(order._id)}" class="text-xs font-medium text-purple-600">${c.deliveries} deliver${c.deliveries > 1 ? "ies" : "y"}</button></div>` : ""}
             ${c.returns > 0 ? `<div class="flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-orange-500"></div><button data-toggle="${esc(order._id)}" class="text-xs font-medium text-orange-600">${c.returns} return${c.returns > 1 ? "s" : ""}</button></div>` : ""}
           </div>`
        : "";

    return `
      <tr class="group hidden hover:bg-gradient-to-r hover:from-slate-50 hover:to-transparent transition-all duration-200 border-b border-slate-100 md:table-row">
        <td class="${WM.tableCell} py-4 px-6 w-[200px]">
          <div class="flex items-center gap-3">
            <button data-toggle="${esc(order._id)}" class="p-1.5 -ml-1 hover:bg-slate-200 rounded-lg transition-all duration-200 hover:shadow-sm"
              aria-label="${isExpanded ? "Collapse deliveries" : "Expand deliveries"}">
              ${icon(isExpanded ? "chevronUp" : "chevronDown", "w-4 h-4 text-slate-600")}
            </button>
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-slate-900 tracking-tight">${esc(order.invoice)}</span>
                <button data-copy="${esc(order.invoice)}" class="p-1 rounded-md hover:bg-slate-100 transition-all duration-200 group/copy"
                  title="${state.copied === order.invoice ? "Copied!" : "Copy " + esc(state.label) + " Id"}">
                  ${state.copied === order.invoice ? icon("check", "w-3.5 h-3.5 text-emerald-500") : icon("copy", "w-3.5 h-3.5 text-slate-400 group-hover/copy:text-slate-600")}
                </button>
                <div class="relative inline-block" data-insight="${esc(order._id)}">
                  <button class="p-1 rounded-md hover:bg-purple-50 transition-all duration-200" aria-label="Smart insights">${icon("zap", "w-3.5 h-3.5 text-purple-600")}</button>
                </div>
              </div>
              ${countPills}
            </div>
          </div>
        </td>

        <td class="${WM.tableCell} py-4 px-6 w-[140px]">
          <div class="flex flex-col gap-0.5">
            <span class="text-sm text-slate-700">${fmtDate(order.createdAt)}</span>
            <span class="text-xs text-slate-500">${fmtTime(order.createdAt)}</span>
          </div>
        </td>

        <td class="${WM.tableCell} py-4 px-6 w-[180px]">
          <span class="text-sm font-medium text-slate-900">${esc(cust.name)}</span>
          <div class="text-xs text-slate-500">${esc(cust.contact)}</div>
        </td>

        <td class="${WM.tableCell} py-4 px-6 w-[130px]">
          <div class="flex flex-col items-start">
            <span class="text-sm font-semibold text-slate-900">${state.currency}${getNumberTwo(orderTotal(order))}</span>
          </div>
        </td>

        <td class="${WM.tableCell} py-4 px-6 w-[160px]">
          <select data-rowstatus="${esc(order._id)}" ${isDisabled ? "disabled" : ""}
            class="w-full min-w-[140px] px-2.5 py-1.5 text-sm font-medium rounded-md border transition-all duration-200 ${
              !isDisabled
                ? "border-slate-300 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                : "border-slate-200 bg-slate-50 cursor-not-allowed text-slate-400"
            }">
            ${opts.map((s) => `<option value="${esc(s)}" ${s === order.status ? "selected" : ""}>${esc(toTitleCaseFun(s))}</option>`).join("")}
          </select>
        </td>

        ${
          showAllocation
            ? `<td class="${WM.tableCell} py-4 px-6 w-[200px]">${renderAllocationCell(order)}</td>`
            : ""
        }

        ${
          showInvoice
            ? `<td class="${WM.tableCell} py-4 px-6 w-[120px]">
                 <div class="flex items-center justify-center">
                   <button data-invoice="${esc(order._id)}"
                     class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                     title="Invoice">
                     ${icon("fileText", "", 14)}<span>Invoice</span>${icon("chevronDown", "flex-shrink-0", 12)}
                   </button>
                 </div>
               </td>`
            : ""
        }

        <td class="${WM.tableCell} py-4 px-6 w-[180px]">
          <div class="flex items-center justify-center gap-1">
            <button ${isEditAllowed ? "" : "disabled"} data-editorder="${esc(order._id)}"
              class="group/btn relative p-2 rounded-md transition-all duration-200 ${isEditAllowed ? "hover:bg-slate-100" : "opacity-40 cursor-not-allowed"}"
              data-tip="${isEditAllowed ? "Edit " + esc(state.label) : "Cannot edit " + esc(order.status) + " " + esc(state.label.toLowerCase())}">
              ${/* Live: IconStyle={{ fontSize: "16px", color: isEditAllowed ? "#475569" : "#94a3b8" }} */ ""}
              ${icon("edit", "", 16, `color:${isEditAllowed ? "#475569" : "#94a3b8"}`)}
            </button>
            <a href="#" onclick="return false" data-timeline="${esc(order._id)}" class="group/btn relative p-2 rounded-md hover:bg-slate-100 transition-all duration-200" data-tip="View Timeline">
              ${icon("clock", "", 16, "color:#475569")}
            </a>
            <a href="#" onclick="return false" data-view="${esc(order._id)}" class="group/btn relative p-2 rounded-md hover:bg-slate-100 transition-all duration-200" data-tip="View ${esc(state.label)}">
              ${icon("eye", "", 16, "color:#475569")}
            </a>
          </div>
        </td>
      </tr>
      ${
        isExpanded
          ? `<tr class="hidden bg-gray-50 md:table-row"><td colspan="${5 + (showAllocation ? 1 : 0) + (showInvoice ? 1 : 0) + 1}" class="${WM.tableCell} p-0">${renderExpandedStub(order)}</td></tr>`
          : ""
      }`;
  }

  /* ── Orders.jsx — page ────────────────────────────────────────────────── */
  function renderPage() {
    const label = esc(state.label);
    const list = filteredOrders();
    const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
    const page = Math.min(state.page, Math.max(1, totalPages));
    const rows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const showInvoice = !!(state.seed.appProp && state.seed.appProp.canShowInvoiceAction);
    const ff = features();
    const showAllocation = ff.allocationStatus === true;

    const controls = `
      <div class="mobile-orders-controls sticky isolate shrink-0 bg-gray-50 [background-clip:border-box] [backface-visibility:hidden] [overflow-anchor:none] before:pointer-events-none before:absolute before:inset-x-0 before:-top-[2px] before:h-[3px] before:bg-gray-50 after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-[2px] after:h-[3px] after:bg-gray-50 dark:bg-gray-900 dark:before:bg-gray-900 dark:after:bg-gray-900 md:static md:bg-transparent md:[backface-visibility:visible] md:before:hidden md:after:hidden z-20 pb-2 md:z-auto md:pb-0" style="top:0">
        <div class="tab tab-enter max-md:!animate-none max-md:!transform-none max-md:!opacity-100">
          <div class="${WM.card} mb-0 min-w-0 overflow-hidden !bg-gray-50 shadow-xs dark:!bg-gray-900 md:mb-2 md:!bg-transparent dark:md:!bg-gray-800 lg:mb-5">
            <div class="${WM.cardBody} !p-0 !pt-0 lg:!pt-6">
              <div class="pb-0 lg:pb-3 mb-2 lg:mb-5 md:pb-0 grid lg:gap-6 xl:gap-6 xl:flex">
                <div class="flex-grow-0 sm:flex-grow md:flex-grow lg:flex-grow xl:flex-grow"></div>
                <div class="hidden md:flex flex-col sm:flex-row gap-2 lg:gap-4">
                  ${
                    ff.createDelivery
                      ? `<div class="flex-grow-0 md:flex-grow lg:flex-grow xl:flex-grow">
                           <button data-createdelivery
                             class="w-full font-medium py-1 px-2 justify-center items-center border !border-green-200 flex hover:!bg-green-50 rounded-md h-10 text-sm bg-green-50 text-green-700">
                             ${icon("truck", "mr-2 mt-[1px]", 14)}Create Delivery
                           </button>
                         </div>`
                      : ""
                  }
                  <div class="flex-grow-0 md:flex-grow lg:flex-grow xl:flex-grow">
                    <button data-createorder
                      class="w-full font-medium py-1 px-2 justify-center items-center border !border-gray-200 flex hover:!bg-gray-100 rounded-md h-10 text-sm bg-white text-black">
                      <span class="mr-2">${icon("plus", "")}</span>Create ${label}
                    </button>
                  </div>
                  ${
                    ff.orderForecast
                      ? `<div class="flex-grow-0 md:flex-grow lg:flex-grow xl:flex-grow">
                           <button data-forecast
                             class="w-full font-medium py-1 px-2 justify-center items-center border !border-gray-200 flex hover:!bg-gray-100 rounded-md h-10 text-sm bg-white text-black">
                             ${icon("trendingUp", "mr-2 mt-[1px]", 14)}Forecast Orders
                           </button>
                         </div>`
                      : ""
                  }
                  ${
                    ff.bulkProxyOrder
                      ? `<div class="flex-grow-0 md:flex-grow lg:flex-grow xl:flex-grow">${renderBulkOrderDropdown()}</div>`
                      : ""
                  }
                  ${
                    ff.demandReport
                      ? `<div class="flex-grow-0 md:flex-grow lg:flex-grow xl:flex-grow">
                           <button data-demand
                             class="w-full font-medium py-1 px-2 justify-center items-center border !border-gray-200 flex hover:!bg-gray-100 rounded-md h-10 text-sm bg-white text-black">
                             ${icon("fileText", "mr-2 mt-[1px]", 14)}Generate Demand
                           </button>
                         </div>`
                      : ""
                  }
                  <div class="flex-grow-0 md:flex-grow lg:flex-grow xl:flex-grow">
                    <button data-reminders
                      class="w-full font-medium py-1 px-2 justify-center items-center border !border-amber-200 flex hover:!bg-amber-50 rounded-md h-10 text-sm bg-amber-50 text-amber-700"
                      title="View customers who need follow-up calls to place orders">
                      ${icon("bell", "w-4 h-4 mr-2")}
                      <span class="hidden sm:inline">Follow-up Reminders</span>
                      <span class="sm:hidden">Reminders</span>
                    </button>
                  </div>
                  ${
                    ff.downloadAllOrders
                      ? `<div class="flex-grow-0 md:flex-grow lg:flex-grow xl:flex-grow">
                           <button data-export ${state.exporting ? "disabled" : ""} class="${WM.buttonPrimary} w-full rounded-md h-10${state.exporting ? " opacity-70 cursor-wait" : ""}">
                             ${state.exporting ? `<span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>Downloading…` : `<span class="mr-2">${icon("download", "")}</span>Download All ${label}`}
                           </button>
                         </div>`
                      : ""
                  }
                </div>
              </div>

              ${window.MockShell.renderMobileMenuLabel(state.seed, "/orders", state.label)}

              <form class="mt-2 grid grid-cols-2 gap-2 pb-2 md:flex md:pb-0 lg:mt-4 lg:gap-6 xl:gap-6" data-noop-form>
                <div class="col-span-2 flex-grow-0 md:col-span-1 md:flex-grow lg:flex-grow xl:flex-grow">
                  <div class="relative flex-1">
                    ${icon("search", "absolute left-1 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4")}
                    <input data-search type="search" name="search" value="${esc(state.searchInput)}" class="${WM.input} pl-9"
                      placeholder="Search by customer name, phone, or ${esc(state.label.toLowerCase())} number" />
                  </div>
                </div>

                <div class="h-10 min-w-0 flex-grow-0 md:w-[192px]">${renderStatusSelect()}</div>

                <div class="relative min-w-0 flex-grow-0 md:mb-2 md:w-[280px]">
                  <div class="relative h-10" data-dateroot>
                    ${icon("calendar", "pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400")}
                    <input readonly data-datetoggle value="${esc(
                      state.startDate || state.endDate
                        ? `${fmtPickerDate(state.startDate)} - ${fmtPickerDate(state.endDate)}`
                        : ""
                    )}" placeholder="Filter by date range"
                      class="box-border h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white py-2 pl-8 pr-7 text-xs leading-5 transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 md:pl-10 md:pr-10 md:text-sm" />
                    ${
                      state.startDate || state.endDate
                        ? `<button type="button" data-dateclear class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">${icon("x", "", 16)}</button>`
                        : ""
                    }
                    ${
                      state.dateOpen
                        ? `<div class="absolute right-0 z-30 mt-1 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                             <div class="flex items-center gap-2">
                               <label class="flex items-center gap-1.5 text-xs text-slate-600 font-medium">From
                                 <input type="date" data-daterange="start" value="${toInputVal(state.startDate)}" ${state.endDate ? `max="${toInputVal(state.endDate)}"` : ""}
                                   class="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                               </label>
                               <span class="text-slate-300 text-sm">→</span>
                               <label class="flex items-center gap-1.5 text-xs text-slate-600 font-medium">To
                                 <input type="date" data-daterange="end" value="${toInputVal(state.endDate)}" ${state.startDate ? `min="${toInputVal(state.startDate)}"` : ""}
                                   class="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                               </label>
                             </div>
                           </div>`
                        : ""
                    }
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>`;

    const methodTotals =
      (state.seed.methodTotals || []).length > 0
        ? `<div class="${WM.card} min-w-0 shadow-xs overflow-hidden bg-white dark:bg-gray-800 rounded-t-lg rounded-0 mb-4">
             <div class="${WM.cardBody}">
               <div class="flex gap-1">
                 ${(state.seed.methodTotals || [])
                   .map(
                     (el) =>
                       `<div class="dark:text-gray-300"><span class="font-medium"> ${esc(el.method)}</span> : <span class="font-semibold mr-2">${state.currency}${getNumber(el.total)}</span></div>`
                   )
                   .join("")}
               </div>
             </div>
           </div>`
        : "";

    let body;
    if (state.loading) {
      body = renderTableLoading();
    } else if (rows.length > 0) {
      const th = (w, text, center) =>
        `<td class="${WM.tableCell} py-3.5 px-6 w-[${w}]${center ? " text-center" : ""}"><span class="text-xs font-semibold text-slate-600 uppercase tracking-wide">${text}</span></td>`;
      body = `
        <div class="overflow-visible">
          <div class="${WM.tableContainer} mb-8 overflow-visible border-0 bg-transparent shadow-none md:overflow-hidden md:rounded-lg md:border md:border-slate-200 md:bg-white md:shadow-sm">
            <div class="w-full overflow-x-auto">
              <table class="block w-full table-auto md:table">
                <thead class="${WM.tableHeader} hidden bg-slate-50 border-b-2 border-slate-200 md:table-header-group">
                  <tr>
                    ${th("200px", label + " ID")}
                    ${th("140px", "Date")}
                    ${th("180px", "Customer")}
                    ${th("130px", "Amount")}
                    ${th("160px", "Status")}
                    ${showAllocation ? th("200px", "Allocation Status") : ""}
                    ${showInvoice ? th("120px", "Invoice") : ""}
                    ${th("160px", "Actions", true)}
                  </tr>
                </thead>
                <tbody class="${WM.tableBody} block w-full md:table-row-group">
                  ${rows
                    .map(
                      (o) => `
                    <tr class="block w-full border-0 bg-transparent pb-3 md:hidden"><td class="${WM.tableCell} block w-full p-0">${renderMobileCard(o)}</td></tr>
                    ${renderDesktopRow(o)}`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            <div class="${WM.tableFooter}">${renderPagination(page, totalPages, PAGE_SIZE, list.length)}</div>
          </div>
        </div>`;
    } else {
      body = renderNotFound(`but no ${state.label.toLowerCase()} are available at the moment.`);
    }

    /* ── Mobile sticky footer (Orders.jsx) ──────────────────────────────── */
    const mobileFooter = `
      <div class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
        <div class="flex w-full items-center justify-around px-1 py-2 pb-[env(safe-area-inset-bottom,8px)]">
          <div class="relative flex min-w-0 flex-1 justify-center">
                   ${
                     ff.bulkProxyOrder && state.mobileCreateMenuOpen
                       ? `<div class="fixed inset-0 z-10" data-mobilemenuscrim></div>
                          <div class="absolute bottom-full left-2 z-20 mb-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-left shadow-xl">
                            <button type="button" data-createorder class="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-emerald-50">
                              ${icon("plus", "h-4 w-4 text-emerald-600")}Create ${label}
                            </button>
                            <button type="button" data-bulkmode="STANDARD" class="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-emerald-50">
                              ${icon("fileSpreadsheet", "h-4 w-4 text-emerald-600")}Bulk ${label}
                            </button>
                            <button type="button" data-bulkmode="ROUTE" class="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-emerald-50">
                              ${icon("map", "h-4 w-4 text-emerald-600")}Route ${label}
                            </button>
                          </div>`
                       : ""
                   }
                   <button data-mobilecreate class="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1 text-emerald-700 hover:bg-emerald-50" title="Create ${label}">
                     <span class="flex items-center rounded-lg bg-emerald-600 px-2.5 py-1 text-white">
                       ${icon("plus", "h-5 w-5")}
                       ${ff.bulkProxyOrder ? icon("chevronUp", `h-3 w-3 transition-transform ${state.mobileCreateMenuOpen ? "rotate-180" : ""}`) : ""}
                     </span>
                     <span class="max-w-full truncate text-[10px] font-medium"> ${label}</span>
                   </button>
                 </div>
                 ${ff.createDelivery ? `<div class="h-8 w-px bg-gray-200"></div>
                   <button data-createdelivery class="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 rounded-lg text-green-600 hover:bg-green-50" title="Create Delivery">
                     ${icon("truck", "w-5 h-5")}<span class="max-w-full truncate text-[10px] font-medium">Delivery</span>
                   </button>` : ""}
                 ${ff.demandReport ? `<div class="h-8 w-px bg-gray-200"></div>
                   <button data-demand class="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 rounded-lg text-gray-600 hover:bg-gray-100" title="Demand Report">
                     ${icon("fileText", "w-5 h-5")}<span class="max-w-full truncate text-[10px] font-medium">Demand</span>
                   </button>` : ""}
                 <div class="h-8 w-px bg-gray-200"></div>
                 <button data-reminders class="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 rounded-lg text-amber-600 hover:bg-amber-50" title="Follow-up Reminders">
                   ${icon("bell", "w-5 h-5")}<span class="max-w-full truncate text-[10px] font-medium">Reminders</span>
                 </button>
                 ${ff.downloadAllOrders ? `<div class="h-8 w-px bg-gray-200"></div>
                   <button data-export ${state.exporting ? "disabled" : ""} class="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40" title="Download All ${label}">
                     ${icon("download", "w-5 h-5")}<span class="max-w-full truncate text-[10px] font-medium">Download</span>
                   </button>` : ""}
        </div>
      </div>
      <div class="md:hidden h-20"></div>`;

    return controls + methodTotals + body + mobileFooter + renderInsightCard();
  }

  /* ── Render + wire ────────────────────────────────────────────────────── */
  function render() {
    outlet.innerHTML = renderPage();
    wire();
  }

  function wire() {
    const $ = (s) => outlet.querySelector(s);
    const $$ = (s) => outlet.querySelectorAll(s);

    $$("[data-noop-form]").forEach((f) => f.addEventListener("submit", (e) => e.preventDefault()));

    const search = $("[data-search]");
    if (search)
      search.addEventListener("input", (e) => {
        const v = e.target.value;
        state.searchInput = v;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.search = v.trim();
          state.page = 1;
          render();
          const el = outlet.querySelector("[data-search]");
          if (el) {
            el.focus();
            try { el.setSelectionRange(el.value.length, el.value.length); } catch (err) {}
          }
        }, 400);
      });

    const st = $("[data-statustoggle]");
    if (st)
      st.addEventListener("click", (e) => {
        e.stopPropagation();
        state.statusOpen = !state.statusOpen;
        render();
      });
    $$("[data-statusopt]").forEach((o) =>
      o.addEventListener("click", (e) => {
        e.stopPropagation();
        state.status = o.getAttribute("data-statusopt");
        state.statusOpen = false;
        state.page = 1;
        render();
      })
    );
    const sc = $("[data-statusclear]");
    if (sc)
      sc.addEventListener("click", (e) => {
        e.stopPropagation();
        state.status = "";
        state.statusOpen = false;
        state.page = 1;
        render();
      });

    const dt = $("[data-datetoggle]");
    if (dt)
      dt.addEventListener("click", (e) => {
        e.stopPropagation();
        state.dateOpen = !state.dateOpen;
        render();
      });
    $$("[data-daterange]").forEach((el) =>
      el.addEventListener("change", () => {
        const which = el.getAttribute("data-daterange");
        if (which === "start") state.startDate = fromInputVal(el.value);
        else state.endDate = fromInputVal(el.value);
        state.page = 1;
        render();
      })
    );
    const dc = $("[data-dateclear]");
    if (dc)
      dc.addEventListener("click", (e) => {
        e.stopPropagation();
        state.startDate = null;
        state.endDate = null;
        state.page = 1;
        render();
      });

    document.addEventListener("mousedown", (e) => {
      let changed = false;
      const sr = outlet.querySelector("[data-statusroot]");
      if (state.statusOpen && sr && !sr.contains(e.target)) { state.statusOpen = false; changed = true; }
      const dr = outlet.querySelector("[data-dateroot]");
      if (state.dateOpen && dr && !dr.contains(e.target)) { state.dateOpen = false; changed = true; }
      const br = outlet.querySelector("[data-bulkroot]");
      if (state.bulkMenuOpen && br && !br.contains(e.target)) { state.bulkMenuOpen = false; changed = true; }
      if (changed) render();
    });

    $$("[data-page]").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.disabled) return;
        const p = Number(b.getAttribute("data-page"));
        if (!p) return;
        state.page = p;
        render();
      })
    );

    $$("[data-toggle]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.getAttribute("data-toggle");
        const i = state.expanded.indexOf(id);
        if (i > -1) state.expanded.splice(i, 1);
        else state.expanded.push(id);
        render();
      })
    );

    $$("[data-copy]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const v = b.getAttribute("data-copy");
        if (navigator.clipboard) navigator.clipboard.writeText(v).catch(() => {});
        state.copied = v;
        render();
        setTimeout(() => { state.copied = ""; render(); }, 2000);
      })
    );

    // Status change — live this fires handleUdateInventory and refetches.
    $$("[data-rowstatus]").forEach((sel) =>
      sel.addEventListener("change", () => {
        const order = state.orders.find((o) => o._id === sel.getAttribute("data-rowstatus"));
        if (order) order.status = sel.value;
        render();
      })
    );

    const ex = $("[data-export]");
    if (ex)
      ex.addEventListener("click", () => {
        // Live: exportFromJSON(...) writes a CSV of every order.
        state.exporting = true;
        render();
        setTimeout(() => {
          state.exporting = false;
          render();
          const list = filteredOrders();
          const head = ["Invoice", "Date", "Customer", "Contact", "Status", "Amount"];
          const csv = [head.join(",")]
            .concat(
              list.map((o) => {
                const c = customerFor(o);
                return [o.invoice, fmtDate(o.createdAt), `"${c.name}"`, c.contact, o.status, orderTotal(o).toFixed(2)].join(",");
              })
            )
            .join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "sales-orders.csv";
          a.click();
          URL.revokeObjectURL(a.href);
        }, 700);
      });

    // Actions that leave this module's boundary.
    const boundary = (msg) => (e) => { e.preventDefault(); e.stopPropagation(); window.alert(msg); };
    $$("[data-view]").forEach((b) => b.addEventListener("click", boundary(
      "Live this opens /order/<invoice>/<status> — the order detail screen.\n\nOutside this discovery round's scope (Phase 1 is the list).")));
    $$("[data-timeline]").forEach((b) => b.addEventListener("click", boundary(
      "Live this opens /order-timeline/<invoice>/<status>.\n\nOutside this discovery round's scope.")));
    $$("[data-editorder]").forEach((b) => b.addEventListener("click", (e) => {
      if (b.disabled) return;
      boundary("Live this opens OrderEditDrawer (636 lines).\n\nDeferred to a later phase — see addendum divergence D5.")(e);
    }));
    $$("[data-invoice]").forEach((b) => b.addEventListener("click", boundary(
      "Live this prints a thermal invoice via InvoicePrintButton.\n\nNot ported in this round.")));


    /* ── Action bar / mobile footer ─────────────────────────────────────── */
    // Destinations that are their own phase. Discovery names them rather than
    // pretending; each is a real drawer/modal in the live app.
    const deferred = (name, lines, note) => (e) => {
      e.preventDefault(); e.stopPropagation();
      window.alert(`Live this opens ${name} (${lines} lines).\n\n${note}`);
    };
    $$("[data-createdelivery]").forEach((b) => b.addEventListener("click",
      deferred("CreateDeliveryModal", "1,256", "Deferred to a later phase — see addendum divergence D5.")));
    $$("[data-createorder]").forEach((b) => b.addEventListener("click", (e) => {
      state.mobileCreateMenuOpen = false;
      deferred("CreateOrderDrawer", "4,832", "The single largest component on this route — it warrants its own scope conversation before anyone starts it.")(e);
    }));
    $$("[data-forecast]").forEach((b) => b.addEventListener("click",
      deferred("OrderForecastDrawer", "587", "Deferred to the reporting phase.")));
    $$("[data-demand]").forEach((b) => b.addEventListener("click",
      deferred("DemandReportDrawer", "928", "Deferred to the reporting phase.")));
    $$("[data-reminders]").forEach((b) => b.addEventListener("click",
      deferred("OrderReminderModal", "1,243", "Follow-up call list. Deferred to a later phase.")));
    $$("[data-bulkmode]").forEach((b) => b.addEventListener("click", (e) => {
      const mode = b.getAttribute("data-bulkmode");
      state.bulkMenuOpen = false; state.mobileCreateMenuOpen = false;
      deferred("BulkOrderDrawer", "617", `Mode: ${mode}. Deferred to the creation phase.`)(e);
    }));

    const bt = $("[data-bulktoggle]");
    if (bt) bt.addEventListener("click", (e) => { e.stopPropagation(); state.bulkMenuOpen = !state.bulkMenuOpen; render(); });

    const mc = $("[data-mobilecreate]");
    if (mc) mc.addEventListener("click", (e) => {
      e.stopPropagation();
      if (features().bulkProxyOrder) { state.mobileCreateMenuOpen = !state.mobileCreateMenuOpen; render(); }
      else deferred("CreateOrderDrawer", "4,832", "Its own phase.")(e);
    });
    const scrim = $("[data-mobilemenuscrim]");
    if (scrim) scrim.addEventListener("click", () => { state.mobileCreateMenuOpen = false; render(); });

    /* ── Smart Insights hover card ──────────────────────────────────────── */
    let insightTimer = null;
    $$("[data-insight]").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        clearTimeout(insightTimer);
        const r = el.getBoundingClientRect();
        const cardW = 320, cardH = 400;
        let top = r.bottom + 8, left = r.left;
        if (top + cardH > window.innerHeight) {
          top = r.top - cardH - 8;
          if (top < 16) top = Math.max(16, window.innerHeight - cardH - 16);
        }
        if (left + cardW > window.innerWidth - 16) left = window.innerWidth - cardW - 16;
        left = Math.max(16, left);
        state.insightPos = { top, left };
        state.insightFor = el.getAttribute("data-insight");
        render();
      });
      el.addEventListener("mouseleave", () => {
        insightTimer = setTimeout(() => { state.insightFor = null; render(); }, 150);
      });
    });
    const card = outlet.querySelector("[data-insightcard]");
    if (card) {
      card.addEventListener("mouseenter", () => clearTimeout(insightTimer));
      card.addEventListener("mouseleave", () => { state.insightFor = null; render(); });
    }

    // Tooltips (react-tooltip stand-in)
    $$("[data-tip]").forEach((el) => {
      let tip;
      el.addEventListener("mouseenter", () => {
        tip = document.createElement("div");
        tip.className = "mock-tooltip";
        tip.style.background = "#334155";
        tip.textContent = el.getAttribute("data-tip");
        document.body.appendChild(tip);
        const r = el.getBoundingClientRect();
        tip.style.left = Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2) + "px";
        tip.style.top = r.top - tip.offsetHeight - 6 + "px";
        requestAnimationFrame(() => tip.classList.add("is-visible"));
      });
      el.addEventListener("mouseleave", () => { if (tip) tip.remove(); tip = null; });
    });
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */
  async function mount(opts) {
    opts = opts || {};
    const seed = await window.MockShell.loadSeed(opts.seedPath || "../../seed-data/seed.json");
    state.seed = seed;
    state.currency = (seed.appProp && seed.appProp.currency) || "₹";
    state.orders = opts.dataset === "empty" ? [] : materialiseOrders(seed);
    state.loading = !!opts.loading;
    if (opts.status) state.status = opts.status;
    if (opts.expand) state.expanded = [opts.expand];
    if (opts.search) { state.search = opts.search; state.searchInput = opts.search; }
    if (opts.dateOpen) state.dateOpen = true;
    if (opts.insightFor) {
      state.insightFor = opts.insightFor;
      state.insightPos = { top: 210, left: 340 };
    }

    const menu = (seed.storefrontMenus || []).find((m) => m.component === "orders");
    state.label = (menu && menu.name) || "Orders";

    outlet = window.MockShell.renderShell(document.getElementById("root"), seed, {
      activePath: "/orders",
      pageTitle: state.label,
      // /orders is in Layout's hasPageOwnedMobileHeader list — the page renders
      // its own MobileMenuLabel inside the sticky controls surface.
      pageOwnedMobileHeader: true,
    });

    render();
  }

  window.MockOrders = { mount };
})();
