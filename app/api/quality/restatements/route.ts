// app/api/quality/restatements/route.ts
// Phase C: Restatement Tracking API

import { NextResponse } from 'next/server';
import { detectRestatements, recordRestatement, assessRestatementImpact } from '@/lib/quality';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const corpCode = searchParams.get('corpCode') || undefined;
    const fiscalYear = searchParams.get('fiscalYear') ? parseInt(searchParams.get('fiscalYear')!) : undefined;
    const sinceDays = parseInt(searchParams.get('sinceDays') || '30');

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - sinceDays);

    const restatements = await detectRestatements({
      corpCode,
      fiscalYear,
      sinceDate,
    });

    return NextResponse.json({
      success: true,
      data: restatements,
    });
  } catch (error: any) {
    console.error('[API] Restatements detection error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to detect restatements',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, action } = body;

    if (action === 'record') {
      // Record restatement event
      const event = body.event;
      if (!event) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing event data',
          },
          { status: 400 }
        );
      }

      await recordRestatement(event);

      return NextResponse.json({
        success: true,
        message: 'Restatement recorded',
      });
    } else if (action === 'assess-impact') {
      // Assess impact
      const event = body.event;
      if (!event) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing event data',
          },
          { status: 400 }
        );
      }

      const impact = await assessRestatementImpact(event);

      return NextResponse.json({
        success: true,
        data: impact,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid action',
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('[API] Restatements action error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to process restatement action',
      },
      { status: 500 }
    );
  }
}
