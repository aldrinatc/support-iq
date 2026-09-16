import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
const issuer = 'https://clerk.digitalworkplace.ai';
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {timeoutDuration: 5000});
const origins = new Set(['https://dsq.digitalworkplace.ai', 'https://www.digitalworkplace.ai', 'https://digitalworkplace.ai']);
export async function validateDraftRequest(request: NextRequest): Promise<NextResponse | null> {
  const origin = request.headers.get('origin');
  if (origin && !origins.has(origin) && !(process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin))) return NextResponse.json({error:'Untrusted request origin'}, {status:403});
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || request.cookies.get('__session')?.value;
  if (!token) return NextResponse.json({error:'Sign in to Digital Workplace to access support drafts'}, {status:401});
  try {
    const {payload} = await jwtVerify(token,jwks,{issuer,algorithms:['RS256']});
    if (!payload.sub || (payload.azp && !origins.has(String(payload.azp)))) return NextResponse.json({error:'Invalid workplace session'}, {status:401});
    const rows = await prisma.$queryRaw<Array<{allowed: boolean}>>`select exists (
      select 1 from public.users u where u.clerk_id=${payload.sub} and (
        u.role in ('admin','super_admin') or exists (
          select 1 from public.user_project_access a join public.projects p on p.id=a.project_id
          where a.user_id=u.id and lower(p.code)='dsq' and a.role in ('admin','owner','editor')
        )
      )) as allowed`;
    if (rows[0]?.allowed) return null;
    return NextResponse.json({error:'Support editor access is required'}, {status:403});
  } catch { return NextResponse.json({error:'Could not verify your workplace session'}, {status:401}); }
}
