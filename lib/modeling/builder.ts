import prisma from '@/lib/db';
import { Decimal } from '@/lib/math';

interface BuildOptions {
  ticker: string;
  years: number[]; // e.g. [2022, 2023, 2024]
  fsDivPriority?: ('CFS' | 'OFS')[]; // default: ['CFS', 'OFS']
}

export async function buildThreeStatementModel(options: BuildOptions) {
  const { ticker, years } = options;
  const fsDivPriority = options.fsDivPriority || ['CFS', 'OFS'];

  // 1. 해당 기간의 모든 정제된 데이터 조회
  const rawAccounts = await prisma.financialAccount.findMany({
    where: {
      ticker,
      fiscalYear: { in: years },
    },
  });

  const modelData: Record<string, any> = {};

  // 2. 연도별 모델링 수행
  for (const year of years) {
    const accountsByYear = rawAccounts.filter((a) => a.fiscalYear === year);
    
    if (accountsByYear.length === 0) continue;

    // 2-1. FS Div (연결/개별) 선택 로직 (명세서 8.3)
    let selectedFsDiv = null;
    let targetAccounts = [];

    for (const div of fsDivPriority) {
      const filtered = accountsByYear.filter((a) => a.fsDiv === div);
      if (filtered.length > 0) {
        selectedFsDiv = div;
        targetAccounts = filtered;
        break; // 우선순위 높은 것이 있으면 루프 종료
      }
    }

    if (!selectedFsDiv) continue; // 데이터 없음

    // 2-2. Statement Type (손익/포괄손익) 선택 로직 (명세서 8.4)
    // IS(손익계산서)와 CIS(포괄손익계산서)가 공존할 경우 CIS 우선 사용
    const hasCIS = targetAccounts.some((a) => a.statementType === 'CIS');
    const finalAccounts = targetAccounts.filter((a) => {
      if (hasCIS && a.statementType === 'IS') return false; // CIS가 있으면 IS 제외
      return true;
    });

    // 2-3. 구조화 (BS/IS/CF)
    modelData[year] = {
      meta: {
        fsDiv: selectedFsDiv,
        source: 'DART_OPEN_API',
      },
      BS: formatAccounts(finalAccounts, 'BS'),
      IS: formatAccounts(finalAccounts, hasCIS ? 'CIS' : 'IS'),
      CF: formatAccounts(finalAccounts, 'CF'),
    };
  }

  return modelData;
}

function formatAccounts(accounts: any[], type: string) {
  return accounts
    .filter((a) => a.statementType === type)
    .reduce((acc, curr) => {
      // 표준 계정 코드가 있으면 그것을 키로, 없으면 리포트된 이름을 키로 사용
      const key = curr.standardAccountCode || curr.reportedAccountName;
      acc[key] = {
        name: curr.standardAccountName || curr.reportedAccountName,
        value: Number(curr.value),
        unit: curr.unit
      };
      return acc;
    }, {});
}