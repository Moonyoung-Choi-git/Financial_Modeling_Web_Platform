import prisma from './db';
import { transformRawToCurated } from './curate/transform';

function parseParamsCanonical(paramsCanonical: string): Record<string, string> {
  const params = new URLSearchParams(paramsCanonical);
  const parsed: Record<string, string> = {};
  params.forEach((value, key) => {
    parsed[key] = value;
  });
  return parsed;
}

/**
 * Raw API Call 데이터를 기반으로 Curated Facts를 생성합니다.
 * @param rawArchiveId 처리할 RawDartApiCall의 UUID
 * @returns 저장된 CuratedFinFact 개수
 */
export async function refineFinancialData(rawArchiveId: string) {
  const apiCall = await prisma.rawDartApiCall.findUnique({
    where: { id: rawArchiveId },
    select: { paramsCanonical: true },
  });

  if (!apiCall) {
    throw new Error(`Raw API call ${rawArchiveId} not found`);
  }

  const params = parseParamsCanonical(apiCall.paramsCanonical || '');
  const corpCode = params.corp_code;
  const bsnsYear = params.bsns_year;

  if (!corpCode || !bsnsYear) {
    throw new Error(
      `Missing corp_code/bsns_year in paramsCanonical for API call ${rawArchiveId}`
    );
  }

  const reprtCode = params.reprt_code || '11011';
  const fsDiv = params.fs_div || 'CFS';

  const result = await transformRawToCurated({
    corpCode,
    bsnsYear,
    reprtCode,
    fsDiv,
  });

  return result.rowsCreated;
}
