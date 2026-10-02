import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { bedLinkStore } from '@/lib/data/store';

const RespondSchema = z.object({
  reservationId: z.string().min(1),
  action: z.enum(['accept', 'reject']),
  actorId: z.string().optional(),
  actorName: z.string().optional(),
  rejectionReason: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RespondSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { reservationId, action, actorId, actorName, rejectionReason } = parsed.data;

    const result = bedLinkStore.respondReservationAtomic(
      reservationId,
      action,
      actorId || 'api-staff',
      actorName || 'Staff Nurse',
      rejectionReason
    );

    return NextResponse.json({
      success: true,
      result,
      message: action === 'accept' ? 'Bed secured' : 'Reservation rejected and auto-routed'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Response action failed';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
