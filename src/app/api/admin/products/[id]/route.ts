import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { isAdminRequest } from "@/lib/auth";
import { loadManualProduct, updateManualProduct } from "@/lib/manual-products";

const ALLOWED_GAMES = new Set(["warhammer40k", "ageofsigmar", "universal"]);

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest()) {
    return error("Unauthorized", 403);
  }

  const id = params?.id;
  if (!id) {
    return error("Missing product id");
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return error("Invalid JSON body");
  }

  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  if (!name) {
    return error("Name is required");
  }

  const rawGame = typeof payload?.game === "string" ? payload.game : "";
  if (!ALLOWED_GAMES.has(rawGame)) {
    return error("Game must be one of warhammer40k, ageofsigmar, or universal");
  }

  const faction = typeof payload?.faction === "string" ? payload.faction.trim() : "";
  const category = typeof payload?.category === "string" ? payload.category.trim() : "";

  const rawPoints = payload?.points;
  let points: number | null = null;
  if (rawPoints !== null && rawPoints !== undefined && rawPoints !== "") {
    const parsed = Number(rawPoints);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return error("Points must be a positive number");
    }
    points = Math.round(parsed);
  }

  const existing = await loadManualProduct(id);
  if (!existing) {
    return error(`Product ${id} not found`, 404);
  }

  const updated = await updateManualProduct(id, {
    name,
    game: rawGame,
    faction,
    category,
    points,
  });

  revalidatePath(`/product/${id}`);
  revalidatePath("/");
  revalidatePath("/warhammer-prices");
  revalidatePath("/api/lookup-data");

  return NextResponse.json({ product: updated });
}
