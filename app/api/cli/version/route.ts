import { NextResponse } from "next/server";

// Bump this when a new Go CLI release is tagged and built.
const LATEST_VERSION = "0.1.7";

export async function GET() {
  return NextResponse.json({ version: LATEST_VERSION });
}
