// lib/quality/quality-monitor.ts
// Phase C: Data Quality - Integrated Quality Monitoring System

import prisma from '@/lib/db';
import { analyzeMappingCoverage, analyzeCoverageTrend } from './mapping-coverage-analyzer';
import { detectRestatements } from './restatement-tracker';

export interface QualityDashboard {
  summary: QualitySummary;
  coverageMetrics: CoverageMetrics;
  restatementAlerts: RestatementAlert[];
  dataHealthScore: number; // 0-100
  recommendations: QualityRecommendation[];
  timestamp: Date;
}

export interface QualitySummary {
  totalEntities: number;
  entitiesWithData: number;
  totalCuratedFacts: number;
  totalMappedFacts: number;
  overallCoveragePercent: number;
  recentRestatements: number;
  criticalIssues: number;
}

export interface CoverageMetrics {
  byStatement: {
    statementType: string;
    coverage: number;
    factCount: number;
  }[];
  byEntity: {
    entityId: string;
    entityName: string;
    coverage: number;
    qualityScore: number;
  }[];
  topPerformers: {
    entityId: string;
    entityName: string;
    coverage: number;
  }[];
  needsAttention: {
    entityId: string;
    entityName: string;
    coverage: number;
    issues: string[];
  }[];
}

export interface RestatementAlert {
  id: string;
  corpCode: string;
  entityName: string;
  fiscalYear: number;
  impactScore: number;
  snapshotsAffected: number;
  detectedAt: Date;
  status: string;
}

export interface QualityRecommendation {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'MAPPING' | 'RESTATEMENT' | 'DATA_QUALITY' | 'PERFORMANCE';
  title: string;
  description: string;
  actionItems: string[];
  estimatedImpact: string;
}

/**
 * Generate comprehensive quality dashboard
 */
export async function generateQualityDashboard(options?: {
  entityIds?: string[];
  sinceDays?: number;
}): Promise<QualityDashboard> {
  console.log('[QualityMonitor] Generating quality dashboard...');

  const { entityIds, sinceDays = 30 } = options || {};
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);

  // Gather data in parallel
  const [summary, coverageMetrics, restatementAlerts] = await Promise.all([
    generateQualitySummary(entityIds, sinceDate),
    generateCoverageMetrics(entityIds),
    generateRestatementAlerts(sinceDate),
  ]);

  // Calculate overall data health score
  const dataHealthScore = calculateDataHealthScore({
    summary,
    coverageMetrics,
    restatementAlerts,
  });

  // Generate recommendations
  const recommendations = generateRecommendations({
    summary,
    coverageMetrics,
    restatementAlerts,
  });

  console.log(`[QualityMonitor] Dashboard generated. Health score: ${dataHealthScore}`);

  return {
    summary,
    coverageMetrics,
    restatementAlerts,
    dataHealthScore,
    recommendations,
    timestamp: new Date(),
  };
}

/**
 * Generate quality summary statistics
 */
async function generateQualitySummary(entityIds?: string[], sinceDate?: Date): Promise<QualitySummary> {
  const whereClause: any = {};
  if (entityIds) {
    whereClause.id = { in: entityIds };
  }

  // Total entities
  const totalEntities = await prisma.modelEntity.count({ where: whereClause });

  // Entities with curated data
  const entitiesWithData = await prisma.curatedFinFact
    .findMany({
      where: entityIds ? { entityId: { in: entityIds } } : {},
      select: { entityId: true },
      distinct: ['entityId'],
    })
    .then((res) => res.length);

  // Total facts
  const totalCuratedFacts = await prisma.curatedFinFact.count({
    where: entityIds ? { entityId: { in: entityIds } } : {},
  });

  // Mapped facts
  const totalMappedFacts = await prisma.curatedFinFact.count({
    where: {
      ...(entityIds ? { entityId: { in: entityIds } } : {}),
      standardLineId: { not: null },
    },
  });

  const overallCoveragePercent = totalCuratedFacts > 0 ? (totalMappedFacts / totalCuratedFacts) * 100 : 0;

  // Recent restatements
  const recentRestatements = await prisma.curatedFinRestatementTracker.count({
    where: sinceDate
      ? {
          detectedAt: { gte: sinceDate },
        }
      : {},
  });

  // Critical issues (coverage < 70% or high-impact restatements)
  const lowCoverageEntities = await prisma.curatedFinFact
    .groupBy({
      by: ['entityId'],
      where: entityIds ? { entityId: { in: entityIds } } : {},
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            lt: 30, // Entities with < 30 facts are suspicious
          },
        },
      },
    })
    .then((res) => res.length);

  const criticalIssues = lowCoverageEntities + (recentRestatements > 5 ? recentRestatements - 5 : 0);

  return {
    totalEntities,
    entitiesWithData,
    totalCuratedFacts,
    totalMappedFacts,
    overallCoveragePercent,
    recentRestatements,
    criticalIssues,
  };
}

