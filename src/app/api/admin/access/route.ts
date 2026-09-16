import {NextRequest, NextResponse} from 'next/server';
import {validateDraftRequest} from '@/lib/workplace-auth';
export async function GET(request:NextRequest) { return await validateDraftRequest(request) || NextResponse.json({authorized:true}); }
