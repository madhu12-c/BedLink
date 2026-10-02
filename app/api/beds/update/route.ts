import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { bedLinkStore } from '@/lib/data/store';
import { requireApiUser, staffHospitalDenied } from '@/lib/auth/session';

const BedUpdateSchema = z.object({
  hospitalId: z.string().min(1),
  bedType: z.enum(['icu', 'ventilator', 'oxygen', 'emergency', 'general']),
  delta: z.number().int(),
  actorId: z.string().optional(),
  actorName: z.string().optional()
});

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(['nurse', 'coordinator', 'admin']);
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const parsed = BedUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { hospitalId, bedType, delta } = parsed.data;
    const denied = staffHospitalDenied(auth.user, hospitalId);
    if (denied) return denied;
    // The audit trail names the signed-in user, not whatever the request body claims.
    const actorId = auth.user.id === 'demo' ? parsed.data.actorId : auth.user.id;
    const actorName = auth.user.id === 'demo' ? parsed.data.actorName : auth.user.name;

    const updated = bedLinkStore.updateBedCount(
      hospitalId,
      bedType,
      delta,
      actorId || 'api-nurse',
      actorName || 'Staff Nurse'
    );

    try {
      const { createServerSupabaseClient } = await import('@/lib/supabase/server');
      const supabase = await createServerSupabaseClient();
      if (supabase) {
        await supabase
          .from('bed_inventory')
          .update({
            available_beds: updated.available_beds,
            updated_at: updated.updated_at,
            updated_by: actorId || null
          })
          .eq('hospital_id', hospitalId)
          .eq('bed_type', bedType);
      }
    } catch {
      // Continue even if Supabase sync fails
    }

    return NextResponse.json({
      success: true,
      inventory: updated,
      message: 'Bed count updated successfully'
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bed update failed';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
