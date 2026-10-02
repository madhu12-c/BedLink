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

    try {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server');
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        await supabase.from('reservations').insert({
          id: reservation.id,
          request_id: reservation.request_id,
          hospital_id: reservation.hospital_id,
          bed_type: reservation.bed_type,
          status: reservation.status,
          requested_at: reservation.requested_at,
          expires_at: reservation.expires_at
        });

        const inv = bedLinkStore.getBedInventories(hospitalId).find((b) => b.bed_type === bedType);
        if (inv) {
          await supabase
            .from('bed_inventory')
            .update({
              available_beds: inv.available_beds,
              updated_at: new Date().toISOString()
            })
            .eq('hospital_id', hospitalId)
            .eq('bed_type', bedType);
        }
      }
    } catch {
      // Continue even if Supabase sync fails
    }

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
