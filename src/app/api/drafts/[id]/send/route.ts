import { validateDraftRequest } from '@/lib/workplace-auth';
// ============================================================================
// V20 ITSS - Send Draft API
// POST /api/drafts/[id]/send - Send approved draft to customer via Zoho Desk
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type RouteParams = { params: Promise<{ id: string }> }

const DEMO_MODE = process.env.DEMO_MODE === 'true'

// Zoho Desk API integration (simplified for Phase 1)
async function sendViaZohoDesk(
  ticketId: string,
  content: string,
  _options?: {
    ccRecipients?: string[]
    bccRecipients?: string[]
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (DEMO_MODE) return { success: false, error: 'Email sending is disabled in demo mode. No message was sent.' };

  // Real Zoho Desk integration
  try {
    const orgId = process.env.ZOHO_ORG_ID
    const accessToken = process.env.ZOHO_ACCESS_TOKEN // Would need OAuth refresh

    if (!orgId || !accessToken) {
      return { success: false, error: 'Zoho Desk credentials not configured' }
    }

    const response = await fetch(
      `https://desk.zoho.com/api/v1/tickets/${ticketId}/sendReply`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'orgId': orgId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'EMAIL',
          content: content,
          isPublic: true,
          contentType: 'html',
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, error: errorData.message || 'Failed to send via Zoho' }
    }

    const data = await response.json()
    return { success: true, messageId: data.id }

  } catch (error) {
    console.error('[Zoho Desk] Send error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

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
      ccRecipients,
      bccRecipients,
    } = body

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

    // Only approved drafts can be sent
    if (existingDraft.status !== 'APPROVED') {
      return NextResponse.json(
        { success: false, error: `Cannot send draft in ${existingDraft.status} status. Draft must be approved first.` },
        { status: 400 }
      )
    }

    // Get content to send (finalContent if edited, otherwise draftContent)
    const contentToSend = existingDraft.finalContent || existingDraft.draftContent

    // Send via Zoho Desk
    const sendResult = await sendViaZohoDesk(
      existingDraft.ticketId,
      contentToSend,
      { ccRecipients, bccRecipients }
    )

    if (!sendResult.success) {
      // Mark as failed
      await prisma.draft.update({
        where: { id: existingDraft.id },
        data: {
          status: 'FAILED',
        },
      })

      return NextResponse.json(
        { success: false, error: sendResult.error || 'Failed to send draft' },
        { status: 500 }
      )
    }

    // Update draft status to SENT
    const updatedDraft = await prisma.draft.update({
      where: { id: existingDraft.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sourcesUsed: {
          ...(existingDraft.sourcesUsed as object || {}),
          zohoMessageId: sendResult.messageId,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Draft sent successfully',
      draft: updatedDraft,
      messageId: sendResult.messageId,
    })
  } catch (error) {
    console.error('[Draft Send] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send draft' },
      { status: 500 }
    )
  }
}
