import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { bedLinkStore } from '@/lib/data/store';

const HoldSchema = z.object({
  requestId: z.string().min(1),
  hospitalId: z.string().min(1),
  bedType: z.enum(['icu', 'ventilator', 'oxygen', 'emergency', 'general']),
  actorId: z.string().optional(),
  actorName: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = HoldSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { requestId, hospitalId, bedType, actorId, actorName } = parsed.data;

    const reservation = bedLinkStore.holdBedAtomic(
      requestId,
      hospitalId,
      bedType,
      actorId || 'api-dispatcher',
      actorName || 'EMS Dispatch Control'
    );

    return NextResponse.json({
      success: true,
      reservation,
      message: 'Bed hold confirmed for 2 minutes'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Reservation failed';
    const isConflict = msg.includes('no longer available') || msg.includes('conflict');
    return NextResponse.json(
      { success: false, error: msg },
      { status: isConflict ? 409 : 500 }
    );
  }
}
