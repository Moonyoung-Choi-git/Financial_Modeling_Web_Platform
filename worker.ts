/**
 * FMWP Worker (BullMQ)
 * Based on Specification Section 9: Worker/Queue Job Design
 *
 * Job Types (Section 9.1):
 * - SyncCorpMasterJob
 * - SyncFilingsJob
 * - FetchFinancialAllJob
 * - FetchFinancialKeyJob
 * - DownloadXbrlJob
 * - CurateTransformJob
 * - BuildModelSnapshotJob
 * - BuildViewerSheetsJob
 * - RestatementMonitorJob
 */

import { Worker, Job, Queue } from 'bullmq';
import { redis } from './lib/redis';
import prisma from './lib/db';

// DART API
import {
  syncCorpCodes,
  getCorpCodeByStockCode,
  syncFilings,
  getRegularFilings,
  fetchFinancialAll,
  fetchFinancialKey,
  fetchMultiYearFinancials,
  fetchQuarterlyFinancials,
} from './lib/dart';

// Queue name
const QUEUE_NAME = process.env.QUEUE_NAME || 'fmwp-ingestion';

console.log('[Worker] Starting FMWP Worker...');
console.log(`[Worker] Queue: ${QUEUE_NAME}`);
console.log(`[Worker] Redis: ${process.env.REDIS_URL || 'localhost:6379'}`);

// Create queue instance
const queue = new Queue(QUEUE_NAME, { connection: redis });

// ============================================================================
// Environment Check (명세서 Section 2.1)
// ============================================================================

if (!process.env.DART_CRTFC_KEY) {
  console.warn('[Worker] ⚠️  WARNING: DART_CRTFC_KEY is not set. DART API calls will fail.');
}

