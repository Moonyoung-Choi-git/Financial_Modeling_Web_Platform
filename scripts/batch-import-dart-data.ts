/**
 * Batch Import DART Financial Data
 *
 * This script downloads financial data for ALL companies from DART OpenAPI
 * and stores it in the Prisma database for fast access.
 *
 * Usage:
 *   npx tsx scripts/batch-import-dart-data.ts
 *
 * Options:
 *   --market KOSPI|KOSDAQ|KONEX  (import only specific market)
 *   --limit N                     (limit to N companies for testing)
 *   --years 2021,2022,2023        (specific years, default: last 3 years)
 */

import { PrismaClient } from '@prisma/client';
import { fetchFinancialAll, syncCorpCodesOnce } from '../lib/dart';
import { transformRawToCurated } from '../lib/curate';

const prisma = new PrismaClient();

const REPORT_CODES = ['11011', '11012', '11014', '11013']; // Annual, Q1, Q2, Q3
const FS_DIV_PRIORITY: Array<'CFS' | 'OFS'> = ['CFS', 'OFS'];

interface ImportOptions {
  market?: string;
  limit?: number;
  years?: number[];
  skipExisting: boolean;
}

async function importCompanyData(
  corpCode: string,
  corpName: string,
  years: number[],
  options: { skipExisting: boolean }
) {
  console.log(`\n📊 Importing ${corpName} (${corpCode})`);

  let totalImported = 0;
  let totalSkipped = 0;

  for (const year of years) {
    for (const reportCode of REPORT_CODES) {
      for (const fsDiv of FS_DIV_PRIORITY) {
        const bsnsYear = String(year);
        const fsScope = fsDiv === 'CFS' ? 'CONSOLIDATED' : 'SEPARATE';

        try {
          // Check if data already exists
          if (options.skipExisting) {
            const existing = await prisma.rawDartFnlttAllRow.findFirst({
              where: { corpCode, bsnsYear, reprtCode: reportCode, fsDiv },
              select: { id: true },
            });

            if (existing) {
              totalSkipped++;
              continue;
            }
          }

          // Fetch from DART API
          console.log(`  ↓ Downloading ${year} ${reportCode} ${fsDiv}...`);
          const response = await fetchFinancialAll({
            corp_code: corpCode,
            bsns_year: bsnsYear,
            reprt_code: reportCode,
            fs_div: fsDiv,
          });

          if (response.rowCount === 0) {
            console.log(`  ⊘ No data for ${year} ${reportCode} ${fsDiv}`);
            continue;
          }

          totalImported++;
          console.log(
            `  ✓ Imported ${response.rowCount} rows for ${year} ${reportCode} ${fsDiv}`
          );

          // Rate limiting - wait 200ms between requests
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error: any) {
          console.error(`  ✗ Error importing ${year} ${reportCode} ${fsDiv}:`, error.message);
        }
      }
    }
  }

  return { imported: totalImported, skipped: totalSkipped };
}

async function main() {
  console.log('🚀 DART Batch Import Started\n');
  console.log('=====================================');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: ImportOptions = {
    skipExisting: true,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--market' && args[i + 1]) {
      options.market = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--years' && args[i + 1]) {
      options.years = args[i + 1].split(',').map((y) => parseInt(y.trim(), 10));
      i++;
    } else if (args[i] === '--no-skip') {
      options.skipExisting = false;
    }
  }

  // Default: last 3 years
  if (!options.years) {
    const currentYear = new Date().getFullYear();
    options.years = [currentYear - 2, currentYear - 1, currentYear];
  }

  console.log('Options:');
  console.log(`  Market: ${options.market || 'ALL'}`);
  console.log(`  Limit: ${options.limit || 'NO LIMIT'}`);
  console.log(`  Years: ${options.years.join(', ')}`);
  console.log(`  Skip Existing: ${options.skipExisting}`);
  console.log('=====================================\n');

  // Step 1: Sync corp codes
  console.log('[Step 1/3] Syncing company list from DART...');
  await syncCorpCodesOnce();
  console.log('✓ Company list synced\n');

  // Step 2: Get companies to import
  console.log('[Step 2/3] Fetching companies to import...');
  const whereClause: any = {};

  if (options.market) {
    const MARKET_CLASS_MAP: Record<string, string> = {
      KOSPI: 'Y',
      KOSDAQ: 'K',
      KONEX: 'N',
    };
    whereClause.corpCls = MARKET_CLASS_MAP[options.market.toUpperCase()];
  }

  const companies = await prisma.rawDartCorpMaster.findMany({
    where: {
      ...whereClause,
      stockCode: { not: null }, // Only listed companies
    },
    select: {
      corpCode: true,
      corpName: true,
      stockCode: true,
      corpCls: true,
    },
    take: options.limit,
    orderBy: { modifyDate: 'desc' },
  });

  console.log(`✓ Found ${companies.length} companies to import\n`);

  // Step 3: Import data for each company
  console.log('[Step 3/3] Importing financial data...\n');

  let totalCompanies = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const company of companies) {
    try {
      const result = await importCompanyData(
        company.corpCode,
        company.corpName,
        options.years!,
        { skipExisting: options.skipExisting }
      );

      totalCompanies++;
      totalImported += result.imported;
      totalSkipped += result.skipped;

      console.log(`  Summary: ${result.imported} imported, ${result.skipped} skipped`);
    } catch (error: any) {
      totalErrors++;
      console.error(`\n❌ Failed to import ${company.corpName}:`, error.message);
    }

    // Progress update every 10 companies
    if (totalCompanies % 10 === 0) {
      console.log(`\n📈 Progress: ${totalCompanies}/${companies.length} companies processed`);
      console.log(`   Total imported: ${totalImported}, skipped: ${totalSkipped}, errors: ${totalErrors}\n`);
    }
  }

  console.log('\n=====================================');
  console.log('✅ Batch Import Complete!');
  console.log('=====================================');
  console.log(`Companies processed: ${totalCompanies}`);
  console.log(`Reports imported: ${totalImported}`);
  console.log(`Reports skipped: ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);
  console.log('=====================================\n');

  console.log('Next steps:');
  console.log('1. Run curate script to transform raw data to curated facts');
  console.log('2. Users can now query data instantly from the database');
  console.log('3. Set up a cron job to run this script periodically for updates\n');
}

main()
  .catch((e) => {
    console.error('❌ Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
