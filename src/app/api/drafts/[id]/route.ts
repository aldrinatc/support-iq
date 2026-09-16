import { validateDraftRequest } from '@/lib/workplace-auth';
// ============================================================================
// V20 ITSS - Single Draft API
// GET /api/drafts/[id] - Get draft by ID
// PATCH /api/drafts/[id] - Update draft
// DELETE /api/drafts/[id] - Delete draft
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/drafts/[id] - Get single draft with versions
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const authError = await validateDraftRequest(request);
  if (authError) return authError;
  try {
    const { id } = await params

    const draft = await prisma.draft.findFirst({
      where: {
        OR: [
          { id },
          { draftId: id },
        ],
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
        },
      },
    })

    if (!draft) {
      return NextResponse.json(
        { success: false, error: 'Draft not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      draft,
    })
  } catch (error) {
    console.error('[Draft API] Error fetching draft:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch draft' },
      { status: 500 }
    )
  }
}

// PATCH /api/drafts/[id] - Update draft content or status
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  const authError = await validateDraftRequest(request);
  if (authError) return authError;
  try {
    const { id } = await params
    const body = await request.json()

    const {
      draftContent,
      status,
      assignedAgentId,
      priority,
      editedBy,
      editedByName,
      editSummary,
    } = body

    // Find existing draft
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

    if (existingDraft.status === 'SENT') return NextResponse.json({error:'Sent drafts cannot be edited'},{status:409});
    if (status !== undefined && !['PENDING_REVIEW','IN_REVIEW'].includes(status)) return NextResponse.json({error:'Use the review actions to approve, reject, or send a draft'},{status:400});
    // Build update data
    const updateData: Record<string, unknown> = {}

    if (draftContent !== undefined) {
      updateData.draftContent = draftContent
      if(existingDraft.status==='APPROVED') {
        updateData.status='PENDING_REVIEW';updateData.finalContent=null;updateData.approvedAt=null;updateData.approvedById=null;
      }
    }
    if (status !== undefined) {
      updateData.status = status
      if (status === 'IN_REVIEW') {
        updateData.reviewedAt = new Date()
      }
    }
    if (assignedAgentId !== undefined) {
      updateData.assignedAgentId = assignedAgentId
    }
    if (priority !== undefined) {
      updateData.priority = priority
    }

    // Update draft
    const _updatedDraft = await prisma.draft.update({
      where: { id: existingDraft.id },
      data: updateData,
    })

    // If content was changed, create new version
    if (draftContent !== undefined && draftContent !== existingDraft.draftContent) {
      const latestVersion = existingDraft.versions[0]?.version || 0
      const previousContent = existingDraft.draftContent

      // Calculate edit distance
      const editDistance = Math.abs(draftContent.length - previousContent.length)
      const changePercent = previousContent.length > 0
        ? (editDistance / previousContent.length) * 100
        : 100

      await prisma.draftVersion.create({
        data: {
          draftId: existingDraft.id,
          version: latestVersion + 1,
          content: draftContent,
          editedBy: editedBy || 'AGENT',
          editedByName: editedByName || 'Agent',
          editType: 'AGENT_EDIT',
          editSummary: editSummary || 'Manual edit',
          editDistance,
          changePercent,
        },
      })
    }

    // Fetch updated draft with versions
    const completeDraft = await prisma.draft.findUnique({
      where: { id: existingDraft.id },
      include: { versions: { orderBy: { version: 'desc' } } },
    })

    return NextResponse.json({
      success: true,
      draft: completeDraft,
    })
  } catch (error) {
    console.error('[Draft API] Error updating draft:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update draft' },
      { status: 500 }
    )
  }
}

// DELETE /api/drafts/[id] - Delete draft and all versions
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const authError = await validateDraftRequest(request);
  if (authError) return authError;
  try {
    const { id } = await params

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

    // Delete draft (versions cascade)
    await prisma.draft.delete({
      where: { id: existingDraft.id },
    })

    return NextResponse.json({
      success: true,
      message: 'Draft deleted successfully',
    })
  } catch (error) {
    console.error('[Draft API] Error deleting draft:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete draft' },
      { status: 500 }
    )
  }
}
