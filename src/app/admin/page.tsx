// src/app/admin/page.tsx
import { recomputeRemaining } from "@/lib/sql";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const count = await recomputeRemaining();

  return <AdminClient initialCount={count} />;
}
