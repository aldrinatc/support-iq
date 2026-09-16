import { validateDraftRequest } from '@/lib/workplace-auth';
// ============================================================================
// V20 ITSS - Approve Draft API
// POST /api/drafts/[id]/approve - Approve draft for sending
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
      finalContent,      // Optional: edited content to approve
      approvedById,      // Required: who approved
      approvedByName,    // Optional: display name
    } = body

    if (!approvedById) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: approvedById' },
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
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    })

    if (!existingDraft) {
      return NextResponse.json(
        { success: false, error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Check if draft is in a state that can be approved
    if (!['PENDING_REVIEW', 'IN_REVIEW'].includes(existingDraft.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot approve draft in ${existingDraft.status} status` },
        { status: 400 }
      )
    }

    // Determine final content
    const contentToApprove = finalContent || existingDraft.draftContent

    // Update draft status
    const _updatedDraft = await prisma.draft.update({
      where: { id: existingDraft.id },
      data: {
        status: 'APPROVED',
        finalContent: contentToApprove,
        approvedAt: new Date(),
        approvedById,
        reviewedById: approvedById,
        reviewedAt: new Date(),
      },
    })

    // If content was changed during approval, create a new version
    if (finalContent && finalContent !== existingDraft.draftContent) {
      const latestVersion = existingDraft.versions[0]?.version || 0
      const previousContent = existingDraft.draftContent
      const editDistance = Math.abs(finalContent.length - previousContent.length)
      const changePercent = previousContent.length > 0
        ? (editDistance / previousContent.length) * 100
        : 0

      await prisma.draftVersion.create({
        data: {
          draftId: existingDraft.id,
          version: latestVersion + 1,
          content: finalContent,
          editedBy: approvedById,
          editedByName: approvedByName || 'Agent',
          editType: 'AGENT_EDIT',
          editSummary: 'Edited and approved',
          editDistance,
          changePercent,
        },
      })
    }

    // Fetch complete draft
    const completeDraft = await prisma.draft.findUnique({
      where: { id: existingDraft.id },
      include: { versions: { orderBy: { version: 'desc' } } },
    })

    return NextResponse.json({
      success: true,
      message: 'Draft approved successfully',
      draft: completeDraft,
    })
  } catch (error) {
    console.error('[Draft Approve] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to approve draft' },
      { status: 500 }
    )
  }
}