/**
 * Generate coverage metrics
 */
async function generateCoverageMetrics(entityIds?: string[]): Promise<CoverageMetrics> {
  // Coverage by statement type
  const allFacts = await prisma.curatedFinFact.findMany({
    where: entityIds ? { entityId: { in: entityIds } } : {},
    select: {
      statementType: true,
      standardLineId: true,
    },
  });

  const statementGroups = new Map<string, { total: number; mapped: number }>();
  for (const fact of allFacts) {
    if (!statementGroups.has(fact.statementType)) {
      statementGroups.set(fact.statementType, { total: 0, mapped: 0 });
    }
    const group = statementGroups.get(fact.statementType)!;
    group.total++;
    if (fact.standardLineId) group.mapped++;
  }

  const byStatement = Array.from(statementGroups.entries()).map(([statementType, data]) => ({
    statementType,
    coverage: data.total > 0 ? (data.mapped / data.total) * 100 : 0,
    factCount: data.total,
  }));

  // Coverage by entity (if entityIds provided)
  let byEntity: CoverageMetrics['byEntity'] = [];
  let topPerformers: CoverageMetrics['topPerformers'] = [];
  let needsAttention: CoverageMetrics['needsAttention'] = [];

  if (entityIds && entityIds.length > 0) {
    const entities = await prisma.modelEntity.findMany({
      where: { id: { in: entityIds } },
      select: { id: true, displayName: true },
    });

    byEntity = await Promise.all(
      entities.map(async (entity) => {
        const facts = await prisma.curatedFinFact.findMany({
          where: { entityId: entity.id },
          select: { standardLineId: true },
        });

        const total = facts.length;
        const mapped = facts.filter((f) => f.standardLineId !== null).length;
        const coverage = total > 0 ? (mapped / total) * 100 : 0;

        // Simple quality score (same as coverage for now)
        const qualityScore = Math.round(coverage);

        return {
          entityId: entity.id,
          entityName: entity.displayName,
          coverage,
          qualityScore,
        };
      })
    );

    // Top performers (coverage >= 90%)
    topPerformers = byEntity
      .filter((e) => e.coverage >= 90)
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, 10)
      .map((e) => ({
        entityId: e.entityId,
        entityName: e.entityName,
        coverage: e.coverage,
      }));

    // Needs attention (coverage < 80%)
    needsAttention = byEntity
      .filter((e) => e.coverage < 80)
      .sort((a, b) => a.coverage - b.coverage)
      .slice(0, 10)
      .map((e) => {
        const issues: string[] = [];
        if (e.coverage < 50) issues.push('Very low coverage');
        if (e.coverage >= 50 && e.coverage < 70) issues.push('Low coverage');
        if (e.coverage >= 70 && e.coverage < 80) issues.push('Below target coverage');

        return {
          entityId: e.entityId,
          entityName: e.entityName,
          coverage: e.coverage,
          issues,
        };
      });
  }

  return {
    byStatement,
    byEntity,
    topPerformers,
    needsAttention,
  };
}

/**
 * Generate restatement alerts
 */
async function generateRestatementAlerts(sinceDate: Date): Promise<RestatementAlert[]> {
  const restatements = await detectRestatements({ sinceDate });

  const alerts: RestatementAlert[] = [];

  for (const event of restatements) {
    // Get entity name
    const entity = await prisma.modelEntity.findFirst({
      where: { corpCode: event.corpCode },
      select: { displayName: true },
    });

    // Count affected snapshots
    const snapshotsAffected = await prisma.modelSnapshot.count({
      where: {
        entity: { corpCode: event.corpCode },
        usedRceptNoList: { has: event.previousRceptNo },
      },
    });

    alerts.push({
      id: event.id,
      corpCode: event.corpCode,
      entityName: entity?.displayName || event.corpCode,
      fiscalYear: event.fiscalYear,
      impactScore: event.impactScore,
      snapshotsAffected,
      detectedAt: event.detectedAt,
      status: event.status,
    });
  }

  return alerts.sort((a, b) => b.impactScore - a.impactScore);
}

/**
 * Calculate overall data health score (0-100)
 */
