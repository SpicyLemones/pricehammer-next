// src/app/lib/job-runner.ts
//
// Minimal in-memory background job registry for long-running admin work
// (price refreshes, bulk validation). The point: an HTTP caller can start
// a job, get an id back immediately, and poll for the result, instead of
// holding one request open long enough for Render's proxy to cut it off.
//
// Deliberately not durable. Jobs live in process memory, so a redeploy
// mid-run loses the job record (the caller sees "not found" and retries
// the whole job). That trade-off is fine for idempotent maintenance work.

export type JobStatus = "running" | "done" | "failed";

export type Job = {
  id: string;
  name: string;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  result?: unknown;
  error?: string;
};

// Survive dev-mode module reloads; in prod this is just a module singleton.
const g = globalThis as unknown as { __phJobs?: Map<string, Job> };
const jobs: Map<string, Job> = (g.__phJobs ??= new Map());

const MAX_JOBS = 50;

function prune() {
  if (jobs.size <= MAX_JOBS) return;
  const finished = [...jobs.values()]
    .filter((j) => j.status !== "running")
    .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  for (const j of finished.slice(0, jobs.size - MAX_JOBS)) jobs.delete(j.id);
}

export function startJob(name: string, work: () => Promise<unknown>): Job {
  const id = `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = { id, name, status: "running", startedAt: new Date().toISOString() };
  jobs.set(id, job);
  prune();
  work()
    .then((result) => {
      job.status = "done";
      job.result = result;
      job.finishedAt = new Date().toISOString();
    })
    .catch((e: unknown) => {
      job.status = "failed";
      job.error = e instanceof Error ? e.message : String(e);
      job.finishedAt = new Date().toISOString();
    });
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(name?: string): Job[] {
  const all = [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return name ? all.filter((j) => j.name === name) : all;
}

/* ---------------- HTTP helpers ----------------
   Let any long-running POST route opt into background mode with
   `?async=1` (or `{"async": true}` in a JSON body). The caller gets a job id
   back right away (HTTP 202) and polls `GET <same route>?job=<id>`. Without
   the flag the route behaves exactly as before (synchronous).            */

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

export async function runMaybeAsync(
  req: Request,
  name: string,
  handler: (req: Request) => Promise<Response>,
): Promise<Response> {
  const url = new URL(req.url);
  // buffer the body so the handler can read it after we've already responded
  const bodyText = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  const replay = () =>
    new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText === "" ? undefined : bodyText,
    });

  let wantAsync = truthy(url.searchParams.get("async"));
  if (!wantAsync && bodyText && (req.headers.get("content-type") || "").includes("application/json")) {
    try {
      wantAsync = truthy((JSON.parse(bodyText) as { async?: unknown })?.async);
    } catch {}
  }
  if (!wantAsync) return handler(replay());

  const job = startJob(name, async () => {
    const res = await handler(replay());
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  });
  console.log(`[jobs] QUEUED ${job.id}`);
  return Response.json({ ok: true, jobId: job.id, status: job.status }, { status: 202 });
}

/** GET ?job=<id> handler body shared by every async-capable route. */
export function jobStatusResponse(req: Request): Response {
  const id = new URL(req.url).searchParams.get("job");
  if (!id) return Response.json({ ok: false, error: "missing ?job=<id>" }, { status: 400 });
  const job = getJob(id);
  if (!job) {
    // a redeploy wipes the in-memory registry: "not found" also means "lost, run it again"
    return Response.json(
      { ok: false, error: "job not found (finished long ago, or lost to a redeploy)" },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, job });
}
