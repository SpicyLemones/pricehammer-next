// src/app/lib/chattergrounds-shop.ts
//
// The overlay marketplace: chatters spend toadcoins on cosmetics that change
// how they appear on the streamer's overlay. Driven entirely from chat:
//   !shop            (overlay shows the catalogue)
//   !buy <item>      (buy by id or name; auto-equips)
//   !equip <item>    (switch between owned items of a kind)
// Purchases are transactional against chattergrounds_stats.toadcoins.

import { promises as fs } from "node:fs";
import path from "node:path";
import { run, get, all } from "@/app/lib/sql";

export type ShopItemKind = "nameColor" | "bubble" | "badge" | "levelfx";
export type ShopItem = {
  id: string;
  kind: ShopItemKind;
  name: string;
  price: number;
  value: string;
};

export type ChatterStyle = {
  nameColor?: string;
  bubble?: string;
  badge?: string;
  levelfx?: string;
};

let itemsCache: ShopItem[] | null = null;
export async function loadShopItems(): Promise<ShopItem[]> {
  if (itemsCache) return itemsCache;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "overlay-shop.json"), "utf8");
    const parsed = JSON.parse(raw);
    itemsCache = Array.isArray(parsed?.items) ? (parsed.items as ShopItem[]) : [];
  } catch {
    itemsCache = [];
  }
  return itemsCache;
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await run(`
        CREATE TABLE IF NOT EXISTS chattergrounds_unlocks (
          broadcaster_id TEXT NOT NULL,
          chatter_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          equipped INTEGER NOT NULL DEFAULT 0,
          acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (broadcaster_id, chatter_id, item_id)
        )
      `);
    })();
  }
  return schemaReady;
}

/** The chatter's currently equipped cosmetics, for overlay rendering. */
export async function getChatterStyle(
  broadcasterId: string,
  chatterId: string,
): Promise<ChatterStyle | undefined> {
  await ensureSchema();
  const rows = (await all(
    `SELECT item_id FROM chattergrounds_unlocks
     WHERE broadcaster_id = ? AND chatter_id = ? AND equipped = 1`,
    [broadcasterId, chatterId],
  )) as { item_id: string }[];
  if (!rows.length) return undefined;

  const items = await loadShopItems();
  const byId = new Map(items.map((i) => [i.id, i]));
  const style: ChatterStyle = {};
  for (const r of rows) {
    const item = byId.get(r.item_id);
    if (item) style[item.kind] = item.value;
  }
  return Object.keys(style).length ? style : undefined;
}

export type ShopCommandResult =
  | { handled: false }
  | {
      handled: true;
      announce: string; // shown on the overlay
      ok: boolean;
    };

function findItem(items: ShopItem[], query: string): ShopItem | undefined {
  const q = query.trim().toLowerCase();
  return (
    items.find((i) => i.id.toLowerCase() === q) ??
    items.find((i) => i.name.toLowerCase() === q) ??
    items.find((i) => i.name.toLowerCase().includes(q))
  );
}

async function equipItem(broadcasterId: string, chatterId: string, item: ShopItem) {
  const items = await loadShopItems();
  const sameKindIds = items.filter((i) => i.kind === item.kind).map((i) => i.id);
  const placeholders = sameKindIds.map(() => "?").join(",");
  await run(
    `UPDATE chattergrounds_unlocks SET equipped = 0
     WHERE broadcaster_id = ? AND chatter_id = ? AND item_id IN (${placeholders})`,
    [broadcasterId, chatterId, ...sameKindIds],
  );
  await run(
    `UPDATE chattergrounds_unlocks SET equipped = 1
     WHERE broadcaster_id = ? AND chatter_id = ? AND item_id = ?`,
    [broadcasterId, chatterId, item.id],
  );
}

/**
 * Handle !shop / !buy / !equip commands from chat.
 * Returns an announcement string for the overlay when handled.
 */
export async function handleShopCommand(
  broadcasterId: string,
  chatterId: string,
  chatterName: string,
  message: string,
): Promise<ShopCommandResult> {
  const m = message.trim();
  if (!m.startsWith("!")) return { handled: false };

  const [cmd, ...rest] = m.slice(1).split(/\s+/);
  const argument = rest.join(" ");
  const command = (cmd || "").toLowerCase();
  if (!["shop", "buy", "equip"].includes(command)) return { handled: false };

  await ensureSchema();
  const items = await loadShopItems();

  if (command === "shop") {
    const list = items.map((i) => `${i.name} (${i.price})`).join(" · ");
    return { handled: true, ok: true, announce: `🛒 Shop: ${list} — use !buy <name>` };
  }

  if (!argument) {
    return { handled: true, ok: false, announce: `${chatterName}: use !${command} <item name>` };
  }

  const item = findItem(items, argument);
  if (!item) {
    return { handled: true, ok: false, announce: `${chatterName}: no shop item matches "${argument}"` };
  }

  const owned = await get(
    `SELECT 1 AS x FROM chattergrounds_unlocks
     WHERE broadcaster_id = ? AND chatter_id = ? AND item_id = ?`,
    [broadcasterId, chatterId, item.id],
  );

  if (command === "equip") {
    if (!owned) {
      return { handled: true, ok: false, announce: `${chatterName}: you don't own ${item.name} yet — !buy it first` };
    }
    await equipItem(broadcasterId, chatterId, item);
    return { handled: true, ok: true, announce: `✨ ${chatterName} equipped ${item.name}` };
  }

  // !buy
  if (owned) {
    await equipItem(broadcasterId, chatterId, item);
    return { handled: true, ok: true, announce: `${chatterName} already owns ${item.name} — equipped it` };
  }

  const stats = (await get(
    `SELECT toadcoins FROM chattergrounds_stats WHERE broadcaster_id = ? AND chatter_id = ?`,
    [broadcasterId, chatterId],
  )) as { toadcoins: number } | undefined;
  const balance = Number(stats?.toadcoins ?? 0);

  if (balance < item.price) {
    return {
      handled: true,
      ok: false,
      announce: `${chatterName}: ${item.name} costs ${item.price} toadcoins — you have ${balance}`,
    };
  }

  // deduct-only-if-still-affordable makes the debit safe under concurrency
  const debit = (await run(
    `UPDATE chattergrounds_stats SET toadcoins = toadcoins - ?
     WHERE broadcaster_id = ? AND chatter_id = ? AND toadcoins >= ?`,
    [item.price, broadcasterId, chatterId, item.price],
  )) as { changes?: number };
  if (!debit?.changes) {
    return { handled: true, ok: false, announce: `${chatterName}: purchase failed — balance changed` };
  }

  await run(
    `INSERT INTO chattergrounds_unlocks (broadcaster_id, chatter_id, item_id, equipped)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(broadcaster_id, chatter_id, item_id) DO NOTHING`,
    [broadcasterId, chatterId, item.id],
  );
  await equipItem(broadcasterId, chatterId, item);

  return {
    handled: true,
    ok: true,
    announce: `🛍️ ${chatterName} bought ${item.name} for ${item.price} toadcoins!`,
  };
}
