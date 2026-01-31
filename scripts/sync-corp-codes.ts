/**
 * Corp Code Sync Script
 *
 * Synchronizes all company codes from DART OpenAPI.
 * This should be run as the first step before bulk ingestion.
 *
 * Usage:
 *   npm run ingest:corp-sync
 *   npm run ingest:corp-sync -- --force  # Force full refresh
 */

import { syncCorpCodes } from '../lib/dart';
import prisma from '../lib/db';

interface SyncOptions {
  force?: boolean;
}

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const options: SyncOptions = {
    force: false,
  };

  for (const arg of args) {
    if (arg === '--force') {
      options.force = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('DART Corp Code Sync');
  console.log('='.repeat(60));

  // Check current state
  const currentCount = await prisma.rawDartCorpMaster.count();
  const listedCount = await prisma.rawDartCorpMaster.count({
    where: { stockCode: { not: null } },
  });

  console.log(`Current state:`);
  console.log(`  Total companies: ${currentCount}`);
  console.log(`  Listed companies: ${listedCount}`);
  console.log(`  Force refresh: ${options.force}`);
  console.log('='.repeat(60));

  if (currentCount > 0 && !options.force) {
    console.log('\nCorp codes already synced. Use --force to refresh.');

    // Show market breakdown
    const byMarket = await prisma.rawDartCorpMaster.groupBy({
      by: ['corpCls'],
      where: { stockCode: { not: null } },
      _count: { corpCode: true },
    });

    console.log('\nListed companies by market:');
    for (const row of byMarket) {
      const marketName =
        row.corpCls === 'Y' ? 'KOSPI' : row.corpCls === 'K' ? 'KOSDAQ' : row.corpCls === 'N' ? 'KONEX' : 'OTHER';
      console.log(`  ${marketName}: ${row._count.corpCode}`);
    }

    return;
  }

  console.log('\nStarting sync from DART OpenAPI...');
  const startTime = Date.now();

  try {
    const stats = await syncCorpCodes();

    const elapsed = (Date.now() - startTime) / 1000;

    console.log('\n' + '='.repeat(60));
    console.log('Sync Complete');
    console.log('='.repeat(60));
    console.log(`Total: ${stats.total}`);
    console.log(`Added: ${stats.added}`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Elapsed: ${elapsed.toFixed(1)}s`);

    // Show updated market breakdown
    const byMarket = await prisma.rawDartCorpMaster.groupBy({
      by: ['corpCls'],
      where: { stockCode: { not: null } },
      _count: { corpCode: true },
    });

    console.log('\nListed companies by market:');
    for (const row of byMarket) {
      const marketName =
        row.corpCls === 'Y' ? 'KOSPI' : row.corpCls === 'K' ? 'KOSDAQ' : row.corpCls === 'N' ? 'KONEX' : 'OTHER';
      console.log(`  ${marketName}: ${row._count.corpCode}`);
    }

    console.log('='.repeat(60));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\nSync failed:', message);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
