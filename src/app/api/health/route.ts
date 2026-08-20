import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma/client";
import { pingRedis } from "@/lib/redis/client";

/**
 * GET /api/health
 * Liveness + dependency checks used by orchestrators and Docker healthchecks.
 * Never returns tenant-scoped data.
 */
export async function GET(): Promise<NextResponse> {
  let db = "down";
  let redis = "down";

  try {
    await prismaUnscoped.$queryRaw`SELECT 1`;
    db = "up";
  } catch {
    // keep "down"
  }

  try {
    redis = (await pingRedis()) ? "up" : "down";
  } catch {
    // keep "down"
  }

  const healthy = db === "up" && redis === "up";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: { db, redis },
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}