// ============================================================================
// Worker Definition
// ============================================================================

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    console.log(`[Worker] 🔄 Processing Job: ${job.name} (ID: ${job.id})`);

    try {
      switch (job.name) {
        // ====================================================================
        // Section 9.1.1: SyncCorpMasterJob (corpCode.xml 동기화)
        // ====================================================================
        case 'SyncCorpMasterJob':
          console.log('[Worker] 📋 Syncing Corp Master (corpCode.xml)...');
          const corpStats = await syncCorpCodes();
          console.log(`[Worker] ✅ Corp Master: ${corpStats.added} added, ${corpStats.updated} updated`);
          return corpStats;

        // ====================================================================
        // Section 9.1.2: SyncFilingsJob (공시 목록)
        // ====================================================================
        case 'SyncFilingsJob': {
          const { corpCode, startDate, endDate, lastReportOnly, reportTypes } = job.data;
          console.log(`[Worker] 📄 Syncing Filings: ${corpCode} (${startDate} ~ ${endDate})`);

          const filingStats = await syncFilings({
            corpCode,
            startDate,
            endDate,
            lastReportOnly: lastReportOnly ?? true,
            reportTypes,
          });

          console.log(`[Worker] ✅ Filings: ${filingStats.total} synced`);
          return filingStats;
        }

        // ====================================================================
        // Section 9.1.3: FetchFinancialAllJob (전체 재무제표 - 핵심!)
        // ====================================================================
        case 'FetchFinancialAllJob': {
          const { corpCode, bsnsYear, reprtCode, fsDiv } = job.data;
          console.log(`[Worker] 💰 Fetching Financial All: ${corpCode} ${bsnsYear} ${reprtCode} ${fsDiv}`);

          const result = await fetchFinancialAll({
            corp_code: corpCode,
            bsns_year: bsnsYear,
            reprt_code: reprtCode,
            fs_div: fsDiv,
          });

          console.log(`[Worker] ✅ Financial All: ${result.rowCount} rows stored`);

          // Auto-trigger CurateTransformJob
          if (result.rowCount > 0) {
            await queue.add('CurateTransformJob', {
              corpCode,
              bsnsYear,
              reprtCode,
              fsDiv,
            });
            console.log('[Worker] 🔄 Auto-triggered CurateTransformJob');
          }

          return result;
        }

        // ====================================================================
        // Section 9.1.4: FetchFinancialKeyJob (주요계정)
        // ====================================================================
        case 'FetchFinancialKeyJob': {
          const { corpCode, bsnsYear, reprtCode } = job.data;
          console.log(`[Worker] 🔑 Fetching Financial Key: ${corpCode} ${bsnsYear} ${reprtCode}`);

          const result = await fetchFinancialKey({
            corp_code: corpCode,
            bsns_year: bsnsYear,
            reprt_code: reprtCode,
          });

          console.log(`[Worker] ✅ Financial Key: ${result.rowCount} rows (BS: ${result.hasBs}, IS: ${result.hasIs})`);
          return result;
        }

        // ====================================================================
        // Section 9.1.5: DownloadXbrlJob (XBRL 원문)
        // ====================================================================
        case 'DownloadXbrlJob': {
          const { rceptNo, reprtCode } = job.data;
          console.log(`[Worker] 📦 Downloading XBRL: ${rceptNo} ${reprtCode}`);

          // TODO: Implement XBRL download (Section 2.4.3)
          console.log('[Worker] ⚠️  XBRL download not yet implemented');
          return { status: 'NOT_IMPLEMENTED' };
        }

        // ====================================================================
        // Section 9.1.6: CurateTransformJob (Raw → Curated 변환)
        // ====================================================================
        case 'CurateTransformJob': {
          const { corpCode, bsnsYear, reprtCode, fsDiv } = job.data;
          console.log(`[Worker] 🔄 Curating: ${corpCode} ${bsnsYear} ${reprtCode} ${fsDiv}`);

          // Section 4: ETL/정규화 로직
          const { transformRawToCurated } = await import('./lib/curate');

          const result = await transformRawToCurated({
            corpCode,
            bsnsYear,
            reprtCode,
            fsDiv,
          });

          if (result.success) {
            console.log(`[Worker] ✅ Curated: ${result.rowsCreated}/${result.rowsProcessed} rows (coverage: ${result.coveragePercent.toFixed(1)}%)`);
          } else {
            console.error(`[Worker] ❌ Curate failed: ${result.errors.join(', ')}`);
          }

          return result;
        }

        // ====================================================================
        // Section 9.1.7: BuildModelSnapshotJob (3-Statement 모델 생성)
        // ====================================================================
        case 'BuildModelSnapshotJob': {
          const { entityId, baseYear, historicalYears, forecastYears } = job.data;
          console.log(`[Worker] 🏗️  Building Model Snapshot: ${entityId}`);
          console.log(`[Worker] Timeline: ${historicalYears}H + ${forecastYears}F years, base=${baseYear}`);

          // Import modeling functions
          const { buildSimpleModel, saveModelSnapshot } = await import('./lib/modeling');

          // Build model
          const modelOutput = await buildSimpleModel({
            entityId,
            baseYear: baseYear || 2024,
            historicalYears: historicalYears || 5,
            forecastYears: forecastYears || 5,
          });

          console.log(`[Worker] ✅ Model built: ${modelOutput.snapshotId}`);
          console.log(`[Worker] BS Balance Check: ${modelOutput.checks.bsBalanceCheck.passed ? '✅ PASS' : '❌ FAIL'}`);
          console.log(`[Worker] CF Tie-out Check: ${modelOutput.checks.cfTieOut.passed ? '✅ PASS' : '❌ FAIL'}`);

          // Save to database
          const saveResult = await saveModelSnapshot({
            entityId,
            snapshot: modelOutput,
          });

          if (!saveResult.success) {
            throw new Error(`Failed to save snapshot: ${saveResult.error}`);
          }

          console.log(`[Worker] 💾 Saved ${saveResult.linesCreated} output lines to DB`);

          return {
            snapshotId: saveResult.snapshotId,
            linesCreated: saveResult.linesCreated,
            checksPass: modelOutput.checks.bsBalanceCheck.passed && modelOutput.checks.cfTieOut.passed,
            bsBalanceCheck: {
              passed: modelOutput.checks.bsBalanceCheck.passed,
              error: modelOutput.checks.bsBalanceCheck.error.toString(),
            },
            cfTieOut: {
              passed: modelOutput.checks.cfTieOut.passed,
              error: modelOutput.checks.cfTieOut.error.toString(),
            },
          };
        }

        // ====================================================================
        // Section 9.1.8: BuildViewerSheetsJob (엑셀급 Viewer 시트 생성)
        // ====================================================================
        case 'BuildViewerSheetsJob': {
          const { snapshotId } = job.data;
          console.log(`[Worker] 📊 Building Viewer Sheets: ${snapshotId}`);

          // Import viewer functions
          const { buildSimpleModel } = await import('./lib/modeling');
          const { generateViewerSheets, saveViewerSheets } = await import('./lib/viewer');

          // Get the snapshot from database (need to reconstruct ModelSnapshotOutput)
          const snapshot = await prisma.modelSnapshot.findUnique({
            where: { id: snapshotId },
            include: {
              outputLines: {
                orderBy: [{ statementType: 'asc' }, { displayOrder: 'asc' }, { periodIndex: 'asc' }],
              },
              entity: true,
            },
          });

          if (!snapshot) {
            throw new Error(`Snapshot not found: ${snapshotId}`);
          }

          // For MVP, rebuild the model from entity to get full ModelSnapshotOutput
          // (In production, we'd reconstruct from outputLines directly)
          console.log(`[Worker] Rebuilding model for entity: ${snapshot.entityId}`);

          const modelOutput = await buildSimpleModel({
            entityId: snapshot.entityId,
            baseYear: 2024, // TODO: Extract from snapshot metadata
            historicalYears: 5,
            forecastYears: 5,
          });

          console.log(`[Worker] Generating viewer sheets...`);

          // Generate viewer sheets
          const viewerSheets = await generateViewerSheets(modelOutput);

          console.log(`[Worker] Generated ${viewerSheets.length} viewer sheets`);

          // Save to database
          const saveResult = await saveViewerSheets({
            snapshotId,
            sheets: viewerSheets,
          });

          if (!saveResult.success) {
            throw new Error(`Failed to save viewer sheets: ${saveResult.error}`);
          }

          console.log(`[Worker] ✅ Saved ${saveResult.sheetsCreated} viewer sheets to DB`);

          return {
            snapshotId,
            sheetsCreated: saveResult.sheetsCreated,
            sheetNames: viewerSheets.map((s) => s.sheetName),
          };
        }

        // ====================================================================
        // Section 9.1.9: RestatementMonitorJob (정정공시 탐지)
        // ====================================================================
        case 'RestatementMonitorJob': {
          console.log('[Worker] 🔍 Checking for restatements...');

          const { detectRestatements, recordRestatement, assessRestatementImpact, autoRebuildAffectedModels } =
            await import('./lib/quality');

          const { corpCode, fiscalYear, sinceDays = 7 } = job.data;

          const sinceDate = new Date();
          sinceDate.setDate(sinceDate.getDate() - sinceDays);

          // Detect restatements
          const restatements = await detectRestatements({
            corpCode,
            fiscalYear,
            sinceDate,
          });

          console.log(`[Worker] Found ${restatements.length} restatements`);

          // Process each restatement
          const processed: string[] = [];
          for (const event of restatements) {
            // Record to tracker table
            await recordRestatement(event);

            // Assess impact
            const impact = await assessRestatementImpact(event);

            console.log(
              `[Worker] Restatement ${event.corpCode} FY${event.fiscalYear}: ` +
                `Impact ${event.impactScore}, Snapshots affected: ${impact.snapshotsAffected.length}`
            );

            // Auto-rebuild if recommended
            if (impact.autoRebuildRecommended) {
              const rebuilt = await autoRebuildAffectedModels(event);
              console.log(`[Worker] Auto-rebuilt ${rebuilt.length} models`);
            }

            processed.push(event.id);
          }

          return {
            restarementsDetected: restatements.length,
            processed,
          };
          console.log('[Worker] ⚠️  Restatement monitoring not yet implemented');
          return { status: 'NOT_IMPLEMENTED' };
        }

        // ====================================================================
        // Batch Operations (Helper Jobs)
        // ====================================================================
        case 'FetchMultiYearFinancialsJob': {
          const { corpCode, years, reportCodes, fsDivs } = job.data;
          console.log(`[Worker] 📅 Fetching Multi-Year: ${corpCode} (${years.length} years)`);

          const stats = await fetchMultiYearFinancials({
            corpCode,
            years,
            reportCodes,
            fsDivs,
          });

          console.log(`[Worker] ✅ Multi-Year: ${stats.totalRows} total rows`);
          return stats;
        }

        case 'FetchQuarterlyFinancialsJob': {
          const { corpCode, year, quarters, fsDiv } = job.data;
          console.log(`[Worker] 📆 Fetching Quarterly: ${corpCode} ${year} Q${quarters.join(',')}`);

          const stats = await fetchQuarterlyFinancials({
            corpCode,
            year,
            quarters,
            fsDiv,
          });

          console.log(`[Worker] ✅ Quarterly: ${stats.totalRows} total rows`);
          return stats;
        }

        // ====================================================================
        // Stock Code Helper (종목코드 → corp_code 변환 후 처리)
        // ====================================================================
        case 'FetchByStockCodeJob': {
          const { stockCode, years } = job.data;
          console.log(`[Worker] 🔍 Fetching by stock code: ${stockCode}`);

          // 1. Get corp_code
          const corpCode = await getCorpCodeByStockCode(stockCode);

          if (!corpCode) {
            throw new Error(`Corp code not found for stock code: ${stockCode}`);
          }

          console.log(`[Worker] 📍 Found corp_code: ${corpCode}`);

          // 2. Fetch multi-year financials
          const stats = await fetchMultiYearFinancials({
            corpCode,
            years: years || [2020, 2021, 2022, 2023, 2024],
            reportCodes: ['11011'], // 사업보고서
            fsDivs: ['CFS', 'OFS'],
          });

          console.log(`[Worker] ✅ Stock ${stockCode}: ${stats.totalRows} rows fetched`);
          return { corpCode, ...stats };
        }

        // ====================================================================
        // Unknown Job Type
        // ====================================================================
        default:
          console.warn(`[Worker] ⚠️  Unknown job type: ${job.name}`);
          return { status: 'UNKNOWN_JOB_TYPE', name: job.name };
      }
    } catch (error: any) {
      console.error(`[Worker] ❌ Job ${job.name} failed:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3'), // 명세서 Section 9.2 - 동시성 제어
  }
);

// ============================================================================
// Event Handlers (명세서 Section 9.2 - 관측성)
// ============================================================================

worker.on('completed', (job) => {
  console.log(`[Worker] ✅ Job ${job.id} (${job.name}) completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] ❌ Job ${job?.id} (${job?.name}) failed: ${err.message}`);
});

worker.on('progress', (job, progress) => {
  console.log(`[Worker] 📊 Job ${job.id} progress: ${JSON.stringify(progress)}`);
});

worker.on('error', (err) => {
  console.error('[Worker] ⚠️  Worker error:', err);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGTERM', async () => {
  console.log('[Worker] 🛑 SIGTERM received, shutting down gracefully...');
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Worker] 🛑 SIGINT received, shutting down gracefully...');
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
  process.exit(0);
});

console.log(`[Worker] ✅ Worker listening on queue: ${QUEUE_NAME}`);
console.log('[Worker] 📝 Available job types:');
console.log('  - SyncCorpMasterJob');
console.log('  - SyncFilingsJob');
console.log('  - FetchFinancialAllJob ⭐');
console.log('  - FetchFinancialKeyJob');
console.log('  - DownloadXbrlJob');
console.log('  - CurateTransformJob');
console.log('  - BuildModelSnapshotJob');
console.log('  - BuildViewerSheetsJob');
console.log('  - RestatementMonitorJob');
console.log('  - FetchMultiYearFinancialsJob');
console.log('  - FetchQuarterlyFinancialsJob');
console.log('  - FetchByStockCodeJob');