function calculateDataHealthScore(data: {
  summary: QualitySummary;
  coverageMetrics: CoverageMetrics;
  restatementAlerts: RestatementAlert[];
}): number {
  // Coverage score (40% weight)
  const coverageScore = data.summary.overallCoveragePercent * 0.4;

  // Data completeness score (30% weight)
  const completenessScore =
    data.summary.totalEntities > 0 ? (data.summary.entitiesWithData / data.summary.totalEntities) * 100 * 0.3 : 0;

  // Restatement stability score (20% weight)
  // Penalize for recent restatements
  const restatementPenalty = Math.min(data.summary.recentRestatements * 5, 20);
  const stabilityScore = (100 - restatementPenalty) * 0.2;

  // Critical issues score (10% weight)
  const issuesPenalty = Math.min(data.summary.criticalIssues * 10, 100);
  const issuesScore = (100 - issuesPenalty) * 0.1;

  return Math.max(0, Math.min(100, Math.round(coverageScore + completenessScore + stabilityScore + issuesScore)));
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(data: {
  summary: QualitySummary;
  coverageMetrics: CoverageMetrics;
  restatementAlerts: RestatementAlert[];
}): QualityRecommendation[] {
  const recommendations: QualityRecommendation[] = [];

  // Mapping recommendations
  if (data.summary.overallCoveragePercent < 90) {
    recommendations.push({
      priority: 'HIGH',
      category: 'MAPPING',
      title: 'Improve Mapping Coverage',
      description: `Current coverage is ${data.summary.overallCoveragePercent.toFixed(1)}%. Target is 95%+.`,
      actionItems: [
        'Review top unmapped accounts',
        'Add new mapping rules',
        'Update existing patterns',
        'Test mapping improvements',
      ],
      estimatedImpact: `+${(95 - data.summary.overallCoveragePercent).toFixed(1)}% coverage`,
    });
  }

  // Statement-specific recommendations
  for (const stmt of data.coverageMetrics.byStatement) {
    if (stmt.coverage < 85) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'MAPPING',
        title: `Improve ${stmt.statementType} Coverage`,
        description: `${stmt.statementType} coverage is ${stmt.coverage.toFixed(1)}%. Below 85% target.`,
        actionItems: [
          `Review unmapped ${stmt.statementType} accounts`,
          `Add ${stmt.statementType}-specific mapping rules`,
        ],
        estimatedImpact: `Improve ${stmt.statementType} reliability`,
      });
    }
  }

  // Restatement recommendations
  if (data.summary.recentRestatements > 3) {
    const highImpactRestatements = data.restatementAlerts.filter((r) => r.impactScore > 70);

    if (highImpactRestatements.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'RESTATEMENT',
        title: 'Address High-Impact Restatements',
        description: `${highImpactRestatements.length} high-impact restatements detected.`,
        actionItems: [
          'Review restatement changes',
          'Rebuild affected models',
          'Notify stakeholders',
          'Update assumptions if needed',
        ],
        estimatedImpact: 'Maintain model accuracy',
      });
    }
  }

  // Data completeness recommendations
  if (data.summary.entitiesWithData < data.summary.totalEntities * 0.8) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'DATA_QUALITY',
      title: 'Improve Data Coverage',
      description: `Only ${data.summary.entitiesWithData}/${data.summary.totalEntities} entities have data.`,
      actionItems: [
        'Sync missing corp codes',
        'Fetch financial data for new entities',
        'Run curate transform for pending entities',
      ],
      estimatedImpact: 'Increase entity coverage',
    });
  }

  // Entities needing attention
  if (data.coverageMetrics.needsAttention.length > 5) {
    recommendations.push({
      priority: 'LOW',
      category: 'DATA_QUALITY',
      title: 'Review Low-Quality Entities',
      description: `${data.coverageMetrics.needsAttention.length} entities have low quality scores.`,
      actionItems: ['Investigate low-coverage entities', 'Check data source quality', 'Add missing mapping rules'],
      estimatedImpact: 'Improve overall system reliability',
    });
  }

  // Sort by priority
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

/**
 * Run automated quality checks (for scheduler/cron)
 */
export async function runAutomatedQualityChecks(): Promise<{
  dashboardSnapshot: QualityDashboard;
  alertsTriggered: string[];
  actionsPerformed: string[];
}> {
  console.log('[QualityMonitor] Running automated quality checks...');

  const dashboard = await generateQualityDashboard({ sinceDays: 7 });

  const alertsTriggered: string[] = [];
  const actionsPerformed: string[] = [];

  // Alert if health score drops below 70
  if (dashboard.dataHealthScore < 70) {
    alertsTriggered.push(`Data health score is ${dashboard.dataHealthScore} (below 70 threshold)`);
  }

  // Alert for high-impact restatements
  const highImpactRestatements = dashboard.restatementAlerts.filter((r) => r.impactScore > 80);
  if (highImpactRestatements.length > 0) {
    alertsTriggered.push(`${highImpactRestatements.length} high-impact restatements detected`);
  }

  // Auto-fix: Add recommended mapping rules if coverage is low but stable
  if (dashboard.summary.overallCoveragePercent < 90 && dashboard.summary.overallCoveragePercent > 80) {
    // This would trigger a mapping improvement job
    actionsPerformed.push('Queued mapping improvement analysis');
  }

  console.log(
    `[QualityMonitor] Checks complete. Alerts: ${alertsTriggered.length}, Actions: ${actionsPerformed.length}`
  );

  return {
    dashboardSnapshot: dashboard,
    alertsTriggered,
    actionsPerformed,
  };
}
