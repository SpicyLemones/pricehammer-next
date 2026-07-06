// src/app/lib/audit.ts
// Append-only audit trail of admin actions. Never throws — auditing must not
// break the action being audited.
import { query } from "@/lib/sql";

export async function logAudit(
  actor: string,
  action: string,
  detail: unknown,
): Promise<void> {
  try {
    await query("run", "create/admin_audit");
    await query(
      "run",
      `INSERT INTO admin_audit (actor, action, detail) VALUES (?, ?, ?)`,
      [actor || "admin", action, detail == null ? null : JSON.stringify(detail).slice(0, 2000)],
    );
  } catch (e) {
    console.warn("[audit] failed:", e instanceof Error ? e.message : e);
  }
}
