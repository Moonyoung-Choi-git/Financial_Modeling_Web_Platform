/**
 * Bulk Ingestion Script
 *
 * Orchestrates bulk download of all listed company financials using existing BullMQ worker.
 * Downloads 10 years of financial data for all KOSPI + KOSDAQ companies.
 *
 * Features:
 * - Reuses existing FetchMultiYearFinancialsJob worker
 * - Resume capability (skip existing data via findFirst check)
 * - Progress tracking with logging
 * - Rate limit compliance via job delay (600ms = 100 req/min)
 * - Unique job IDs prevent duplicates
 *
 * Usage:
 *   npm run ingest:bulk
 *   npm run ingest:bulk -- --limit 10        # Test with 10 companies
 *   npm run ingest:bulk -- --market KOSPI    # Only KOSPI
 *   npm run ingest:bulk -- --year 2024       # Only specific year
 */

import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import prisma from '../lib/db';

const QUEUE_NAME = process.env.QUEUE_NAME || 'fmwp-ingestion';
const queue = new Queue(QUEUE_NAME, { connection: redis });

// 10 years of historical data (2015-2024)
const DEFAULT_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

// All report types: Annual, Semi-annual, Q3, Q1
const REPORT_CODES = ['11011', '11012', '11014', '11013'];

// Both consolidated and separate financial statements
const FS_DIVS: Array<'CFS' | 'OFS'> = ['CFS', 'OFS'];

// Rate limit: 100 requests/minute = 600ms between requests
const JOB_DELAY_MS = 600;

interface BulkIngestOptions {
  limit?: number;
  market?: 'KOSPI' | 'KOSDAQ' | 'ALL';
  years?: number[];
  dryRun?: boolean;
  skipExisting?: boolean;
}

function parseArgs(): BulkIngestOptions {
  const args = process.argv.slice(2);
  const options: BulkIngestOptions = {
    limit: undefined,
    market: 'ALL',
    years: DEFAULT_YEARS,
    dryRun: false,
    skipExisting: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--market' && args[i + 1]) {
      const market = args[i + 1].toUpperCase();
      if (market === 'KOSPI' || market === 'KOSDAQ') {
        options.market = market;
      }
      i++;
    } else if (arg === '--year' && args[i + 1]) {
      options.years = [parseInt(args[i + 1], 10)];
      i++;
    } else if (arg === '--years' && args[i + 1]) {
      options.years = args[i + 1].split(',').map((y) => parseInt(y.trim(), 10));
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-skip') {
      options.skipExisting = false;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('DART Bulk Ingestion Script');
  console.log('='.repeat(60));
  console.log('Configuration:');
  console.log(`  Market: ${options.market}`);
  console.log(`  Years: ${options.years?.join(', ')}`);
  console.log(`  Limit: ${options.limit || 'No limit'}`);
  console.log(`  Skip Existing: ${options.skipExisting}`);
  console.log(`  Dry Run: ${options.dryRun}`);
  console.log(`  Queue: ${QUEUE_NAME}`);
  console.log('='.repeat(60));

  // Build where clause for companies
  const marketClsMap: Record<string, string[]> = {
    KOSPI: ['Y'],
    KOSDAQ: ['K'],
    ALL: ['Y', 'K'],
  };

  const corpClsFilter = marketClsMap[options.market || 'ALL'];

  // 1. Get all listed companies (KOSPI + KOSDAQ)
  const companies = await prisma.rawDartCorpMaster.findMany({
    where: {
      stockCode: { not: null },
      corpCls: { in: corpClsFilter },
    },
    select: { corpCode: true, stockCode: true, corpName: true, corpCls: true },
    take: options.limit,
    orderBy: { modifyDate: 'desc' },
  });

  console.log(`\nFound ${companies.length} listed companies`);

  if (companies.length === 0) {
    console.log('No companies found. Run "npm run ingest:corp-sync" first.');
    await prisma.$disconnect();
    process.exit(1);
  }

  let jobsQueued = 0;
  let skipped = 0;
  let totalCombinations = 0;

  const years = options.years || DEFAULT_YEARS;

  // Calculate total combinations for progress tracking
  const estimatedTotal = companies.length * years.length;

  console.log(`\nProcessing ${companies.length} companies × ${years.length} years = ~${estimatedTotal} job groups`);
  console.log('Each job covers all report types (4) and FS divs (2)\n');

  const startTime = Date.now();

  for (const company of companies) {
    for (const year of years) {
      totalCombinations++;

      // Check if any data exists for this company/year (resume capability)
      if (options.skipExisting) {
        const existing = await prisma.rawDartFnlttAllRow.findFirst({
          where: {
            corpCode: company.corpCode,
            bsnsYear: String(year),
          },
          select: { id: true },
        });

        if (existing) {
          skipped++;
          continue;
        }
      }

      if (options.dryRun) {
        console.log(`[DRY RUN] Would queue: ${company.corpName} (${company.corpCode}) - ${year}`);
        jobsQueued++;
        continue;
      }

      // Queue FetchMultiYearFinancialsJob (uses existing worker)
      await queue.add(
        'FetchMultiYearFinancialsJob',
        {
          corpCode: company.corpCode,
          years: [year],
          reportCodes: REPORT_CODES,
          fsDivs: FS_DIVS,
        },
        {
          jobId: `bulk-${company.corpCode}-${year}`,
          delay: jobsQueued * JOB_DELAY_MS, // Stagger jobs for rate limiting
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );

      jobsQueued++;

      // Progress update every 100 jobs
      if (jobsQueued % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = jobsQueued / elapsed;
        console.log(
          `Progress: ${jobsQueued} jobs queued, ${skipped} skipped ` +
            `(${((totalCombinations / estimatedTotal) * 100).toFixed(1)}% scanned, ${rate.toFixed(1)} jobs/sec)`
        );
      }
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('Bulk Ingestion Summary');
  console.log('='.repeat(60));
  console.log(`Total combinations scanned: ${totalCombinations}`);
  console.log(`Jobs queued: ${jobsQueued}`);
  console.log(`Skipped (existing data): ${skipped}`);
  console.log(`Elapsed time: ${elapsed.toFixed(1)}s`);

  if (jobsQueued > 0 && !options.dryRun) {
    const estimatedMinutes = (jobsQueued * JOB_DELAY_MS) / 1000 / 60;
    const estimatedHours = estimatedMinutes / 60;
    console.log(`\nEstimated processing time: ~${estimatedHours.toFixed(1)} hours`);
    console.log(`(Based on ${JOB_DELAY_MS}ms delay between jobs for rate limiting)`);
    console.log('\nMake sure the worker is running: npm run worker');
  }

  console.log('='.repeat(60));
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await queue.close();
    await prisma.$disconnect();
  });
