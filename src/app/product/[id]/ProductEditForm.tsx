"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface ProductEditFormProps {
  productId: string;
  initialValues: {
    game: string;
    faction: string;
    category: string;
    points: number | null;
  };
  gameCategories: Record<string, string[]>;
}

type StatusState =
  | { type: "idle" }
  | { type: "saving" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

const normalizeInitialValues = (values: ProductEditFormProps["initialValues"]) => ({
  game: values.game ?? "",
  faction: values.faction ?? "",
  category: values.category ?? "",
  points:
    values.points !== null && values.points !== undefined && Number.isFinite(values.points)
      ? String(values.points)
      : "",
});

export default function ProductEditForm({ productId, initialValues, gameCategories }: ProductEditFormProps) {
  const router = useRouter();
  const normalizedInitial = useMemo(() => normalizeInitialValues(initialValues), [initialValues]);

  const [baseValues, setBaseValues] = useState(normalizedInitial);
  const [game, setGame] = useState(normalizedInitial.game);
  const [faction, setFaction] = useState(normalizedInitial.faction);
  const [category, setCategory] = useState(normalizedInitial.category);
  const [points, setPoints] = useState(normalizedInitial.points);
  const [status, setStatus] = useState<StatusState>({ type: "idle" });

  useEffect(() => {
    setBaseValues(normalizedInitial);
    setGame(normalizedInitial.game);
    setFaction(normalizedInitial.faction);
    setCategory(normalizedInitial.category);
    setPoints(normalizedInitial.points);
  }, [normalizedInitial]);

  const gameOptions = useMemo(
    () => Object.keys(gameCategories || {}).sort((a, b) => a.localeCompare(b)),
    [gameCategories],
  );
  const categoryOptions = useMemo(() => {
    const key = game.trim();
    const options = gameCategories?.[key] ?? [];
    if (!Array.isArray(options)) return [];
    return Array.from(new Set(options.map((entry) => String(entry)))).sort((a, b) => a.localeCompare(b));
  }, [game, gameCategories]);

  const isDirty =
    game !== baseValues.game ||
    faction !== baseValues.faction ||
    category !== baseValues.category ||
    points !== baseValues.points;

  const gameDatalistId = `game-options-${productId}`;
  const categoryDatalistId = `category-options-${productId}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.type === "saving") return;

    setStatus({ type: "saving" });

    const payload = {
      game,
      faction,
      category,
      points,
    };

    try {
      const res = await fetch(`/api/admin/products/${productId}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Failed to save changes.";
        try {
          const data = await res.json();
          if (typeof data?.error === "string" && data.error.trim()) {
            message = data.error.trim();
          }
        } catch {}
        setStatus({ type: "error", message });
        return;
      }

      let updated = normalizedInitial;
      try {
        const data = await res.json();
        if (data?.product) {
          const next = normalizeInitialValues({
            game: typeof data.product.game === "string" ? data.product.game : "",
            faction: typeof data.product.faction === "string" ? data.product.faction : "",
            category: typeof data.product.category === "string" ? data.product.category : "",
            points:
              typeof data.product.points === "number" && Number.isFinite(data.product.points)
                ? data.product.points
                : null,
          });
          updated = next;
        }
      } catch {}

      setBaseValues(updated);
      setGame(updated.game);
      setFaction(updated.faction);
      setCategory(updated.category);
      setPoints(updated.points);
      setStatus({ type: "success", message: "Saved changes." });
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message ? error.message : "Failed to save changes.";
      setStatus({ type: "error", message });
    }
  }

  function handleReset() {
    setGame(baseValues.game);
    setFaction(baseValues.faction);
    setCategory(baseValues.category);
    setPoints(baseValues.points);
    setStatus({ type: "idle" });
  }

  const isSaving = status.type === "saving";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Edit metadata</h2>
        <button
          type="button"
          className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-60"
          onClick={handleReset}
          disabled={!isDirty || isSaving}
        >
          Reset
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Leave a field blank to clear it. Suggestions are provided where available.
      </p>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-1">
          <label htmlFor={`game-${productId}`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Game
          </label>
          <input
            id={`game-${productId}`}
            name="game"
            list={gameDatalistId}
            placeholder="e.g. warhammer40k"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            value={game}
            onChange={(event) => setGame(event.target.value)}
            autoComplete="off"
          />
          <datalist id={gameDatalistId}>
            {gameOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div className="grid gap-1">
          <label htmlFor={`faction-${productId}`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Faction
          </label>
          <input
            id={`faction-${productId}`}
            name="faction"
            placeholder="Enter faction"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            value={faction}
            onChange={(event) => setFaction(event.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="grid gap-1">
          <label htmlFor={`category-${productId}`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Category
          </label>
          <input
            id={`category-${productId}`}
            name="category"
            list={categoryDatalistId}
            placeholder="Enter category"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            autoComplete="off"
          />
          <datalist id={categoryDatalistId}>
            {categoryOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        <div className="grid gap-1">
          <label htmlFor={`points-${productId}`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Points
          </label>
          <input
            id={`points-${productId}`}
            name="points"
            type="number"
            min={0}
            step="any"
            placeholder="Leave blank to clear"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
          />
        </div>

        <div className="flex items-center gap-2" aria-live="polite">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
          {status.type === "success" && (
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{status.message}</span>
          )}
          {status.type === "error" && (
            <span className="text-sm font-medium text-red-600 dark:text-red-400">{status.message}</span>
          )}
        </div>
      </form>
    </div>
  );
}
