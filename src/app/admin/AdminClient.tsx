"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, LogOut } from "lucide-react";

type RunState = "idle" | "working" | "done" | "error";

function useAction() {
  const [state, setState] = useState<RunState>("idle");
  const [message, setMessage] = useState<string>("");

  async function runJSON(url: string, body?: Record<string, any>) {
    try {
      setState("working");
      setMessage("");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

      let summary = "";
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try {
          const data = await res.json();
          summary = data?.message || data?.status || JSON.stringify(data);
        } catch {}
      }
      if (!res.ok) {
        setState("error");
        setMessage(summary || `Request failed (${res.status})`);
        return;
      }
      setState("done");
      setMessage(summary || "Done.");
    } catch (e: any) {
      setState("error");
      setMessage(e?.message || "Network error");
    }
  }

  // Post as FormData for routes that read `formData()`
  async function runForm(url: string, fields: Record<string, string>) {
    try {
      setState("working");
      setMessage("");
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      const res = await fetch(url, { method: "POST", body: fd });

      if (!res.ok) {
        setState("error");
        setMessage(`Request failed (${res.status})`);
        return;
      }
      setState("done");
      setMessage("Done.");
    } catch (e: any) {
      setState("error");
      setMessage(e?.message || "Network error");
    }
  }

  return { state, message, runJSON, runForm, reset: () => (setState("idle"), setMessage("")) };
}

