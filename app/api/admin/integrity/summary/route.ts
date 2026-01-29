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

  const whereJobs = {
    createdAt: {
      gte: from,
      lte: to,
    },
  } as const;

  const whereDlq = {
    createdAt: {
      gte: from,
      lte: to,
    },
  } as const;

  const whereRaw = {
    receivedAt: {
      gte: from,
      lte: to,
    },
  } as const;

  const whereIntegrity = {
    computedAt: {
      gte: from,
      lte: to,
    },
  } as const;

  try {
    const [
      totalJobs,
      statusGroups,
      providerGroups,
      dlqCount,
      rawCount,
      integrityCount,
    ] = await prisma.$transaction([
      prisma.fetchJob.count({ where: whereJobs }),
      prisma.fetchJob.groupBy({
        by: ["status"],
        where: whereJobs,
        _count: { _all: true },
      }),
      prisma.fetchJob.groupBy({
        by: ["provider", "status"],
        where: whereJobs,
        _count: { _all: true },
      }),
      prisma.dlqRecord.count({ where: whereDlq }),
      prisma.sourceRawArchive.count({ where: whereRaw }),
      prisma.dataIntegrityLog.count({ where: whereIntegrity }),
    ]);

    const statusCounts = statusGroups.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {}
    );

    const providerMap = new Map<
      string,
      { provider: string; total: number; status: Record<string, number> }
    >();

    for (const row of providerGroups) {
      const existing =
        providerMap.get(row.provider) ||
        ({ provider: row.provider, total: 0, status: {} } as const);

      const count = row._count._all;
      existing.total += count;
      existing.status[row.status] = (existing.status[row.status] || 0) + count;
      providerMap.set(row.provider, existing);
    }

    const success = statusCounts.SUCCESS || 0;
    const successRate = totalJobs > 0 ? success / totalJobs : null;
    const integrityCoverage =
      rawCount > 0 ? integrityCount / rawCount : null;

    return NextResponse.json({
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        jobs: totalJobs,
        dlq: dlqCount,
        raw_archives: rawCount,
        integrity_logs: integrityCount,
        success_rate: successRate,
        integrity_coverage: integrityCoverage,
      },
      status_counts: statusCounts,
      provider_breakdown: Array.from(providerMap.values()).sort((a, b) =>
        a.provider.localeCompare(b.provider)
      ),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
