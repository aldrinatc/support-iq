import { validateDraftRequest } from '@/lib/workplace-auth';
// ============================================================================
// V20 ITSS - Reject Draft API
// POST /api/drafts/[id]/reject - Reject draft with reason
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const authError = await validateDraftRequest(request);
  if (authError) return authError;
  try {
    const { id } = await params
    const body = await request.json()

    const {
      rejectionReason,   // Required: why the draft was rejected
      reviewedById,      // Required: who rejected
    } = body

    if (!rejectionReason) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: rejectionReason' },
        { status: 400 }
      )
    }

    if (!reviewedById) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: reviewedById' },
        { status: 400 }
      )
    }

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

    // Check if draft is in a state that can be rejected
    if (!['PENDING_REVIEW', 'IN_REVIEW'].includes(existingDraft.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot reject draft in ${existingDraft.status} status` },
        { status: 400 }
      )
    }

    // Update draft status
    const _updatedDraft = await prisma.draft.update({
      where: { id: existingDraft.id },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason,
        reviewedById,
        reviewedAt: new Date(),
      },
    })

    // Fetch complete draft
    const completeDraft = await prisma.draft.findUnique({
      where: { id: existingDraft.id },
      include: { versions: { orderBy: { version: 'desc' } } },
    })

    return NextResponse.json({
      success: true,
      message: 'Draft rejected',
      draft: completeDraft,
    })
  } catch (error) {
    console.error('[Draft Reject] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to reject draft' },
      { status: 500 }
    )
  }
}
