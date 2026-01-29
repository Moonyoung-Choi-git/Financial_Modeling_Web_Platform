import prisma from './db';
import { toDecimal } from './math';

// OpenDART API 응답 내 개별 아이템 타입 정의 (필요한 필드만)
interface OpenDartItem {
  account_nm: string;    // 계정명 (예: 자산총계)
  thstrm_amount: string; // 당기 금액 (예: 1,000,000)
  sj_div: string;        // 재무제표 구분 (BS, IS, CIS, CF)
  [key: string]: any;
}

/**
 * Raw Archive 데이터를 읽어 표준 계정으로 매핑 및 정제하여 저장합니다.
 * @param rawArchiveId 처리할 Raw Archive의 UUID
 * @returns 저장된 FinancialAccount 개수
 */
export async function refineFinancialData(rawArchiveId: string) {
  // 1. Raw Data 및 메타데이터 조회 (FetchJob 파라미터 포함)
  const archive = await prisma.sourceRawArchive.findUnique({
    where: { id: rawArchiveId },
    include: { 
      metaIndex: true,
      fetchJob: true // [New] 파라미터 접근을 위해 추가
    },
  });

  if (!archive || !archive.rawPayload) {
    throw new Error(`Raw archive ${rawArchiveId} not found or empty`);
  }

  const payload = archive.rawPayload as any;
  
  // OpenDART 응답 구조 유효성 체크
  if (!payload.list || !Array.isArray(payload.list)) {
    console.warn(`[Refinement] Archive ${rawArchiveId} has no list data. Skipping.`);
    return 0;
  }

  const items = payload.list as OpenDartItem[];
  const ticker = archive.metaIndex?.ticker || 'UNKNOWN';
  const year = archive.metaIndex?.fiscalYear || new Date().getFullYear();
  const quarter = archive.metaIndex?.fiscalQuarter || null;

  // [New] FetchJob 파라미터에서 메타 정보 추출
  const jobParams = archive.fetchJob?.params as any;
  // 파라미터가 없으면 기본값 'CFS'(연결) 사용
  const fsDiv = jobParams?.fs_div || 'CFS'; 
  const reportCode = archive.metaIndex?.reportCode || null;

  // 2. 매핑 규칙 조회 (해당 Provider용)
  // 실제 운영 시에는 Redis 캐싱 등을 통해 성능 최적화 권장
  const rules = await prisma.accountMappingRule.findMany({
    where: { provider: archive.provider },
    orderBy: { priority: 'desc' }, // 우선순위 높은 규칙부터 적용
    include: { standardAccount: true },
  });

  const refinedAccounts = [];

  // 3. 항목별 매핑 적용
  for (const item of items) {
    const amountStr = item.thstrm_amount;
    // 금액이 없거나 '-' 인 경우 스킵
    if (!amountStr || amountStr === '-') continue;

    const reportedName = item.account_nm.trim();
    
    // 매핑 규칙 탐색
    let matchedRule = null;
    for (const rule of rules) {
      // 특정 기업 전용 규칙 체크 (tickerScope가 있으면 해당 기업만 적용)
      if (rule.tickerScope && rule.tickerScope !== ticker) continue;

      try {
        // 정규식 매칭 (예: "^자산총계$")
        const regex = new RegExp(rule.reportedAccountNamePattern);
        if (regex.test(reportedName)) {
          matchedRule = rule;
          break; // 가장 높은 우선순위 규칙 매칭 시 중단
        }
      } catch (e) {
        console.error(`Invalid regex pattern in rule ${rule.id}: ${rule.reportedAccountNamePattern}`);
      }
    }

    // 매핑된 규칙이 있는 경우에만 저장 (L2 Layer는 정제된 데이터만 보관)
    if (matchedRule) {
      refinedAccounts.push({
        ticker,
        fiscalYear: year,
        fiscalQuarter: quarter,
        
        // [New] 데이터 출처 성격 저장
        fsDiv: fsDiv,
        reportCode: reportCode,

        statementType: matchedRule.standardAccount.statementType,
        standardAccountCode: matchedRule.standardAccountCode,
        standardAccountName: matchedRule.standardAccount.accountName,
        reportedAccountName: reportedName,
        value: toDecimal(amountStr.replace(/,/g, '')), // 콤마 제거 후 Decimal 변환
        unit: 'KRW', // OpenDART 기본 단위
        sourceRawArchiveId: archive.id,
      });
    }
  }

  // 4. DB 저장 (Batch Insert)
  if (refinedAccounts.length > 0) {
    // L2 데이터는 재생성 가능하므로, 중복 방지를 위해 기존 데이터 삭제 후 삽입
    await prisma.financialAccount.deleteMany({
      where: { sourceRawArchiveId: archive.id },
    });
    
    await prisma.financialAccount.createMany({
      data: refinedAccounts,
    });
  }

  console.log(`[Refinement] Processed ${items.length} items, mapped ${refinedAccounts.length} accounts (FS: ${fsDiv}).`);
  return refinedAccounts.length;
}