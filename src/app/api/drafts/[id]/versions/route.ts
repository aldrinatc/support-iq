import { validateDraftRequest } from '@/lib/workplace-auth';
// ============================================================================
// V20 ITSS - Draft Versions API
// GET /api/drafts/[id]/versions - Get version history for a draft
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const authError = await validateDraftRequest(request);
  if (authError) return authError;
  try {
    const { id } = await params

    // Find draft
    const existingDraft = await prisma.draft.findFirst({
      where: {
        OR: [
          { id },
          { draftId: id },
        ],
      },
    })

    if (!existingDraft) {
      return NextResponse.json(
        { success: false, error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Get all versions
    const versions = await prisma.draftVersion.findMany({
      where: { draftId: existingDraft.id },
      orderBy: { version: 'desc' },
    })

    // Find current version number
    const currentVersion = versions.length > 0 ? versions[0].version : 0

    return NextResponse.json({
      success: true,
      versions,
      currentVersion,
      totalVersions: versions.length,
    })
  } catch (error) {
    console.error('[Draft Versions] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch versions' },
      { status: 500 }
    )
  }
}
