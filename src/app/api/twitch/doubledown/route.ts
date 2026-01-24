import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

const fallbackOptions = [
  "1 hour time out",
  "8 million seconds time out",
  "Write an apology paragraph in chat",
  "3 year discord ban",
  "1 week discord ban",
  "1 day discord ban",
  "Donate 1 sub",
  "Donate 10 subs",
  "Donate 100 gold in a game of the streamer's choice",
  "Donate 10 gold in a game of the streamer's choice",
  "Donate 1 gold in a game of the streamer's choice",
  "The mods decide your fate",
  "Flip a coin. Heads = ban, Tails = 10 minute timeout",
  "Ask a magic 8 ball live on stream for your punishment",
  "Beat the streamer in typeracer.",
  "If you are not subbed, immediate ban, otherwise, SAVED",
  "Start a Poll on Twitch for your punishment, voted for by chat",
  "Ask another streamer that is live to vouch for you, otherwise its a BAN",
  "SAVED"
];

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "doubledown.txt");
    const fileContents = await fs.readFile(filePath, "utf8");
    const options = fileContents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return NextResponse.json({ options: options.length > 0 ? options : fallbackOptions });
  } catch (error) {
    console.error("Failed to load double down options", error);
    return NextResponse.json({ options: fallbackOptions, error: "fallback_used" });
  }
}
