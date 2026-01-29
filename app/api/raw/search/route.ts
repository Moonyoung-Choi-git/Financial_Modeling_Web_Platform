import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim();
  const yearParam = searchParams.get("year")?.trim();
  const reportCode = searchParams.get("report_code")?.trim();
  const provider = searchParams.get("provider")?.trim();
  const limitParam = searchParams.get("limit")?.trim();
  const offsetParam = searchParams.get("offset")?.trim();

  if (!ticker && !yearParam && !reportCode && !provider) {
    return NextResponse.json(
      {
        error:
          "At least one query param is required: ticker, year, report_code, provider",
      },
      { status: 400 }
    );
  }

  let fiscalYear: number | undefined;
  if (yearParam) {
    const parsedYear = Number.parseInt(yearParam, 10);
    if (!Number.isFinite(parsedYear)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }
    fiscalYear = parsedYear;
  }

  const limit = Math.min(
    Math.max(Number.parseInt(limitParam || "50", 10) || 50, 1),
    200
  );
  const offset = Math.max(Number.parseInt(offsetParam || "0", 10) || 0, 0);

  const where: any = {};
  if (ticker) where.ticker = ticker;
  if (fiscalYear !== undefined) where.fiscalYear = fiscalYear;
  if (reportCode) where.reportCode = reportCode;
  if (provider) where.rawArchive = { is: { provider } };

  try {
    const [total, rows] = await prisma.$transaction([
      prisma.sourceRawMetaIndex.count({ where }),
      prisma.sourceRawMetaIndex.findMany({
        where,
        include: {
          rawArchive: {
            include: { integrityLog: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);

    const items = rows.map((row) => ({
      raw_archive_id: row.rawArchiveId,
      ticker: row.ticker,
      corp_name: row.corpName,
      report_code: row.reportCode,
      fiscal_year: row.fiscalYear,
      fiscal_quarter: row.fiscalQuarter,
      document_type: row.documentType,
      provider: row.rawArchive.provider,
      received_at: row.rawArchive.receivedAt,
      hash_sha256: row.rawArchive.integrityLog?.sha256 || null,
    }));

    return NextResponse.json({
      items,
      meta: { total, limit, offset },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
