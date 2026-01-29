import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import prisma from './db';
import { fetchCorpCodeFile } from './opendart';

interface CorpCodeXmlItem {
  corp_code: string[];
  corp_name: string[];
  stock_code: string[];
  modify_date: string[];
}

/**
 * OpenDART에서 corpCode.xml을 다운로드하여 DB를 동기화합니다.
 * 전체 데이터를 갱신(Delete All -> Insert All)하는 전략을 사용합니다.
 */
export async function syncCorpCodes() {
  console.log('[CorpCode] Starting synchronization...');

  // 1. ZIP 파일 다운로드
  const buffer = await fetchCorpCodeFile();
  console.log(`[CorpCode] Downloaded ZIP file (${buffer.byteLength} bytes).`);

  // 2. 압축 해제
  const zip = new AdmZip(Buffer.from(buffer));
  const zipEntries = zip.getEntries();
  const xmlEntry = zipEntries.find((entry) => entry.entryName === 'CORPCODE.xml');

  if (!xmlEntry) {
    throw new Error('CORPCODE.xml not found in the downloaded zip file.');
  }

  const xmlData = xmlEntry.getData().toString('utf8');
  console.log('[CorpCode] Extracted XML data.');

  // 3. XML 파싱
  const result = await parseStringPromise(xmlData);
  const list = result.result.list as CorpCodeXmlItem[];

  console.log(`[CorpCode] Parsed ${list.length} items.`);

  // 4. 데이터 변환
  const corpCodes = list.map((item) => {
    const stockCode = item.stock_code[0].trim();
    return {
      code: item.corp_code[0],
      name: item.corp_name[0],
      stockCode: stockCode === '' ? null : stockCode, // 비상장 기업은 null 처리
      modifyDate: item.modify_date[0],
    };
  });

  // 5. DB 저장 (Transaction: Delete -> CreateMany)
  // 데이터 양이 많으므로(약 10만 건) createMany를 사용합니다.
  await prisma.$transaction([
    prisma.corpCode.deleteMany(), // 기존 데이터 삭제 (Full Refresh)
    prisma.corpCode.createMany({
      data: corpCodes,
      skipDuplicates: true, // 혹시 모를 중복 방지
    }),
  ]);

  console.log('[CorpCode] Synchronization completed successfully.');
  return corpCodes.length;
}