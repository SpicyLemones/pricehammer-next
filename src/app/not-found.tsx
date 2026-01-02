// src/app/components/NotFound.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto py-16 text-center">
      <h1 className="text-2xl font-semibold mb-2">Page not found</h1>
      <p className="text-slate-600 mb-6">We couldn’t find that page.</p>
      <Link
        href="/"
        className="inline-block rounded-md bg-slate-900 text-white px-4 py-2 hover:bg-slate-800"
      >
        Go home
      </Link>
    </div>
  );
}
