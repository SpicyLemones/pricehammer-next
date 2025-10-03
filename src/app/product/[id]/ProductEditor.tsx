"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GAME_OPTIONS: { value: "warhammer40k" | "ageofsigmar" | "universal"; label: string }[] = [
  { value: "warhammer40k", label: "Warhammer 40,000 (40K)" },
  { value: "ageofsigmar", label: "Age of Sigmar" },
  { value: "universal", label: "Universal" },
];

interface ProductEditorProps {
  productId: string;
  initialData: {
    name: string;
    game: "warhammer40k" | "ageofsigmar" | "universal";
    faction: string;
    category: string;
    points: number | null;
  };
}

export function ProductEditor({ productId, initialData }: ProductEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialData.name);
  type GameValue = (typeof GAME_OPTIONS)[number]["value"];
  const [game, setGame] = useState<GameValue>(initialData.game);
  const [faction, setFaction] = useState(initialData.faction);
  const [category, setCategory] = useState(initialData.category);
  const [points, setPoints] = useState(initialData.points?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(initialData.name);
    setGame(initialData.game);
    setFaction(initialData.faction);
    setCategory(initialData.category);
    setPoints(initialData.points?.toString() ?? "");
  }, [initialData.name, initialData.game, initialData.faction, initialData.category, initialData.points]);

  const toggle = () => {
    setOpen((prev) => !prev);
    setMessage(null);
    setError(null);
  };

  const reset = () => {
    setName(initialData.name);
    setGame(initialData.game);
    setFaction(initialData.faction);
    setCategory(initialData.category);
    setPoints(initialData.points?.toString() ?? "");
    setMessage(null);
    setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          game,
          faction,
          category,
          points: points.trim() === "" ? null : Number(points),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to save changes");
      }

      setMessage("Saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={toggle} type="button">
        {open ? "Close editor" : "Edit"}
      </Button>

      {open && (
        <form
          onSubmit={submit}
          className="absolute right-0 mt-2 w-[320px] space-y-3 rounded-md border border-slate-200 bg-white p-4 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900 z-20"
        >
          <div className="space-y-1">
            <label
              htmlFor="product-name"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Name
            </label>
            <Input
              id="product-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="product-game"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Game
            </label>
            <Select value={game} onValueChange={(value) => setGame(value as GameValue)}>
              <SelectTrigger id="product-game">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="product-faction"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Faction
            </label>
            <Input
              id="product-faction"
              value={faction}
              onChange={(event) => setFaction(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="product-category"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Category
            </label>
            <Input
              id="product-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="product-points"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Points
            </label>
            <Input
              id="product-points"
              type="number"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              min={0}
            />
          </div>

          {message && <p className="text-sm text-emerald-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={saving}>
              Reset
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
