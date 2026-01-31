/**
 * Weekly Update Script
 *
 * Fetches financial data for current year (new filings) for all listed companies.
 * Designed to be run weekly via GitHub Actions or cron job.
 *
 * Features:
 * - Refreshes current year data for all listed companies
 * - Optionally includes previous year for late filings
 * - Triggers curation after ingestion
 *
 * Usage:
 *   npm run ingest:weekly
 *   npm run ingest:weekly -- --include-prev   # Include previous year
 *   npm run ingest:weekly -- --market KOSPI   # Only KOSPI
 */

import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import prisma from '../lib/db';

const QUEUE_NAME = process.env.QUEUE_NAME || 'fmwp-ingestion';
const queue = new Queue(QUEUE_NAME, { connection: redis });

// All report types: Annual, Semi-annual, Q3, Q1
const REPORT_CODES = ['11011', '11012', '11014', '11013'];

// Both consolidated and separate financial statements
const FS_DIVS: Array<'CFS' | 'OFS'> = ['CFS', 'OFS'];

// Rate limit: 100 requests/minute = 600ms between requests
const JOB_DELAY_MS = 600;

interface WeeklyUpdateOptions {
  market?: 'KOSPI' | 'KOSDAQ' | 'ALL';
  includePrev?: boolean;
  dryRun?: boolean;
  limit?: number;
}

function parseArgs(): WeeklyUpdateOptions {
  const args = process.argv.slice(2);
  const options: WeeklyUpdateOptions = {
    market: 'ALL',
    includePrev: false,
    dryRun: false,
    limit: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--market' && args[i + 1]) {
      const market = args[i + 1].toUpperCase();
      if (market === 'KOSPI' || market === 'KOSDAQ') {
        options.market = market;
      }
      i++;
    } else if (arg === '--include-prev') {
      options.includePrev = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const currentYear = new Date().getFullYear();
  const years = options.includePrev ? [currentYear - 1, currentYear] : [currentYear];

  console.log('='.repeat(60));
  console.log('DART Weekly Update Script');
  console.log('='.repeat(60));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('Configuration:');
  console.log(`  Market: ${options.market}`);
  console.log(`  Years: ${years.join(', ')}`);
  console.log(`  Include Previous Year: ${options.includePrev}`);
  console.log(`  Limit: ${options.limit || 'No limit'}`);
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

  // Get all listed companies
  const companies = await prisma.rawDartCorpMaster.findMany({
    where: {
      stockCode: { not: null },
      corpCls: { in: corpClsFilter },
    },
    select: { corpCode: true, corpName: true },
    take: options.limit,
    orderBy: { modifyDate: 'desc' },
  });

  console.log(`\n[Weekly Update] Processing ${companies.length} companies for years ${years.join(', ')}`);

  if (companies.length === 0) {
    console.log('No companies found. Run "npm run ingest:corp-sync" first.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const startTime = Date.now();
  let jobsQueued = 0;

  // Generate unique batch ID for this run
  const batchId = Date.now();

  for (const company of companies) {
    for (const year of years) {
      if (options.dryRun) {
        console.log(`[DRY RUN] Would queue: ${company.corpName} (${company.corpCode}) - ${year}`);
        jobsQueued++;
        continue;
      }

      // Queue FetchMultiYearFinancialsJob
      // Note: Using unique timestamp to force refresh (no duplicate prevention)
      await queue.add(
        'FetchMultiYearFinancialsJob',
        {
          corpCode: company.corpCode,
          years: [year],
          reportCodes: REPORT_CODES,
          fsDivs: FS_DIVS,
        },
        {
          jobId: `weekly-${company.corpCode}-${year}-${batchId}`,
          delay: jobsQueued * JOB_DELAY_MS,
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
        console.log(`Progress: ${jobsQueued} jobs queued`);
      }
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('Weekly Update Summary');
  console.log('='.repeat(60));
  console.log(`Jobs queued: ${jobsQueued}`);
  console.log(`Elapsed time: ${elapsed.toFixed(1)}s`);

  if (jobsQueued > 0 && !options.dryRun) {
    const estimatedMinutes = (jobsQueued * JOB_DELAY_MS) / 1000 / 60;
    const estimatedHours = estimatedMinutes / 60;
    console.log(`\nEstimated processing time: ~${estimatedHours.toFixed(1)} hours`);
    console.log('\nMake sure the worker is running: npm run worker');
  }

  console.log('='.repeat(60));

  // Log summary for monitoring
  console.log('\n[Weekly Update] Completed at', new Date().toISOString());
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
