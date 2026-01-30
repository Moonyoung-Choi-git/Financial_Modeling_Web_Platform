// lib/quality/mapping-coverage-analyzer.ts
// Phase C: Data Quality - Mapping Coverage Analysis

import prisma from '@/lib/db';
import { Decimal } from 'decimal.js';

export interface CoverageReport {
  entityId: string;
  corpCode: string;
  fiscalYear: number;
  reportCode: string;
  fsScope: string;
  totalLines: number;
  mappedLines: number;
  unmappedLines: number;
  coveragePercent: number;
  byStatement: {
    statementType: string;
    total: number;
    mapped: number;
    coverage: number;
  }[];
  topUnmapped: {
    accountNm: string;
    accountId: string | null;
    statementType: string;
    occurrences: number;
    avgAmount: Decimal;
  }[];
  qualityScore: number; // 0-100
  timestamp: Date;
}

export interface CoverageTrend {
  entityId: string;
  periods: {
    fiscalYear: number;
    reportCode: string;
    coveragePercent: number;
  }[];
  averageCoverage: number;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

/**
 * Analyze mapping coverage for a specific entity/period
 */
export async function analyzeMappingCoverage(params: {
  entityId: string;
  fiscalYear: number;
  reportCode: string;
  fsScope: string;
}): Promise<CoverageReport> {
  const { entityId, fiscalYear, reportCode, fsScope } = params;

  console.log(`[CoverageAnalyzer] Analyzing coverage for ${entityId}, FY${fiscalYear}`);

  // Get entity info
  const entity = await prisma.modelEntity.findUnique({
    where: { id: entityId },
    select: { corpCode: true, displayName: true },
  });

  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  // Get all curated facts for this period
  const facts = await prisma.curatedFinFact.findMany({
    where: {
      entityId,
      fiscalYear,
      reportCode,
      fsScope,
    },
    select: {
      id: true,
      statementType: true,
      accountNameKr: true,
      accountSourceId: true,
      standardLineId: true,
      amount: true,
    },
  });

  const totalLines = facts.length;
  const mappedLines = facts.filter((f) => f.standardLineId !== null).length;
  const unmappedLines = totalLines - mappedLines;
  const coveragePercent = totalLines > 0 ? (mappedLines / totalLines) * 100 : 0;

  // Coverage by statement type
  const statementTypes = ['IS', 'BS', 'CF', 'CIS', 'SCE'];
  const byStatement = statementTypes.map((statementType) => {
    const stmtFacts = facts.filter((f) => f.statementType === statementType);
    const total = stmtFacts.length;
    const mapped = stmtFacts.filter((f) => f.standardLineId !== null).length;
    const coverage = total > 0 ? (mapped / total) * 100 : 0;

    return {
      statementType,
      total,
      mapped,
      coverage,
    };
  });

  // Top unmapped accounts
  const unmappedFacts = facts.filter((f) => f.standardLineId === null);
  const unmappedGrouped = new Map<
    string,
    {
      accountNm: string;
      accountId: string | null;
      statementType: string;
      amounts: Decimal[];
    }
  >();

  for (const fact of unmappedFacts) {
    const key = `${fact.statementType}:${fact.accountNameKr}`;
    if (!unmappedGrouped.has(key)) {
      unmappedGrouped.set(key, {
        accountNm: fact.accountNameKr,
        accountId: fact.accountSourceId,
        statementType: fact.statementType,
        amounts: [],
      });
    }
    unmappedGrouped.get(key)!.amounts.push(new Decimal(fact.amount));
  }

  const topUnmapped = Array.from(unmappedGrouped.entries())
    .map(([_, data]) => {
      const avgAmount = data.amounts.reduce((sum, amt) => sum.plus(amt), new Decimal(0)).div(data.amounts.length);
      return {
        accountNm: data.accountNm,
        accountId: data.accountId,
        statementType: data.statementType,
        occurrences: data.amounts.length,
        avgAmount,
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 20);

  // Quality score calculation (0-100)
  // Based on: coverage (70%), statement balance (20%), data completeness (10%)
  const qualityScore = calculateQualityScore({
    coveragePercent,
    byStatement,
    totalLines,
  });

  console.log(`[CoverageAnalyzer] Coverage: ${coveragePercent.toFixed(2)}%, Quality: ${qualityScore}`);

  return {
    entityId,
    corpCode: entity.corpCode,
    fiscalYear,
    reportCode,
    fsScope,
    totalLines,
    mappedLines,
    unmappedLines,
    coveragePercent,
    byStatement,
    topUnmapped,
    qualityScore,
    timestamp: new Date(),
  };
}

/**
 * Calculate overall quality score
 */
function calculateQualityScore(data: {
  coveragePercent: number;
  byStatement: { statementType: string; total: number; mapped: number; coverage: number }[];
  totalLines: number;
}): number {
  // Coverage score (70% weight)
  const coverageScore = data.coveragePercent * 0.7;

  // Statement balance score (20% weight)
  // Penalize if any statement has < 80% coverage
  const statementBalance = data.byStatement
    .filter((s) => s.total > 0)
    .map((s) => (s.coverage >= 80 ? 100 : s.coverage))
    .reduce((sum, score) => sum + score, 0);
  const statementBalanceScore = (statementBalance / data.byStatement.filter((s) => s.total > 0).length) * 0.2;

  // Data completeness score (10% weight)
  // Penalize if total lines < expected minimum (e.g., 30 lines)
  const completenessScore = Math.min(data.totalLines / 30, 1) * 100 * 0.1;

  return Math.round(coverageScore + statementBalanceScore + completenessScore);
}

/**
 * Analyze coverage trend over time
 */
export async function analyzeCoverageTrend(entityId: string, periods: number = 5): Promise<CoverageTrend> {
  console.log(`[CoverageAnalyzer] Analyzing trend for ${entityId}, last ${periods} periods`);

  // Get recent periods
  const facts = await prisma.curatedFinFact.findMany({
    where: { entityId },
    select: {
      fiscalYear: true,
      reportCode: true,
      standardLineId: true,
    },
    distinct: ['fiscalYear', 'reportCode'],
    orderBy: [{ fiscalYear: 'desc' }, { reportCode: 'asc' }],
    take: periods * 4, // Assume up to 4 reports per year
  });

  // Group by period
  const periodMap = new Map<string, { total: number; mapped: number }>();
  for (const fact of facts) {
    const key = `${fact.fiscalYear}:${fact.reportCode}`;
    if (!periodMap.has(key)) {
      periodMap.set(key, { total: 0, mapped: 0 });
    }
    const period = periodMap.get(key)!;
    period.total++;
    if (fact.standardLineId !== null) {
      period.mapped++;
    }
  }

  // Calculate coverage per period
  const periodCoverages = Array.from(periodMap.entries())
    .map(([key, data]) => {
      const [fiscalYearStr, reportCode] = key.split(':');
      const fiscalYear = parseInt(fiscalYearStr);
      const coveragePercent = data.total > 0 ? (data.mapped / data.total) * 100 : 0;
      return { fiscalYear, reportCode, coveragePercent };
    })
    .sort((a, b) => {
      if (a.fiscalYear !== b.fiscalYear) return a.fiscalYear - b.fiscalYear;
      return a.reportCode.localeCompare(b.reportCode);
    });

  const averageCoverage =
    periodCoverages.reduce((sum, p) => sum + p.coveragePercent, 0) / (periodCoverages.length || 1);

  // Determine trend
  let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' = 'STABLE';
  if (periodCoverages.length >= 3) {
    const recent = periodCoverages.slice(-3).map((p) => p.coveragePercent);
    const slope = (recent[2] - recent[0]) / 2;
    if (slope > 2) trend = 'IMPROVING';
    else if (slope < -2) trend = 'DECLINING';
  }

  console.log(`[CoverageAnalyzer] Average coverage: ${averageCoverage.toFixed(2)}%, Trend: ${trend}`);

  return {
    entityId,
    periods: periodCoverages,
    averageCoverage,
    trend,
  };
}

/**
 * Generate mapping recommendations for unmapped accounts
 */
export async function generateMappingRecommendations(params: {
  entityId: string;
  fiscalYear?: number;
  limit?: number;
}): Promise<
  {
    accountNm: string;
    accountId: string | null;
    statementType: string;
    occurrences: number;
    recommendedMappings: {
      standardLineId: string;
      confidence: number;
      reason: string;
    }[];
  }[]
> {
  const { entityId, fiscalYear, limit = 10 } = params;

  console.log(`[CoverageAnalyzer] Generating recommendations for ${entityId}`);

  // Get unmapped facts
  const whereClause: any = {
    entityId,
    standardLineId: null,
  };
  if (fiscalYear) {
    whereClause.fiscalYear = fiscalYear;
  }

  const unmappedFacts = await prisma.curatedFinFact.findMany({
    where: whereClause,
    select: {
      accountNameKr: true,
      accountSourceId: true,
      statementType: true,
    },
  });

  // Group by account
  const accountGroups = new Map<
    string,
    {
      accountNm: string;
      accountId: string | null;
      statementType: string;
      occurrences: number;
    }
  >();

  for (const fact of unmappedFacts) {
    const key = `${fact.statementType}:${fact.accountNameKr}`;
    if (!accountGroups.has(key)) {
      accountGroups.set(key, {
        accountNm: fact.accountNameKr,
        accountId: fact.accountSourceId,
        statementType: fact.statementType,
        occurrences: 0,
      });
    }
    accountGroups.get(key)!.occurrences++;
  }

  // Get top accounts by occurrences
  const topAccounts = Array.from(accountGroups.values())
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, limit);

  // Get all existing mapping rules for reference
  const existingRules = await prisma.curatedFinAccountMapping.findMany({
    select: {
      standardLineId: true,
      accountNameKr: true,
      accountSourceId: true,
      statementType: true,
    },
  });

  // Generate recommendations using fuzzy matching
  const recommendations = topAccounts.map((account) => {
    const recs = findSimilarMappings(account, existingRules);
    return {
      ...account,
      recommendedMappings: recs.slice(0, 3), // Top 3 recommendations
    };
  });

  console.log(`[CoverageAnalyzer] Generated ${recommendations.length} recommendations`);

  return recommendations;
}

/**
 * Find similar mappings using fuzzy matching
 */
function findSimilarMappings(
  account: {
    accountNm: string;
    statementType: string;
  },
  existingRules: {
    standardLineId: string;
    accountNameKr: string | null;
    accountSourceId: string | null;
    statementType: string | null;
  }[]
): { standardLineId: string; confidence: number; reason: string }[] {
  const similarities: { standardLineId: string; confidence: number; reason: string }[] = [];

  for (const rule of existingRules) {
    // Skip if statement type doesn't match
    if (rule.statementType && rule.statementType !== account.statementType) {
      continue;
    }

    // Skip if no pattern to match
    if (!rule.accountNameKr) {
      continue;
    }

    // Calculate similarity
    const pattern = rule.accountNameKr.toLowerCase();
    const accountName = account.accountNm.toLowerCase();

    let confidence = 0;
    let reason = '';

    // Exact match
    if (pattern === accountName) {
      confidence = 100;
      reason = 'Exact match';
    }
    // Contains match
    else if (accountName.includes(pattern)) {
      confidence = 80;
      reason = `Contains "${pattern}"`;
    }
    // Partial match
    else if (pattern.includes(accountName)) {
      confidence = 70;
      reason = `Partial match with "${pattern}"`;
    }
    // Keyword match (for common terms)
    else if (hasCommonKeywords(accountName, pattern)) {
      confidence = 60;
      reason = 'Common keywords';
    }

    if (confidence > 0) {
      similarities.push({
        standardLineId: rule.standardLineId,
        confidence,
        reason,
      });
    }
  }

  return similarities.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Check if two strings have common important keywords
 */
function hasCommonKeywords(str1: string, str2: string): boolean {
  const importantKeywords = [
    '매출',
    '비용',
    '이익',
    '자산',
    '부채',
    '자본',
    '현금',
    '재고',
    '채권',
    '감가상각',
    '영업',
    '투자',
    '재무',
  ];

  for (const keyword of importantKeywords) {
    if (str1.includes(keyword) && str2.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Batch analyze coverage for multiple entities
 */
export async function batchAnalyzeCoverage(
  entityIds: string[],
  fiscalYear: number,
  reportCode: string = '11011',
  fsScope: string = 'CFS'
): Promise<CoverageReport[]> {
  console.log(`[CoverageAnalyzer] Batch analyzing ${entityIds.length} entities`);

  const reports: CoverageReport[] = [];

  for (const entityId of entityIds) {
    try {
      const report = await analyzeMappingCoverage({
        entityId,
        fiscalYear,
        reportCode,
        fsScope,
      });
      reports.push(report);
    } catch (error) {
      console.error(`[CoverageAnalyzer] Error analyzing ${entityId}:`, error);
    }
  }

  return reports;
}
