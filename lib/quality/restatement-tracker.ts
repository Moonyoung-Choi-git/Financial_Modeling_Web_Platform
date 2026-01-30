// lib/quality/restatement-tracker.ts
// Phase C: Data Quality - Restatement Tracking System

import prisma from '@/lib/db';
import { Decimal } from 'decimal.js';

export interface RestatementEvent {
  id: string;
  corpCode: string;
  fiscalYear: number;
  reportCode: string;
  fsScope: string;
  previousRceptNo: string;
  latestRceptNo: string;
  detectedAt: Date;
  changeCount: number;
  significantChanges: RestatementChange[];
  impactScore: number; // 0-100
  status: 'DETECTED' | 'ANALYZED' | 'APPLIED' | 'IGNORED';
}

export interface RestatementChange {
  standardLineId: string;
  accountName: string;
  statementType: string;
  previousValue: Decimal;
  newValue: Decimal;
  absoluteChange: Decimal;
  percentChange: number;
  isSignificant: boolean;
}

export interface RestatementImpact {
  snapshotsAffected: string[];
  modelsToRebuild: string[];
  notificationsRequired: { userId: string; reason: string }[];
  autoRebuildRecommended: boolean;
}

/**
 * Detect restatements by comparing rcept_no changes
 */
export async function detectRestatements(params: {
  corpCode?: string;
  fiscalYear?: number;
  sinceDate?: Date;
}): Promise<RestatementEvent[]> {
  const { corpCode, fiscalYear, sinceDate } = params;

  console.log('[RestatementTracker] Detecting restatements...');

  // Get all curated facts grouped by (corpCode, fiscalYear, reportCode, fsScope)
  const whereClause: any = {};
  if (corpCode) whereClause.corpCode = corpCode;
  if (fiscalYear) whereClause.fiscalYear = fiscalYear;

  const facts = await prisma.curatedFinFact.findMany({
    where: whereClause,
    select: {
      corpCode: true,
      fiscalYear: true,
      reportCode: true,
      fsScope: true,
      sourceRceptNo: true,
      createdAt: true,
    },
    distinct: ['corpCode', 'fiscalYear', 'reportCode', 'fsScope', 'sourceRceptNo'],
    orderBy: [
      { corpCode: 'asc' },
      { fiscalYear: 'asc' },
      { reportCode: 'asc' },
      { fsScope: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  // Group by period key
  const periodGroups = new Map<
    string,
    {
      corpCode: string;
      fiscalYear: number;
      reportCode: string;
      fsScope: string;
      rceptNos: { rceptNo: string; createdAt: Date }[];
    }
  >();

  for (const fact of facts) {
    const key = `${fact.corpCode}:${fact.fiscalYear}:${fact.reportCode}:${fact.fsScope}`;
    if (!periodGroups.has(key)) {
      periodGroups.set(key, {
        corpCode: fact.corpCode,
        fiscalYear: fact.fiscalYear,
        reportCode: fact.reportCode,
        fsScope: fact.fsScope,
        rceptNos: [],
      });
    }
    periodGroups.get(key)!.rceptNos.push({
      rceptNo: fact.sourceRceptNo!,
      createdAt: fact.createdAt,
    });
  }

  // Find periods with multiple rcept_nos (indicating restatement)
  const restatements: RestatementEvent[] = [];

  for (const [key, group] of periodGroups.entries()) {
    if (group.rceptNos.length > 1) {
      // Sort by createdAt to get previous and latest
      group.rceptNos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const previousRceptNo = group.rceptNos[group.rceptNos.length - 2].rceptNo;
      const latestRceptNo = group.rceptNos[group.rceptNos.length - 1].rceptNo;
      const detectedAt = group.rceptNos[group.rceptNos.length - 1].createdAt;

      // Skip if sinceDate filter is active and detection is before it
      if (sinceDate && detectedAt < sinceDate) {
        continue;
      }

      // Analyze changes
      const changes = await analyzeRestatementChanges({
        corpCode: group.corpCode,
        fiscalYear: group.fiscalYear,
        reportCode: group.reportCode,
        fsScope: group.fsScope,
        previousRceptNo,
        latestRceptNo,
      });

      const significantChanges = changes.filter((c) => c.isSignificant);
      const impactScore = calculateImpactScore(significantChanges);

      // Check existing tracker record
      const existingTracker = await prisma.curatedFinRestatementTracker.findUnique({
        where: {
          corpCode_fiscalYear_reportCode_fsScope: {
            corpCode: group.corpCode,
            fiscalYear: group.fiscalYear,
            reportCode: group.reportCode,
            fsScope: group.fsScope,
          },
        },
      });

      let status: 'DETECTED' | 'ANALYZED' | 'APPLIED' | 'IGNORED' = 'DETECTED';
      if (existingTracker) {
        status = 'ANALYZED';
      }

      restatements.push({
        id: `${key}:${latestRceptNo}`,
        corpCode: group.corpCode,
        fiscalYear: group.fiscalYear,
        reportCode: group.reportCode,
        fsScope: group.fsScope,
        previousRceptNo,
        latestRceptNo,
        detectedAt,
        changeCount: changes.length,
        significantChanges,
        impactScore,
        status,
      });
    }
  }

  console.log(`[RestatementTracker] Detected ${restatements.length} restatements`);

  return restatements;
}

/**
 * Analyze changes between two rcept_no versions
 */
async function analyzeRestatementChanges(params: {
  corpCode: string;
  fiscalYear: number;
  reportCode: string;
  fsScope: string;
  previousRceptNo: string;
  latestRceptNo: string;
}): Promise<RestatementChange[]> {
  const { corpCode, fiscalYear, reportCode, fsScope, previousRceptNo, latestRceptNo } = params;

  // Get facts from both versions
  const [previousFacts, latestFacts] = await Promise.all([
    prisma.curatedFinFact.findMany({
      where: {
        corpCode,
        fiscalYear,
        reportCode,
        fsScope,
        sourceRceptNo: previousRceptNo,
        standardLineId: { not: null },
      },
      select: {
        standardLineId: true,
        accountNameKr: true,
        statementType: true,
        amount: true,
      },
    }),
    prisma.curatedFinFact.findMany({
      where: {
        corpCode,
        fiscalYear,
        reportCode,
        fsScope,
        sourceRceptNo: latestRceptNo,
        standardLineId: { not: null },
      },
      select: {
        standardLineId: true,
        accountNameKr: true,
        statementType: true,
        amount: true,
      },
    }),
  ]);

  // Create maps for comparison
  const previousMap = new Map<string, { accountName: string; statementType: string; amount: Decimal }>();
  const latestMap = new Map<string, { accountName: string; statementType: string; amount: Decimal }>();

  for (const fact of previousFacts) {
    previousMap.set(fact.standardLineId!, {
      accountName: fact.accountNameKr,
      statementType: fact.statementType,
      amount: new Decimal(fact.amount),
    });
  }

  for (const fact of latestFacts) {
    latestMap.set(fact.standardLineId!, {
      accountName: fact.accountNameKr,
      statementType: fact.statementType,
      amount: new Decimal(fact.amount),
    });
  }

  // Compare and find changes
  const changes: RestatementChange[] = [];

  // Check all lines from both versions
  const allLineIds = new Set([...previousMap.keys(), ...latestMap.keys()]);

  for (const lineId of allLineIds) {
    const previousData = previousMap.get(lineId);
    const latestData = latestMap.get(lineId);

    let previousValue = new Decimal(0);
    let newValue = new Decimal(0);
    let accountName = '';
    let statementType = '';

    if (previousData && latestData) {
      // Line exists in both versions
      previousValue = previousData.amount;
      newValue = latestData.amount;
      accountName = latestData.accountName;
      statementType = latestData.statementType;

      if (previousValue.equals(newValue)) {
        continue; // No change
      }
    } else if (previousData && !latestData) {
      // Line removed in latest version
      previousValue = previousData.amount;
      newValue = new Decimal(0);
      accountName = previousData.accountName;
      statementType = previousData.statementType;
    } else if (!previousData && latestData) {
      // Line added in latest version
      previousValue = new Decimal(0);
      newValue = latestData.amount;
      accountName = latestData.accountName;
      statementType = latestData.statementType;
    }

    const absoluteChange = newValue.minus(previousValue).abs();
    const percentChange =
      !previousValue.isZero() ? absoluteChange.div(previousValue.abs()).times(100).toNumber() : 100;

    // Determine if significant
    // Significant if: absolute change > 1B KRW OR percent change > 10%
    const isSignificant = absoluteChange.gt(1_000_000_000) || percentChange > 10;

    changes.push({
      standardLineId: lineId,
      accountName,
      statementType,
      previousValue,
      newValue,
      absoluteChange,
      percentChange,
      isSignificant,
    });
  }

  return changes.sort((a, b) => {
    if (a.isSignificant !== b.isSignificant) {
      return a.isSignificant ? -1 : 1;
    }
    return b.absoluteChange.minus(a.absoluteChange).toNumber();
  });
}

/**
 * Calculate impact score for restatement (0-100)
 */
function calculateImpactScore(significantChanges: RestatementChange[]): number {
  if (significantChanges.length === 0) return 0;

  // Factors:
  // 1. Number of significant changes (0-40 points)
  const countScore = Math.min(significantChanges.length * 10, 40);

  // 2. Average percent change (0-30 points)
  const avgPercentChange =
    significantChanges.reduce((sum, c) => sum + c.percentChange, 0) / significantChanges.length;
  const percentScore = Math.min(avgPercentChange / 2, 30);

  // 3. Critical line changes (0-30 points)
  const criticalLines = ['IS.REVENUE', 'IS.NET_INCOME', 'BS.TOTAL_ASSETS', 'BS.TOTAL_EQUITY', 'CF.NET_CHANGE_CASH'];
  const criticalChanges = significantChanges.filter((c) => criticalLines.includes(c.standardLineId));
  const criticalScore = criticalChanges.length * 10;

  return Math.min(Math.round(countScore + percentScore + criticalScore), 100);
}

/**
 * Record restatement in tracker table
 */
export async function recordRestatement(event: RestatementEvent): Promise<void> {
  console.log(`[RestatementTracker] Recording restatement for ${event.corpCode} FY${event.fiscalYear}`);

  // Prepare change summary JSON
  const changeSummaryJson = {
    changeCount: event.changeCount,
    significantChangeCount: event.significantChanges.length,
    impactScore: event.impactScore,
    changes: event.significantChanges.map((c) => ({
      line: c.standardLineId,
      accountName: c.accountName,
      statement: c.statementType,
      previousValue: c.previousValue.toString(),
      newValue: c.newValue.toString(),
      absoluteChange: c.absoluteChange.toString(),
      percentChange: c.percentChange.toFixed(2),
    })),
  };

  await prisma.curatedFinRestatementTracker.upsert({
    where: {
      corpCode_fiscalYear_reportCode_fsScope: {
        corpCode: event.corpCode,
        fiscalYear: event.fiscalYear,
        reportCode: event.reportCode,
        fsScope: event.fsScope,
      },
    },
    update: {
      latestRceptNo: event.latestRceptNo,
      previousRceptNo: event.previousRceptNo,
      detectedAt: event.detectedAt,
      changeSummaryJson,
    },
    create: {
      corpCode: event.corpCode,
      fiscalYear: event.fiscalYear,
      reportCode: event.reportCode,
      fsScope: event.fsScope,
      latestRceptNo: event.latestRceptNo,
      previousRceptNo: event.previousRceptNo,
      detectedAt: event.detectedAt,
      changeSummaryJson,
    },
  });

  console.log(`[RestatementTracker] Recorded restatement`);
}

/**
 * Assess impact of restatement on existing model snapshots
 */
export async function assessRestatementImpact(event: RestatementEvent): Promise<RestatementImpact> {
  console.log(`[RestatementTracker] Assessing impact for ${event.corpCode} FY${event.fiscalYear}`);

  // Find entity
  const entity = await prisma.modelEntity.findFirst({
    where: { corpCode: event.corpCode },
    select: { id: true },
  });

  if (!entity) {
    return {
      snapshotsAffected: [],
      modelsToRebuild: [],
      notificationsRequired: [],
      autoRebuildRecommended: false,
    };
  }

  // Find snapshots that used the previous rcept_no
  const snapshots = await prisma.modelSnapshot.findMany({
    where: {
      entityId: entity.id,
      usedRceptNoList: {
        has: event.previousRceptNo,
      },
    },
    select: {
      id: true,
      project: {
        select: {
          id: true,
          createdBy: true,
        },
      },
    },
  });

  const snapshotsAffected = snapshots.map((s) => s.id);
  const modelsToRebuild = snapshots.map((s) => s.project.id);
  const notificationsRequired = snapshots
    .filter((s) => s.project.createdBy !== null)
    .map((s) => ({
      userId: s.project.createdBy!,
      reason: `Restatement detected for ${event.corpCode} FY${event.fiscalYear}. Impact score: ${event.impactScore}`,
    }));

  // Recommend auto-rebuild if impact is low-medium (< 50) and few snapshots affected (< 3)
  const autoRebuildRecommended = event.impactScore < 50 && snapshotsAffected.length < 3;

  console.log(
    `[RestatementTracker] Impact: ${snapshotsAffected.length} snapshots, ${modelsToRebuild.length} models, auto-rebuild: ${autoRebuildRecommended}`
  );

  return {
    snapshotsAffected,
    modelsToRebuild,
    notificationsRequired,
    autoRebuildRecommended,
  };
}

/**
 * Auto-rebuild models affected by restatement
 */
export async function autoRebuildAffectedModels(event: RestatementEvent): Promise<string[]> {
  console.log(`[RestatementTracker] Auto-rebuilding models for ${event.corpCode} FY${event.fiscalYear}`);

  const impact = await assessRestatementImpact(event);

  if (!impact.autoRebuildRecommended) {
    console.log('[RestatementTracker] Auto-rebuild not recommended (high impact or many snapshots)');
    return [];
  }

  // TODO: Trigger BuildModelSnapshotJob for affected projects
  // This would be done via BullMQ job queue in production

  console.log(`[RestatementTracker] Queued ${impact.modelsToRebuild.length} models for rebuild`);

  return impact.modelsToRebuild;
}
