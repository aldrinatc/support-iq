import { validateDraftRequest } from '@/lib/workplace-auth';
// ============================================================================
// V20 ITSS - Drafts API Route
// GET /api/drafts - List drafts with filtering
// POST /api/drafts - Create draft manually (bypass AI generation)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateDraftId } from '@/types/draft'
import type { ListDraftsParams, DraftStatus } from '@/types/draft'

// GET /api/drafts - List drafts with filtering and pagination
export async function GET(request: NextRequest) {
  const authError = await validateDraftRequest(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const params: ListDraftsParams = {
      status: searchParams.get('status') as DraftStatus | undefined,
      assignedAgentId: searchParams.get('assignedAgentId') || undefined,
      category: searchParams.get('category') as ListDraftsParams['category'] | undefined,
      minConfidence: searchParams.get('minConfidence')
        ? parseFloat(searchParams.get('minConfidence')!)
        : undefined,
      maxConfidence: searchParams.get('maxConfidence')
        ? parseFloat(searchParams.get('maxConfidence')!)
        : undefined,
      fromDate: searchParams.get('fromDate') || undefined,
      toDate: searchParams.get('toDate') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: Math.min(parseInt(searchParams.get('limit') || '20'), 100),
      sortBy: (searchParams.get('sortBy') as ListDraftsParams['sortBy']) || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    }

    if (!Number.isInteger(params.page) || (params.page || 0) < 1 || !Number.isInteger(params.limit) || (params.limit || 0) < 1 ||
        !['createdAt','generatedAt','confidenceScore','status','updatedAt'].includes(params.sortBy || '') || !['asc','desc'].includes(params.sortOrder || '')) {
      return NextResponse.json({error:'Invalid pagination or sort parameters'},{status:400});
    }
    // Build where clause
    const where: Record<string, unknown> = {}

    if (params.status) {
      // Handle multiple statuses (comma-separated)
      const statuses = typeof params.status === 'string'
        ? params.status.split(',')
        : params.status
      where.status = Array.isArray(statuses) && statuses.length > 1
        ? { in: statuses }
        : statuses[0]
    }

    if (params.assignedAgentId) {
      where.assignedAgentId = params.assignedAgentId
    }

    if (params.category) {
      where.category = params.category
    }

    if (params.minConfidence !== undefined || params.maxConfidence !== undefined) {
      where.confidenceScore = {}
      if (params.minConfidence !== undefined) {
        (where.confidenceScore as Record<string, number>).gte = params.minConfidence
      }
      if (params.maxConfidence !== undefined) {
        (where.confidenceScore as Record<string, number>).lte = params.maxConfidence
      }
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {}
      if (params.fromDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(params.fromDate)
      }
      if (params.toDate) {
        (where.createdAt as Record<string, Date>).lte = new Date(params.toDate)
      }
    }

    // Get total count for pagination
    const total = await prisma.draft.count({ where })

    // Get drafts with pagination
    const drafts = await prisma.draft.findMany({
      where,
      orderBy: {
        [params.sortBy || 'createdAt']: params.sortOrder || 'desc',
      },
      skip: ((params.page || 1) - 1) * (params.limit || 20),
      take: params.limit || 20,
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1, // Only get latest version
        },
      },
    })

    return NextResponse.json({
      success: true,
      drafts,
      pagination: {
        total,
        page: params.page || 1,
        limit: params.limit || 20,
        totalPages: Math.ceil(total / (params.limit || 20)),
      },
    })
  } catch (error) {
    console.error('[Drafts API] Error listing drafts:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to list drafts' },
      { status: 500 }
    )
  }
}

// POST /api/drafts - Create draft manually (for testing or manual entry)
export async function POST(request: NextRequest) {
  const authError = await validateDraftRequest(request);
  if (authError) return authError;
  try {
    const body = await request.json()

    const {
      ticketId,
      ticketSubject,
      customerName,
      customerEmail,
      originalContent,
      draftContent,
      assignedAgentId,
      tone = 'friendly',
      priority = 'MEDIUM',
    } = body

    // Validate required fields
    if (!ticketId || !ticketSubject || !originalContent || !draftContent) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: ticketId, ticketSubject, originalContent, draftContent'
        },
        { status: 400 }
      )
    }

    // Generate unique draft ID
    const draftId = generateDraftId()

    // Create draft
    const draft = await prisma.draft.create({
      data: {
        draftId,
        ticketId,
        ticketSubject,
        customerName,
        customerEmail,
        originalContent,
        draftContent,
        status: 'PENDING_REVIEW',
        confidenceScore: 100, // Manual drafts have 100% confidence
        tone,
        priority,
        assignedAgentId,
        generatedAt: new Date(),
        kbArticlesUsed: [],
      },
    })

    // Create initial version
    await prisma.draftVersion.create({
      data: {
        draftId: draft.id,
        version: 1,
        content: draftContent,
        editedBy: assignedAgentId || 'MANUAL',
        editedByName: 'Manual Entry',
        editType: 'AGENT_EDIT',
        editSummary: 'Initial manual draft',
        confidenceScore: 100,
        tone,
      },
    })

    // Fetch the complete draft with versions
    const completeDraft = await prisma.draft.findUnique({
      where: { id: draft.id },
      include: { versions: true },
    })

    return NextResponse.json({
      success: true,
      draft: completeDraft,
    })
  } catch (error) {
    console.error('[Drafts API] Error creating draft:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create draft' },
      { status: 500 }
    )
  }
}
