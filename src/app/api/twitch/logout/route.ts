import { NextResponse } from "next/server";
import { clearSession } from "@/app/lib/twitch-auth";

export async function GET(request: Request) {
  await clearSession();
  
  // Redirect to home or login page
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/twitch`);
}