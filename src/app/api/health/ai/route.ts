import { NextResponse } from 'next/server';
import { aiHealth } from '@/lib/ai-provider';
export const dynamic = 'force-dynamic';
export async function GET() {
  const health = await aiHealth();
  return NextResponse.json(health, { status: health.status === 'healthy' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
