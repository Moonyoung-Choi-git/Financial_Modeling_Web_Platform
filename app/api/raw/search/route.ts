import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

function parseParamsCanonical(paramsCanonical: string) {
  const params = new URLSearchParams(paramsCanonical);
  const parsed: Record<string, string> = {};
  params.forEach((value, key) => {
    parsed[key] = value;
  });
  return parsed;
}

function reportCodeToQuarter(reportCode: string | null) {
  switch (reportCode) {
    case "11013":
      return 1;
    case "11012":
      return 2;
    case "11014":
      return 3;
    case "11011":
      return 4;
    default:
      return null;
  }
}

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

  if (provider) {
    const normalized = provider.toUpperCase();
    if (normalized !== "OPENDART" && normalized !== "DART") {
      return NextResponse.json({ items: [], meta: { total: 0, limit, offset } });
    }
  }

  const where: any = {};
  const andFilters: any[] = [];

  if (ticker) {
    const corpMatches = await prisma.rawDartCorpMaster.findMany({
      where: { stockCode: ticker },
      select: { corpCode: true },
    });

    const corpCodes = corpMatches.map((corp) => corp.corpCode);
    if (corpCodes.length === 0) {
      return NextResponse.json({ items: [], meta: { total: 0, limit, offset } });
    }

    andFilters.push({
      OR: corpCodes.map((corpCode) => ({
        paramsCanonical: { contains: `corp_code=${corpCode}` },
      })),
    });
  }

  if (fiscalYear !== undefined) {
    andFilters.push({
      paramsCanonical: { contains: `bsns_year=${fiscalYear}` },
    });
  }

  if (reportCode) {
    andFilters.push({
      paramsCanonical: { contains: `reprt_code=${reportCode}` },
    });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  try {
    const [total, rows] = await prisma.$transaction([
      prisma.rawDartApiCall.count({ where }),
      prisma.rawDartApiCall.findMany({
        where,
        orderBy: { requestedAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);

    const corpCodesFromRows = Array.from(
      new Set(
        rows
          .map((row) => parseParamsCanonical(row.paramsCanonical || "").corp_code)
          .filter((value): value is string => Boolean(value))
      )
    );

    const corpMasters = corpCodesFromRows.length
      ? await prisma.rawDartCorpMaster.findMany({
          where: { corpCode: { in: corpCodesFromRows } },
          select: { corpCode: true, corpName: true, stockCode: true },
        })
      : [];

    const corpMap = new Map(
      corpMasters.map((corp) => [
        corp.corpCode,
        { corpName: corp.corpName, stockCode: corp.stockCode },
      ])
    );

    const items = rows.map((row) => {
      const params = parseParamsCanonical(row.paramsCanonical || "");
      const corpCode = params.corp_code || null;
      const corpInfo = corpCode ? corpMap.get(corpCode) : null;
      const parsedYear = params.bsns_year
        ? Number.parseInt(params.bsns_year, 10)
        : null;
      const report = params.reprt_code || null;
      const quarter = reportCodeToQuarter(report);
      const documentType = row.endpoint.includes("fnltt") ? "FS" : "UNKNOWN";

      return {
        raw_archive_id: row.id,
        ticker: corpInfo?.stockCode || null,
        corp_name: corpInfo?.corpName || null,
        report_code: report,
        fiscal_year: Number.isFinite(parsedYear) ? parsedYear : null,
        fiscal_quarter: quarter,
        document_type: documentType,
        provider: "OPENDART",
        received_at: row.completedAt || row.requestedAt,
        hash_sha256: row.payloadHash || null,
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
