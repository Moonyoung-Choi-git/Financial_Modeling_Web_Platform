import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

function parseDateBoundary(
  value: string | null,
  fallback: Date,
  isEnd: boolean
): Date | null {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const date = new Date(
    `${trimmed}T${isEnd ? "23:59:59.999" : "00:00:00.000"}`
  );
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 7);
  defaultFrom.setHours(0, 0, 0, 0);
  const defaultTo = new Date(now);
  defaultTo.setHours(23, 59, 59, 999);

  const from = parseDateBoundary(fromParam, defaultFrom, false);
  const to = parseDateBoundary(toParam, defaultTo, true);

  if (!from || !to) {
    return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
  }

  if (from > to) {
    return NextResponse.json(
      { error: "from must be earlier than to" },
      { status: 400 }
    );
  }

  const whereApiByRequest = {
    requestedAt: {
      gte: from,
      lte: to,
    },
  } as const;

  try {
    const [
      totalCalls,
      statusGroups,
      errorCount,
      rawJsonCount,
      rawBinaryCount,
      integrityCount,
    ] = await prisma.$transaction([
      prisma.rawDartApiCall.count({ where: whereApiByRequest }),
      prisma.rawDartApiCall.groupBy({
        by: ["dartStatus"],
        where: whereApiByRequest,
        _count: { _all: true },
      }),
      prisma.rawDartApiCall.count({
        where: {
          ...whereApiByRequest,
          OR: [
            { dartStatus: { not: "000" } },
            { dartStatus: null },
            { httpStatus: { gte: 400 } },
          ],
        },
      }),
      prisma.rawDartPayloadJson.count({
        where: { apiCall: { requestedAt: { gte: from, lte: to } } },
      }),
      prisma.rawDartPayloadBinary.count({
        where: { apiCall: { requestedAt: { gte: from, lte: to } } },
      }),
      prisma.rawDartApiCall.count({
        where: { ...whereApiByRequest, payloadHash: { not: null } },
      }),
    ]);

    const statusCounts = statusGroups.reduce<Record<string, number>>(
      (acc, row) => {
        const key = row.dartStatus ?? "UNKNOWN";
        acc[key] = row._count._all;
        return acc;
      },
      {}
    );

    const success = statusCounts["000"] || 0;
    const successRate = totalCalls > 0 ? success / totalCalls : null;
    const integrityCoverage =
      rawJsonCount + rawBinaryCount > 0
        ? integrityCount / (rawJsonCount + rawBinaryCount)
        : null;

    return NextResponse.json({
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        jobs: totalCalls,
        dlq: errorCount,
        raw_archives: rawJsonCount + rawBinaryCount,
        integrity_logs: integrityCount,
        success_rate: successRate,
        integrity_coverage: integrityCoverage,
      },
      status_counts: statusCounts,
      provider_breakdown: [
        {
          provider: "OPENDART",
          total: totalCalls,
          status: statusCounts,
        },
      ],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
