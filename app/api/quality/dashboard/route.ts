// app/api/quality/dashboard/route.ts
// Phase C: Quality Dashboard API

import { NextResponse } from 'next/server';
import { generateQualityDashboard } from '@/lib/quality';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entityIds = searchParams.get('entityIds')?.split(',');
    const sinceDays = parseInt(searchParams.get('sinceDays') || '30');

    const dashboard = await generateQualityDashboard({
      entityIds,
      sinceDays,
    });

    return NextResponse.json({
      success: true,
      data: dashboard,
    });
  } catch (error: any) {
    console.error('[API] Quality Dashboard error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate quality dashboard',
      },
      { status: 500 }
    );
  }
}
