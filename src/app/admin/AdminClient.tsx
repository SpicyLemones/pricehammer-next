"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

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
          ? "text-slate-600"
          : state === "done"
          ? "text-emerald-700"
          : "text-red-600"
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
    <div className="border rounded-xl p-4 shadow-sm bg-white">
      <h3 className="font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl py-8 px-4 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <div className="text-sm text-slate-600 flex items-center gap-2">
          Remaining unchecked prices: <b>{initialCount}</b>
          <button
            onClick={() => location.reload()}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 transition"
            title="Reload count"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/" className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 active:scale-95 transition">
          Home
        </Link>
        <Link href="/tinder" className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 active:scale-95 transition">
          Tinder
        </Link>
        {/* keep your GET link that writes Data.ts on the server */}
        <a
          href="/api/export"
          className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800 active:scale-95 transition"
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
              className="border rounded px-3 py-2"
              value={autoSeller}
              onChange={(e) => setAutoSeller(e.target.value.replace(/[^\d]/g, ""))}
            />
            <input
              name="product"
              placeholder="Product ID (optional)"
              className="border rounded px-3 py-2"
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
              className="border rounded px-3 py-2"
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
              className="border rounded px-3 py-2"
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
              className="border rounded px-3 py-2"
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
              className="border rounded px-3 py-2"
              value={reportSeller}
              onChange={(e) => setReportSeller(e.target.value.replace(/[^\d]/g, ""))}
            />
            <input
              name="product"
              placeholder="Product ID"
              required
              className="border rounded px-3 py-2"
              value={reportProduct}
              onChange={(e) => setReportProduct(e.target.value.replace(/[^\d]/g, ""))}
            />
            <textarea
              name="reason"
              rows={3}
              placeholder="Reason (optional)"
              className="border rounded px-3 py-2"
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
              <a href="/report-by-link" className="text-blue-600 underline hover:text-blue-800">
                report by link
              </a>.
            </div>
            <Status state={reportWrongAct.state} message={reportWrongAct.message} />
          </div>
        </Card>
      </div>
    </div>
  );
}
