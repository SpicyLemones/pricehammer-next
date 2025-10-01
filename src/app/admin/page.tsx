// src/app/admin/page.tsx
import { all } from "@/lib/sql";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // remaining unchecked = count of rows from select/count_unsorted.sql
  const unchecked = await all("select/count_unsorted");
  const count = unchecked.length;

  return <AdminClient initialCount={count} />;
}
