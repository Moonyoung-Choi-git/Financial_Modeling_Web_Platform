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

function deriveStatus(nextRetryAt: Date | null) {
  if (!nextRetryAt) return "no_retry";
  const now = new Date();
  return nextRetryAt <= now ? "retry_due" : "retry_scheduled";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider")?.trim();
  const status = searchParams.get("status")?.trim();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const limitParam = searchParams.get("limit")?.trim();
  const offsetParam = searchParams.get("offset")?.trim();

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

  const limit = Math.min(
    Math.max(Number.parseInt(limitParam || "50", 10) || 50, 1),
    200
  );
  const offset = Math.max(Number.parseInt(offsetParam || "0", 10) || 0, 0);

  const where: any = {
    requestedAt: {
      gte: from,
      lte: to,
    },
  };

  if (provider) {
    const normalized = provider.toUpperCase();
    if (normalized !== "OPENDART" && normalized !== "DART") {
      return NextResponse.json({ items: [], meta: { total: 0, limit, offset } });
    }
  }

  if (status) {
    if (status === "retry_due") {
      return NextResponse.json({ items: [], meta: { total: 0, limit, offset } });
    } else if (status === "retry_scheduled") {
      return NextResponse.json({ items: [], meta: { total: 0, limit, offset } });
    } else if (status === "no_retry") {
      // All records are treated as no-retry for legacy DLQ view.
    } else {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }
  }

  try {
    const [total, records] = await prisma.$transaction([
      prisma.rawDartApiCall.count({
        where: {
          ...where,
          OR: [
            { dartStatus: { not: "000" } },
            { dartStatus: null },
            { httpStatus: { gte: 400 } },
          ],
        },
      }),
      prisma.rawDartApiCall.findMany({
        where: {
          ...where,
          OR: [
            { dartStatus: { not: "000" } },
            { dartStatus: null },
            { httpStatus: { gte: 400 } },
          ],
        },
        orderBy: { requestedAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);

    const items = records.map((record) => {
      const errorType =
        record.dartStatus || (record.httpStatus ? `HTTP_${record.httpStatus}` : "UNKNOWN");
      const errorMessage =
        record.dartMessage ||
        (record.httpStatus ? `HTTP ${record.httpStatus}` : "Unknown error");

      return {
        id: record.id,
        task_id: record.jobId || record.id,
        raw_archive_id: record.id,
        provider: "OPENDART",
        error_type: errorType,
        error_message: errorMessage,
        stack_trace: null,
        retry_count: record.retryCount || 0,
        next_retry_at: null,
        created_at: record.requestedAt,
        status: deriveStatus(null),
      };
    });

    return NextResponse.json({
      items,
      meta: { total, limit, offset },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
