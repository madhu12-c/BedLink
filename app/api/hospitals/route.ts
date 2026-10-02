import { NextResponse } from 'next/server';
import { bedLinkStore } from '@/lib/data/store';

export async function GET() {
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
