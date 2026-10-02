import { NextResponse } from 'next/server';
import { bedLinkStore } from '@/lib/data/store';
import { requireApiUser } from '@/lib/auth/session';
import { USER_ROLES } from '@/lib/auth/roles';

export async function GET() {
  const auth = await requireApiUser(USER_ROLES);
  if (auth.response) return auth.response;

  try {
    const candidates = bedLinkStore.getHospitalCandidates();
    return NextResponse.json({
      success: true,
      hospitals: candidates,
      timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch hospitals';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