function Status({ state, message }: { state: RunState; message: string }) {
  if (state === "idle") return null;
  return (
    <div
      className={`mt-2 text-sm flex items-center gap-2 ${
        state === "working"
          ? "text-slate-600 dark:text-slate-300"
          : state === "done"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
      aria-live="polite"
      role="status"
    >
      {state === "working" && <Loader2 className="h-4 w-4 animate-spin" />}
      {state === "done" && <CheckCircle2 className="h-4 w-4" />}
      {state === "error" && <AlertCircle className="h-4 w-4" />}
      <span>{state === "working" ? "Working…" : message}</span>
    </div>
  );
}

export default function AdminClient({ initialCount }: { initialCount: number }) {
  // inputs
  const [autoSeller, setAutoSeller] = useState("");
  const [autoProduct, setAutoProduct] = useState("");
  const [refreshSeller, setRefreshSeller] = useState("");
  const [seedSeller, setSeedSeller] = useState("");
  const [seedProduct, setSeedProduct] = useState("");
  const [reportSeller, setReportSeller] = useState("");
  const [reportProduct, setReportProduct] = useState("");
  const [reportReason, setReportReason] = useState("");

  // action hooks (one per card)
  const autoValidate = useAction();
  const refreshPrices = useAction();
  const seedSellerAct = useAction();
  const seedProductAct = useAction();
  const importSellersAct = useAction();
  const importProductsAct = useAction();
  const reportWrongAct = useAction();

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border rounded-xl p-4 shadow-sm bg-white text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">
      <h3 className="font-semibold mb-2 text-slate-900 dark:text-slate-100">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl py-8 px-4 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Admin Panel</h1>
        <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
          Remaining unchecked prices: <b>{initialCount}</b>
          <button
            onClick={() => location.reload()}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition"
            title="Reload count"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
          <button
            onClick={async () => {
              await fetch("/api/admin/login", { method: "DELETE" });
              location.href = "/admin/login";
            }}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/" className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 active:scale-95 transition">
          Home
        </Link>
        <Link href="/tinder" className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 active:scale-95 transition">
          Tinder
        </Link>
        {/* keep your GET link that writes Data.ts on the server */}
        <a
          href="/api/export"
          className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 active:scale-95 transition"
        >
          Export Data.ts
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Auto-Validate (first hit) */}
        <Card title="Auto-Validate (first hit)">
          <div className="flex flex-col gap-2">
            <input
              name="seller"
              placeholder="Seller ID (optional)"
              className="border rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={autoSeller}
              onChange={(e) => setAutoSeller(e.target.value.replace(/[^\d]/g, ""))}
            />
            <input
              name="product"
              placeholder="Product ID (optional)"
              className="border rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={autoProduct}
              onChange={(e) => setAutoProduct(e.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              className="rounded bg-emerald-600 text-white px-3 py-2 hover:bg-emerald-700 active:scale-95 transition disabled:opacity-50"
              disabled={autoValidate.state === "working"}
              onClick={() =>
                autoValidate.runJSON("/api/auto-validate", {
                  seller: autoSeller ? Number(autoSeller) : undefined,
                  product: autoProduct ? Number(autoProduct) : undefined,
                })
              }
            >
              {autoValidate.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running…
                </span>
              ) : (
                "Run Auto-Validate"
              )}
            </button>
            <Status state={autoValidate.state} message={autoValidate.message} />
          </div>
        </Card>

        {/* Refresh Prices */}
        <Card title="Refresh Prices (validated only)">
          <div className="flex flex-col gap-2">
            <input
              name="seller"
              placeholder="Seller ID (optional)"
              className="border rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={refreshSeller}
              onChange={(e) => setRefreshSeller(e.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              className="rounded bg-sky-600 text-white px-3 py-2 hover:bg-sky-700 active:scale-95 transition disabled:opacity-50"
              disabled={refreshPrices.state === "working"}
              onClick={() =>
                refreshPrices.runJSON("/api/refresh-prices", {
                  seller: refreshSeller ? Number(refreshSeller) : undefined,
                })
              }
            >
              {refreshPrices.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing…
                </span>
              ) : (
                "Refresh"
              )}
            </button>
            <Status state={refreshPrices.state} message={refreshPrices.message} />
          </div>
        </Card>

        {/* Seed Rows for New Seller */}
        <Card title="Seed Rows for New Seller">
          <div className="flex flex-col gap-2">
            <input
              name="seller"
              placeholder="Seller ID"
              required
              className="border rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={seedSeller}
              onChange={(e) => setSeedSeller(e.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              className="rounded bg-violet-700 text-white px-3 py-2 hover:bg-violet-800 active:scale-95 transition disabled:opacity-50"
              disabled={seedSellerAct.state === "working" || !seedSeller}
              onClick={() => seedSellerAct.runForm("/api/seed/new-seller", { seller: seedSeller })}
            >
              {seedSellerAct.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Seeding…
                </span>
              ) : (
                "Seed Seller Rows"
              )}
            </button>
            <Status state={seedSellerAct.state} message={seedSellerAct.message} />
          </div>
        </Card>

        {/* Seed Rows for New Product */}
        <Card title="Seed Rows for New Product">
          <div className="flex flex-col gap-2">
            <input
              name="product"
              placeholder="Product ID"
              required
              className="border rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={seedProduct}
              onChange={(e) => setSeedProduct(e.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              className="rounded bg-violet-700 text-white px-3 py-2 hover:bg-violet-800 active:scale-95 transition disabled:opacity-50"
              disabled={seedProductAct.state === "working" || !seedProduct}
              onClick={() => seedProductAct.runForm("/api/seed/new-product", { product: seedProduct })}
            >
              {seedProductAct.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Seeding…
                </span>
              ) : (
                "Seed Product Rows"
              )}
            </button>
            <Status state={seedProductAct.state} message={seedProductAct.message} />
          </div>
        </Card>

        {/* Import Sellers (JSON) */}
        <Card title="Import Sellers (JSON)">
          <div className="flex gap-2">
            <button
              className="rounded bg-teal-700 text-white px-3 py-2 w-full hover:bg-teal-800 active:scale-95 transition disabled:opacity-50"
              disabled={importSellersAct.state === "working"}
              onClick={() => importSellersAct.runJSON("/api/admin/import-sellers-from-json")}
            >
              {importSellersAct.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </span>
              ) : (
                "Import & Seed New Sellers"
              )}
            </button>
          </div>
          <Status state={importSellersAct.state} message={importSellersAct.message} />
        </Card>

        {/* Import Products (JSON) */}
        <Card title="Import Products (JSON)">
          <div className="flex gap-2">
            <button
              className="rounded bg-teal-700 text-white px-3 py-2 w-full hover:bg-teal-800 active:scale-95 transition disabled:opacity-50"
              disabled={importProductsAct.state === "working"}
              onClick={() => importProductsAct.runJSON("/api/admin/import-products-from-json")}
            >
              {importProductsAct.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </span>
              ) : (
                "Import & Seed New Products"
              )}
            </button>
          </div>
          <Status state={importProductsAct.state} message={importProductsAct.message} />
        </Card>

        {/* Report Wrong Pair */}
        <Card title="Report Wrong Pair">
          <div className="flex flex-col gap-2">
            <input
              name="seller"
              placeholder="Seller ID"
              required
              className="border rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={reportSeller}
              onChange={(e) => setReportSeller(e.target.value.replace(/[^\d]/g, ""))}
            />
            <input
              name="product"
              placeholder="Product ID"
              required
              className="border rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={reportProduct}
              onChange={(e) => setReportProduct(e.target.value.replace(/[^\d]/g, ""))}
            />
            <textarea
              name="reason"
              rows={3}
              placeholder="Reason (optional)"
              className="border rounded px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            />
            <button
              className="rounded bg-rose-600 text-white px-3 py-2 hover:bg-rose-700 active:scale-95 transition disabled:opacity-50"
              disabled={reportWrongAct.state === "working" || !reportSeller || !reportProduct}
              onClick={() =>
                reportWrongAct.runForm("/api/report-wrong", {
                  seller: reportSeller,
                  product: reportProduct,
                  reason: reportReason,
                })
              }
            >
              {reportWrongAct.state === "working" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </span>
              ) : (
                "Submit Report"
              )}
            </button>
            <div className="mt-2 text-sm">
              Or{" "}
              <a href="/report-by-link" className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                report by link
              </a>.
            </div>
            <Status state={reportWrongAct.state} message={reportWrongAct.message} />
          </div>
        </Card>
      </div>

      <ReportsPanel />
      <AuditPanel />
    </div>
  );
}

type ReportGroup = {
  link: string;
  reportCount: number;
  latest: string;
  productName: string | null;
  sellerName: string | null;
  productId: number | null;
  reasons: string | null;
};

function ReportsPanel() {
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyLink, setBusyLink] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/admin/reports", { cache: "no-store" });
      const j = await res.json();
      setGroups(Array.isArray(j.groups) ? j.groups : []);
    } catch {}
    setLoaded(true);
  };
  useEffect(() => {
    load();
  }, []);

  const act = async (link: string, action: string) => {
    setBusyLink(link);
    try {
      await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link, action }),
      });
      await load();
    } finally {
      setBusyLink("");
    }
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        User reports {loaded ? `(${groups.length} open)` : ""}
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Sorted by report count. Reports never change data by themselves — every action here is
        yours.
      </p>
      {loaded && groups.length === 0 && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No open reports.</p>
      )}
      <div className="mt-3 divide-y divide-slate-200 border-t border-slate-300 dark:divide-slate-800 dark:border-slate-700">
        {groups.map((g) => (
          <div key={g.link} className="py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="inline-block min-w-[2rem] border border-slate-400 px-1.5 text-center text-sm font-bold tabular-nums dark:border-slate-500">
                {g.reportCount}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {g.productName ?? "(unknown product)"}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                at {g.sellerName ?? "(unknown store)"}
              </span>
              <span className="text-xs text-slate-400">latest {g.latest}</span>
            </div>
            <div className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
              <a className="underline" href={g.link} target="_blank" rel="noopener noreferrer">
                {g.link}
              </a>
            </div>
            {g.reasons && (
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{g.reasons}</div>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {g.productId != null && (
                <Link href={`/product/${g.productId}`} className="underline">
                  view product
                </Link>
              )}
              <button
                disabled={busyLink === g.link}
                onClick={() => act(g.link, "unvalidate")}
                className="rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700 disabled:opacity-50"
                title="Hide this price and send it back to the review queue"
              >
                pull price for re-check
              </button>
              <button
                disabled={busyLink === g.link}
                onClick={() => act(g.link, "resolve")}
                className="rounded bg-emerald-700 px-2 py-0.5 text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                resolve
              </button>
              <button
                disabled={busyLink === g.link}
                onClick={() => act(g.link, "dismiss")}
                className="rounded bg-slate-500 px-2 py-0.5 text-white hover:bg-slate-600 disabled:opacity-50"
              >
                dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditPanel() {
  const [events, setEvents] = useState<
    { at: string; actor: string; action: string; detail: string | null }[]
  >([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/audit", { cache: "no-store" });
        const j = await res.json();
        setEvents(Array.isArray(j.events) ? j.events : []);
      } catch {}
    })();
  }, []);
  if (!events.length) return null;
  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Recent admin activity</h2>
      <div className="mt-3 divide-y divide-slate-200 border-t border-slate-300 text-sm dark:divide-slate-800 dark:border-slate-700">
        {events.map((e, i) => (
          <div key={i} className="flex flex-wrap gap-2 py-1.5">
            <span className="tabular-nums text-slate-400">{e.at}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{e.action}</span>
            <span className="break-all text-slate-500 dark:text-slate-400">{e.detail ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
