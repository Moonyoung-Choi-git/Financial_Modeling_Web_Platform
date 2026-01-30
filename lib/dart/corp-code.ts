/**
 * DART Corp Code Sync (명세서 Section 2.2 - 기업 마스터 동기화)
 *
 * Fetches and synchronizes corpCode.xml from DART
 * - Downloads zip file containing corpCode.xml
 * - Parses XML to extract corp_code, corp_name, stock_code, modify_date
 * - Incremental update based on modify_date
 */

import { getDartClient } from './client';
import { CorpCodeItem } from './types';
import prisma from '../db';
import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';

/**
 * corpCode.xml 다운로드 및 동기화
 */
export async function syncCorpCodes(): Promise<{
  total: number;
  updated: number;
  added: number;
  errors: number;
}> {
  console.log('[DART CorpCode] Starting corp code synchronization...');

  const stats = {
    total: 0,
    updated: 0,
    added: 0,
    errors: 0,
  };

  try {
    // 1. Download corpCode.xml (zip binary)
    const client = getDartClient();
    const zipBuffer = await client.downloadBinary('/corpCode.xml', {});

    console.log(`[DART CorpCode] Downloaded ${zipBuffer.length} bytes`);

    // 2. Extract zip
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    if (zipEntries.length === 0) {
      throw new Error('Empty zip file');
    }

    const xmlEntry = zipEntries.find(entry => entry.entryName === 'CORPCODE.xml');

    if (!xmlEntry) {
      throw new Error('CORPCODE.xml not found in zip');
    }

    const xmlContent = xmlEntry.getData().toString('utf-8');

    console.log(`[DART CorpCode] Extracted XML (${xmlContent.length} chars)`);

    // 3. Parse XML
    const parsed = await parseStringPromise(xmlContent, {
      explicitArray: false,
      trim: true,
    });

    const corpList = parsed.result.list;

    if (!Array.isArray(corpList)) {
      throw new Error('Invalid XML structure');
    }

    stats.total = corpList.length;
    console.log(`[DART CorpCode] Parsed ${stats.total} corporations`);

    // 4. Upsert into database (증분 갱신)
    for (const item of corpList) {
      try {
        const corpCode = item.corp_code;
        const stockCode = item.stock_code?.trim() || null;
        const modifyDate = item.modify_date;
        const corpCls = item.corp_cls?.trim() || null;

        // Check if exists
        const existing = await prisma.rawDartCorpMaster.findUnique({
          where: { corpCode },
        });

        if (existing) {
          const shouldUpdate =
            existing.modifyDate !== modifyDate ||
            existing.corpCls !== corpCls ||
            existing.corpName !== item.corp_name ||
            existing.corpEngName !== (item.corp_eng_name || null) ||
            existing.stockCode !== (stockCode?.length === 6 ? stockCode : null);

          if (shouldUpdate) {
            await prisma.rawDartCorpMaster.update({
              where: { corpCode },
              data: {
                stockCode: stockCode?.length === 6 ? stockCode : null,
                corpName: item.corp_name,
                corpEngName: item.corp_eng_name || null,
                corpCls,
                modifyDate,
              },
            });
            stats.updated++;
          }
        } else {
          // Insert new
          await prisma.rawDartCorpMaster.create({
              data: {
                corpCode,
                stockCode: stockCode?.length === 6 ? stockCode : null,
                corpName: item.corp_name,
                corpEngName: item.corp_eng_name || null,
                corpCls,
                modifyDate,
              },
            });
            stats.added++;
        }
      } catch (error: any) {
        console.error(`[DART CorpCode] Error processing ${item.corp_code}: ${error.message}`);
        stats.errors++;
      }
    }

    console.log(`[DART CorpCode] ✅ Sync completed: ${stats.added} added, ${stats.updated} updated, ${stats.errors} errors`);

    return stats;

  } catch (error: any) {
    console.error('[DART CorpCode] ❌ Sync failed:', error);
    throw error;
  }
}

/**
 * stock_code → corp_code 조회
 */
export async function getCorpCodeByStockCode(stockCode: string): Promise<string | null> {
  const corp = await prisma.rawDartCorpMaster.findFirst({
    where: {
      stockCode: stockCode.padStart(6, '0'),
    },
  });

  return corp?.corpCode || null;
}

/**
 * corp_code → stock_code 조회
 */
export async function getStockCodeByCorpCode(corpCode: string): Promise<string | null> {
  const corp = await prisma.rawDartCorpMaster.findUnique({
    where: { corpCode },
  });

  return corp?.stockCode || null;
}

/**
 * 기업명으로 검색
 */
export async function searchCorpByName(corpName: string): Promise<CorpCodeItem[]> {
  const corps = await prisma.rawDartCorpMaster.findMany({
    where: {
      corpName: {
        contains: corpName,
      },
    },
    take: 20,
  });

  return corps.map(c => ({
    corp_code: c.corpCode,
    corp_name: c.corpName,
    stock_code: c.stockCode || undefined,
    corp_cls: c.corpCls || undefined,
    modify_date: c.modifyDate,
  }));
}
