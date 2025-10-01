"use client";

type Props = {
  link?: string | null;
  seller?: string | null;
  productName: string;
  className?: string;
  label?: string; // defaults to "Report"
};

export default function ReportButton({
  link,
  seller,
  productName,
  className,
  label = "Report",
}: Props) {
  async function onClick() {
    const cleanLink = (link ?? "").trim();
    if (!cleanLink) {
      alert("No link to report for this retailer.");
      return;
    }
    const reason = window.prompt("What's wrong with this link/price? (optional)") || "";

    try {
      const res = await fetch("/api/report-wrong-by-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link: cleanLink,
          reason,
          context: { sellerName: seller ?? "", productName },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("Thanks! We’ll recheck that link shortly.");
    } catch (e) {
      console.error(e);
      alert("Sorry — failed to submit the report.");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "px-2 py-1 text-xs rounded-md border border-transparent " +
        "text-slate-600 hover:text-slate-900 hover:border-slate-300 " +
        "dark:text-slate-300 dark:hover:text-white dark:hover:border-slate-600"
      }
    >
      {label}
    </button>
  );
}
