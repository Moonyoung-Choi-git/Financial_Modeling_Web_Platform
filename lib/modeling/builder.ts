import prisma from '@/lib/db';

interface BuildOptions {
  ticker: string;
  corpCode?: string;
  years: number[];
  fsDivPriority?: string[]; // e.g. ['CFS', 'OFS']
  reportPriority?: string[]; // e.g. ['11011', '11012', '11014', '11013']
}

/**
 * 주어진 옵션에 따라 3-Statement Model 데이터를 생성합니다.
 */
export async function buildThreeStatementModel(options: BuildOptions) {
  const { ticker, years, corpCode } = options;
  // 기본 우선순위: 연결(CFS) -> 개별(OFS)
  const fsDivPriority = options.fsDivPriority || ['CFS', 'OFS'];
  const reportPriority = options.reportPriority || ['11011', '11012', '11014', '11013'];
  const reportRank = new Map(reportPriority.map((code, index) => [code, index]));
  const periodRank: Record<string, number> = {
    ANNUAL: 0,
    HALF_YEAR: 1,
    QUARTER: 2,
    YTD: 3,
  };

  // 1. 해당 기간의 모든 정제된 계정 데이터 조회
  const where: any = {
    fiscalYear: { in: years },
  };

  if (corpCode && ticker) {
    where.OR = [{ stockCode: ticker }, { corpCode }];
  } else if (corpCode) {
    where.corpCode = corpCode;
  } else {
    where.stockCode = ticker;
  }

  const rawAccounts = await prisma.curatedFinFact.findMany({
    where,
    orderBy: [
      { fiscalYear: 'asc' },
      { statementType: 'asc' },
      { ordering: 'asc' },
    ],
  });

  const modelData: Record<string, any> = {};

  // 2. 연도별 모델링 수행
  for (const year of years) {
    const accountsByYear = rawAccounts.filter((a) => a.fiscalYear === year);
    
    if (accountsByYear.length === 0) continue;

    // 2-1. FS Scope (연결/개별) 선택 로직
    // fsScope: CONSOLIDATED (CFS) or SEPARATE (OFS)
    let selectedFsScope = null;
    let targetAccounts: typeof rawAccounts = [];

    for (const div of fsDivPriority) {
      const scopeMapping: Record<string, string> = {
        'CFS': 'CONSOLIDATED',
        'OFS': 'SEPARATE'
      };
      const scope = scopeMapping[div];

      const filtered = accountsByYear.filter((a) => a.fsScope === scope);
      if (filtered.length > 0) {
        selectedFsScope = div; // Keep CFS/OFS for display
        targetAccounts = filtered;
        break; // 우선순위 높은 것이 발견되면 중단
      }
    }

    // 해당 연도에 적합한 데이터가 없으면 스킵
    if (!selectedFsScope || targetAccounts.length === 0) continue;

    // 2-2. Statement Type 처리 (CIS가 있으면 IS 대신 사용)
    const hasCIS = targetAccounts.some((a) => a.statementType === 'CIS');

    // 2-3. Report/Period 우선순위에 따라 라인별 최적 데이터 선택
    const pickBestFacts = (facts: typeof targetAccounts) => {
      const selected = new Map<string, (typeof targetAccounts)[number]>();

      const compare = (a: (typeof targetAccounts)[number], b: (typeof targetAccounts)[number]) => {
        const reportA = reportRank.get(a.reportCode) ?? 999;
        const reportB = reportRank.get(b.reportCode) ?? 999;
        if (reportA !== reportB) return reportA - reportB;

        const periodA = periodRank[a.periodType] ?? 99;
        const periodB = periodRank[b.periodType] ?? 99;
        if (periodA !== periodB) return periodA - periodB;

        if (a.sourcePriority !== b.sourcePriority) {
          return b.sourcePriority - a.sourcePriority;
        }

        const dateA = a.asOfDate || a.flowEndDate;
        const dateB = b.asOfDate || b.flowEndDate;
        if (dateA && dateB && dateA.getTime() !== dateB.getTime()) {
          return dateB.getTime() - dateA.getTime();
        }

        if (a.standardLineId && !b.standardLineId) return -1;
        if (!a.standardLineId && b.standardLineId) return 1;

        return 0;
      };

      for (const fact of facts) {
        const key = `${fact.statementType}:${fact.standardLineId || fact.accountNameKr}`;
        const existing = selected.get(key);
        if (!existing || compare(fact, existing) < 0) {
          selected.set(key, fact);
        }
      }

      return Array.from(selected.values());
    };

    const selectedAccounts = pickBestFacts(targetAccounts);

    // 2-4. 포맷팅 헬퍼 함수
    const format = (type: string) => {
      return selectedAccounts
        .filter((a) => a.statementType === type)
        .reduce((acc: any, curr) => {
          // 표준 코드가 있으면 사용, 없으면 한글 계정명 사용
          const key = curr.standardLineId || curr.accountNameKr;
          acc[key] = {
            name: curr.accountNameKr,
            value: Number(curr.amount), // Decimal -> Number 변환
            reportedName: curr.accountNameKr,
            standardLineId: curr.standardLineId,
            unit: curr.currency || 'KRW'
          };
          return acc;
        }, {});
    };

    // 2-5. 최종 데이터 구조화
    modelData[year] = {
      meta: {
        fsDiv: selectedFsScope,
        year: year,
        source: 'DART_OPEN_API',
      },
      BS: format('BS'),
      IS: format(hasCIS ? 'CIS' : 'IS'), // 포괄손익계산서 우선 적용
      CF: format('CF'),
    };
  }

  return modelData;
}
