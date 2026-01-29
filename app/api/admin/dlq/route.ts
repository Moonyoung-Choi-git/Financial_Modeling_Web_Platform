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
    createdAt: {
      gte: from,
      lte: to,
    },
  };

  if (provider) {
    where.rawArchive = { is: { provider } };
  }

  if (status) {
    if (status === "retry_due") {
      where.nextRetryAt = { lte: now };
    } else if (status === "retry_scheduled") {
      where.nextRetryAt = { gt: now };
    } else if (status === "no_retry") {
      where.nextRetryAt = null;
    } else {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }
  }

  try {
    const [total, records] = await prisma.$transaction([
      prisma.dlqRecord.count({ where }),
      prisma.dlqRecord.findMany({
        where,
        include: {
          rawArchive: true,
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);

    const items = records.map((record) => ({
      id: record.id,
      task_id: record.taskId,
      raw_archive_id: record.rawArchiveId,
      provider: record.rawArchive?.provider || null,
      error_type: record.errorType,
      error_message: record.errorMessage,
      stack_trace: record.stackTrace,
      retry_count: record.retryCount,
      next_retry_at: record.nextRetryAt,
      created_at: record.createdAt,
      status: deriveStatus(record.nextRetryAt),
    }));

    return NextResponse.json({
      items,
      meta: { total, limit, offset },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
