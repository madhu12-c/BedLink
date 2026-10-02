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

    try {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server');
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        await supabase
          .from('reservations')
          .update({
            status: result.status,
            responded_at: new Date().toISOString(),
            rejection_reason: rejectionReason || null
          })
          .eq('id', reservationId);

        const res = bedLinkStore.getReservations().find((r) => r.id === reservationId);
        if (res && action === 'reject') {
          const inv = bedLinkStore.getBedInventories(res.hospital_id).find((b) => b.bed_type === res.bed_type);
          if (inv) {
            await supabase
              .from('bed_inventory')
              .update({
                available_beds: inv.available_beds,
                updated_at: new Date().toISOString()
              })
              .eq('hospital_id', res.hospital_id)
              .eq('bed_type', res.bed_type);
          }
        }
      }
    } catch {
      // Continue even if Supabase sync fails
    }

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
