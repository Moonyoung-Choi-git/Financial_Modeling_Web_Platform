// app/api/quality/coverage/route.ts
// Phase C: Coverage Analysis API

import { NextResponse } from 'next/server';
import { analyzeMappingCoverage, analyzeCoverageTrend, generateMappingRecommendations } from '@/lib/quality';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const fiscalYear = searchParams.get('fiscalYear');
    const reportCode = searchParams.get('reportCode') || '11011';
    const fsScope = searchParams.get('fsScope') || 'CFS';
    const action = searchParams.get('action') || 'analyze';

    if (!entityId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: entityId',
        },
        { status: 400 }
      );
    }

    if (action === 'trend') {
      const periods = parseInt(searchParams.get('periods') || '5');
      const trend = await analyzeCoverageTrend(entityId, periods);

      return NextResponse.json({
        success: true,
        data: trend,
      });
    } else if (action === 'recommendations') {
      const limit = parseInt(searchParams.get('limit') || '10');
      const recommendations = await generateMappingRecommendations({
        entityId,
        fiscalYear: fiscalYear ? parseInt(fiscalYear) : undefined,
        limit,
      });

      return NextResponse.json({
        success: true,
        data: recommendations,
      });
    } else {
      // Default: analyze coverage
      if (!fiscalYear) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required parameter: fiscalYear',
          },
          { status: 400 }
        );
      }

      const report = await analyzeMappingCoverage({
        entityId,
        fiscalYear: parseInt(fiscalYear),
        reportCode,
        fsScope,
      });

      return NextResponse.json({
        success: true,
        data: report,
      });
    }
  } catch (error: any) {
    console.error('[API] Coverage analysis error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to analyze coverage',
      },
      { status: 500 }
    );
  }
}
