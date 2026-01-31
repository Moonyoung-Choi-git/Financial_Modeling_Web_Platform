/**
 * Bulk Curation Script
 *
 * Transforms all raw data to curated facts after bulk ingestion.
 * Queries distinct combinations from raw_dart_fnltt_all_rows and runs transformRawToCurated().
 *
 * Features:
 * - Skip already curated data
 * - Progress tracking
 * - Coverage report generation
 *
 * Usage:
 *   npm run ingest:curate
 *   npm run ingest:curate -- --limit 10      # Test with 10 combinations
 *   npm run ingest:curate -- --corp 00126380 # Specific company
 *   npm run ingest:curate -- --force         # Re-curate all
 */

import prisma from '../lib/db';
import { transformRawToCurated } from '../lib/curate';

interface BulkCurateOptions {
  limit?: number;
  corpCode?: string;
  force?: boolean;
  dryRun?: boolean;
}

function parseArgs(): BulkCurateOptions {
  const args = process.argv.slice(2);
  const options: BulkCurateOptions = {
    limit: undefined,
    corpCode: undefined,
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if ((arg === '--corp' || arg === '--corpCode') && args[i + 1]) {
      options.corpCode = args[i + 1];
      i++;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('DART Bulk Curation Script');
  console.log('='.repeat(60));
  console.log('Configuration:');
  console.log(`  Limit: ${options.limit || 'No limit'}`);
  console.log(`  Corp Code: ${options.corpCode || 'All'}`);
  console.log(`  Force: ${options.force}`);
  console.log(`  Dry Run: ${options.dryRun}`);
  console.log('='.repeat(60));

  // 1. Query distinct combinations from raw_dart_fnltt_all_rows
  const whereClause: Record<string, unknown> = {};
  if (options.corpCode) {
    whereClause.corpCode = options.corpCode;
  }

  // Get distinct combinations using groupBy
  const distinctCombinations = await prisma.rawDartFnlttAllRow.groupBy({
    by: ['corpCode', 'bsnsYear', 'reprtCode', 'fsDiv'],
    where: whereClause,
    _count: { id: true },
    orderBy: [{ corpCode: 'asc' }, { bsnsYear: 'desc' }],
    take: options.limit,
  });

  console.log(`\nFound ${distinctCombinations.length} distinct combinations to process`);

  if (distinctCombinations.length === 0) {
    console.log('No raw data found. Run "npm run ingest:bulk" first.');
    await prisma.$disconnect();
    process.exit(0);
  }

  const startTime = Date.now();
  let processed = 0;
  let curated = 0;
  let skipped = 0;
  let errors = 0;

  const stats = {
    totalRowsProcessed: 0,
    totalRowsCreated: 0,
    totalParseErrors: 0,
    totalUnmappedRows: 0,
  };

  for (const combo of distinctCombinations) {
    const { corpCode, bsnsYear, reprtCode, fsDiv } = combo;
    const fsScope = fsDiv === 'CFS' ? 'CONSOLIDATED' : 'SEPARATE';

    processed++;

    // Check if already curated (skip if exists unless force)
    if (!options.force) {
      const existingCurated = await prisma.curatedFinFact.findFirst({
        where: {
          corpCode,
          fiscalYear: parseInt(bsnsYear),
          reportCode: reprtCode,
          fsScope,
        },
        select: { id: true },
      });

      if (existingCurated) {
        skipped++;
        continue;
      }
    }

    if (options.dryRun) {
      console.log(`[DRY RUN] Would curate: ${corpCode} ${bsnsYear} ${reprtCode} ${fsDiv}`);
      curated++;
      continue;
    }

    try {
      const result = await transformRawToCurated({
        corpCode,
        bsnsYear,
        reprtCode,
        fsDiv,
      });

      if (result.success) {
        curated++;
        stats.totalRowsProcessed += result.rowsProcessed;
        stats.totalRowsCreated += result.rowsCreated;
        stats.totalParseErrors += result.parseErrors;
        stats.totalUnmappedRows += result.unmappedRows;
      } else {
        errors++;
        console.error(`Failed to curate ${corpCode} ${bsnsYear}: ${result.errors.join(', ')}`);
      }
    } catch (error: unknown) {
      errors++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error curating ${corpCode} ${bsnsYear} ${reprtCode} ${fsDiv}: ${message}`);
    }

    // Progress update every 50 combinations
    if (processed % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = distinctCombinations.length - processed;
      const eta = remaining / rate;
      console.log(
        `Progress: ${processed}/${distinctCombinations.length} ` +
          `(curated: ${curated}, skipped: ${skipped}, errors: ${errors}) ` +
          `ETA: ${(eta / 60).toFixed(1)} min`
      );
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('Bulk Curation Summary');
  console.log('='.repeat(60));
  console.log(`Total combinations: ${distinctCombinations.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Curated: ${curated}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Elapsed time: ${elapsed.toFixed(1)}s`);
  console.log('\nRow Statistics:');
  console.log(`  Total rows processed: ${stats.totalRowsProcessed}`);
  console.log(`  Total rows created: ${stats.totalRowsCreated}`);
  console.log(`  Total parse errors: ${stats.totalParseErrors}`);
  console.log(`  Total unmapped rows: ${stats.totalUnmappedRows}`);

  if (stats.totalRowsProcessed > 0) {
    const mappingRate = ((stats.totalRowsProcessed - stats.totalUnmappedRows) / stats.totalRowsProcessed) * 100;
    console.log(`  Mapping coverage: ${mappingRate.toFixed(1)}%`);
  }

  console.log('='.repeat(60));

  // Generate coverage report
  if (!options.dryRun && curated > 0) {
    console.log('\nGenerating coverage report...');
    await generateCoverageReport();
  }
}

async function generateCoverageReport() {
  // Get coverage by year
  const coverageByYear = await prisma.curatedFinFact.groupBy({
    by: ['fiscalYear'],
    _count: { id: true },
    orderBy: { fiscalYear: 'asc' },
  });

  console.log('\nCoverage by Year:');
  for (const row of coverageByYear) {
    console.log(`  ${row.fiscalYear}: ${row._count.id} facts`);
  }

  // Get coverage by statement type
  const coverageByType = await prisma.curatedFinFact.groupBy({
    by: ['statementType'],
    _count: { id: true },
    orderBy: { statementType: 'asc' },
  });

  console.log('\nCoverage by Statement Type:');
  for (const row of coverageByType) {
    console.log(`  ${row.statementType}: ${row._count.id} facts`);
  }

  // Get unique companies with curated data
  const companiesWithData = await prisma.curatedFinFact.groupBy({
    by: ['corpCode'],
    _count: { id: true },
  });

  console.log(`\nTotal companies with curated data: ${companiesWithData.length}`);
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
