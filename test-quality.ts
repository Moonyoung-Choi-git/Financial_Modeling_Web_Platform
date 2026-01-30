// test-quality.ts
// Phase C: Data Quality Testing Script

import {
  generateQualityDashboard,
  analyzeMappingCoverage,
  analyzeCoverageTrend,
  generateMappingRecommendations,
  detectRestatements,
} from './lib/quality';
import prisma from './lib/db';

const separator = '='.repeat(80);

async function main() {
  console.log(separator);
  console.log('FMWP Data Quality Testing');
  console.log(separator);

  try {
    // Find first entity with data
    const entity = await prisma.modelEntity.findFirst({
      include: {
        _count: {
          select: { facts: true },
        },
      },
      where: {
        facts: {
          some: {},
        },
      },
    });

    if (!entity) {
      console.log('❌ No entities with curated facts found');
      console.log('💡 Run: npx tsx test-generate-mock-facts.ts first');
      return;
    }

    console.log(`✅ Using entity: ${entity.displayName} (${entity.corpCode})`);
    console.log(`   Entity ID: ${entity.id}`);
    console.log(`   Curated Facts: ${entity._count.facts}`);
    console.log();

    // Test 1: Quality Dashboard
    console.log('[1/5] Testing Quality Dashboard...\n');
    const dashboard = await generateQualityDashboard({ sinceDays: 30 });

    console.log('📊 Quality Dashboard:');
    console.log('   Data Health Score:', dashboard.dataHealthScore, '/100');
    console.log();
    console.log('   Summary:');
    console.log('   - Total Entities:', dashboard.summary.totalEntities);
    console.log('   - Entities with Data:', dashboard.summary.entitiesWithData);
    console.log('   - Total Curated Facts:', dashboard.summary.totalCuratedFacts);
    console.log('   - Mapped Facts:', dashboard.summary.totalMappedFacts);
    console.log('   - Overall Coverage:', dashboard.summary.overallCoveragePercent.toFixed(2) + '%');
    console.log('   - Recent Restatements:', dashboard.summary.recentRestatements);
    console.log('   - Critical Issues:', dashboard.summary.criticalIssues);
    console.log();

    console.log('   Coverage by Statement:');
    for (const stmt of dashboard.coverageMetrics.byStatement) {
      if (stmt.factCount > 0) {
        console.log(`   - ${stmt.statementType}: ${stmt.coverage.toFixed(1)}% (${stmt.factCount} facts)`);
      }
    }
    console.log();

    if (dashboard.recommendations.length > 0) {
      console.log('   Recommendations:');
      for (const rec of dashboard.recommendations.slice(0, 3)) {
        console.log(`   - [${rec.priority}] ${rec.title}`);
        console.log(`     ${rec.description}`);
      }
    }
    console.log();

    // Test 2: Coverage Analysis
    console.log('[2/5] Testing Coverage Analysis...\n');

    // Get recent fiscal year
    const recentFact = await prisma.curatedFinFact.findFirst({
      where: { entityId: entity.id },
      orderBy: { fiscalYear: 'desc' },
      select: { fiscalYear: true },
    });

    if (recentFact) {
      const coverageReport = await analyzeMappingCoverage({
        entityId: entity.id,
        fiscalYear: recentFact.fiscalYear,
        reportCode: '11011',
        fsScope: 'CFS',
      });

      console.log('📈 Coverage Analysis:');
      console.log(`   FY${coverageReport.fiscalYear} ${coverageReport.reportCode} ${coverageReport.fsScope}`);
      console.log(`   Total Lines: ${coverageReport.totalLines}`);
      console.log(`   Mapped Lines: ${coverageReport.mappedLines}`);
      console.log(`   Coverage: ${coverageReport.coveragePercent.toFixed(2)}%`);
      console.log(`   Quality Score: ${coverageReport.qualityScore}/100`);
      console.log();

      console.log('   By Statement:');
      for (const stmt of coverageReport.byStatement) {
        if (stmt.total > 0) {
          console.log(`   - ${stmt.statementType}: ${stmt.coverage.toFixed(1)}% (${stmt.mapped}/${stmt.total})`);
        }
      }
      console.log();

      if (coverageReport.topUnmapped.length > 0) {
        console.log(`   Top Unmapped Accounts (${coverageReport.topUnmapped.length}):`);
        for (const acc of coverageReport.topUnmapped.slice(0, 5)) {
          console.log(`   - [${acc.statementType}] ${acc.accountNm} (${acc.occurrences}x)`);
        }
        console.log();
      }
    }

    // Test 3: Coverage Trend
    console.log('[3/5] Testing Coverage Trend...\n');

    const trend = await analyzeCoverageTrend(entity.id, 5);

    console.log('📊 Coverage Trend:');
    console.log(`   Periods Analyzed: ${trend.periods.length}`);
    console.log(`   Average Coverage: ${trend.averageCoverage.toFixed(2)}%`);
    console.log(`   Trend: ${trend.trend}`);
    console.log();

    if (trend.periods.length > 0) {
      console.log('   By Period:');
      for (const period of trend.periods.slice(0, 5)) {
        console.log(`   - FY${period.fiscalYear} ${period.reportCode}: ${period.coveragePercent.toFixed(1)}%`);
      }
      console.log();
    }

    // Test 4: Mapping Recommendations
    console.log('[4/5] Testing Mapping Recommendations...\n');

    const recommendations = await generateMappingRecommendations({
      entityId: entity.id,
      limit: 5,
    });

    console.log('💡 Mapping Recommendations:');
    if (recommendations.length === 0) {
      console.log('   ✅ All accounts mapped! No recommendations needed.\n');
    } else {
      for (const rec of recommendations) {
        console.log(`   - [${rec.statementType}] ${rec.accountNm}`);
        console.log(`     Occurrences: ${rec.occurrences}`);
        if (rec.recommendedMappings.length > 0) {
          const top = rec.recommendedMappings[0];
          console.log(`     Suggested: ${top.standardLineId} (${top.confidence}% - ${top.reason})`);
        }
      }
      console.log();
    }

    // Test 5: Restatement Detection
    console.log('[5/5] Testing Restatement Detection...\n');

    const restatements = await detectRestatements({
      sinceDays: 90,
    });

    console.log('🔍 Restatement Detection:');
    console.log(`   Restatements Found: ${restatements.length}`);

    if (restatements.length > 0) {
      console.log();
      for (const event of restatements.slice(0, 3)) {
        console.log(`   - ${event.corpCode} FY${event.fiscalYear} ${event.reportCode}`);
        console.log(`     Impact Score: ${event.impactScore}/100`);
        console.log(`     Changes: ${event.changeCount} total, ${event.significantChanges.length} significant`);
        console.log(`     Status: ${event.status}`);
      }
    } else {
      console.log('   ✅ No restatements detected in the last 90 days.');
    }
    console.log();

    console.log(separator);
    console.log('✅ Data Quality tests completed successfully!');
    console.log(separator);
    console.log();
    console.log('💡 Next steps:');
    console.log('   - View dashboard: http://localhost:3000/api/quality/dashboard');
    console.log('   - View coverage: http://localhost:3000/api/quality/coverage?entityId=' + entity.id);
    console.log('   - View restatements: http://localhost:3000/api/quality/restatements');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
