import { validateDraftRequest } from '@/lib/workplace-auth';
import { anthropicOptions } from '@/lib/ai-provider';
// ============================================================================
// V20 ITSS - Regenerate Draft API
// POST /api/drafts/[id]/regenerate - Regenerate draft with new parameters
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import type { DraftTone } from '@/types/draft'

type RouteParams = { params: Promise<{ id: string }> }

const anthropic = new Anthropic(anthropicOptions())

const DEMO_MODE = process.env.DEMO_MODE === 'true'

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
      tone = 'friendly' as DraftTone,
      additionalContext,
      focusAreas,
      regeneratedBy,
      regeneratedByName,
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

    // Can only regenerate drafts in review status
    if (!['PENDING_REVIEW', 'IN_REVIEW', 'REJECTED'].includes(existingDraft.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot regenerate draft in ${existingDraft.status} status` },
        { status: 400 }
      )
    }

    let newDraftContent: string
    let newConfidenceScore: number = existingDraft.confidenceScore
    let promptTokens = 0
    let completionTokens = 0

    if (DEMO_MODE) {
      // Demo mode: generate variation based on tone
      const toneVariations: Record<DraftTone, string> = {
        formal: `Thank you for contacting our support team regarding this matter.

We have reviewed your inquiry and are committed to providing a resolution.

Based on the information provided, we recommend the following course of action:
1. First, please verify your account credentials are correct
2. If the issue persists, clear your browser cache and cookies
3. Attempt to access the system again using an incognito/private window

Should you require further assistance, please do not hesitate to contact us.

We appreciate your patience and understanding.`,
        friendly: `Thanks for reaching out! I totally understand how frustrating this can be.

Let me help you get this sorted out quickly! Here's what I suggest:
1. Double-check that you're using the right login details
2. Try clearing your browser cache (it works like magic sometimes!)
3. Give it another shot in a private/incognito window

If that doesn't do the trick, just let me know and I'll dig deeper into what's going on.

Here to help! 😊`,
        technical: `Issue Analysis:

Based on the reported symptoms, this appears to be related to authentication/session management.

Recommended troubleshooting steps:

1. Credential Verification
   - Confirm username format (email vs. username)
   - Verify no trailing whitespace in password field

2. Browser State Reset
   \`\`\`
   - Clear cache: Settings > Privacy > Clear browsing data
   - Clear cookies for domain: *.example.com
   - Disable browser extensions temporarily
   \`\`\`

3. Session Isolation Test
   - Open incognito/private window
   - Navigate directly to https://portal.example.com
   - Attempt authentication

If issue persists, please provide:
- Browser version (chrome://version)
- Network console output (F12 > Network > Failed requests)
- Timestamp of last successful login

This data will assist in root cause analysis.`,
      }

      const validTone = (tone as DraftTone) in toneVariations ? (tone as DraftTone) : 'friendly'
      newDraftContent = toneVariations[validTone]
      newConfidenceScore = 82 + Math.random() * 10 // 82-92 for regenerated

    } else {
      // Real Claude API call
      const systemPrompt = `You are an expert IT support agent. Regenerate a response draft with the following parameters:

TONE: ${tone.toUpperCase()}
${additionalContext ? `ADDITIONAL CONTEXT: ${additionalContext}` : ''}
${focusAreas?.length ? `FOCUS AREAS: ${focusAreas.join(', ')}` : ''}

Generate a complete, professional response. Do not include greetings or signatures - just the response content.`

      const userPrompt = `Original ticket:
Subject: ${existingDraft.ticketSubject}
Customer: ${existingDraft.customerName || 'Unknown'}

Original message:
${existingDraft.originalContent}

Previous draft (for reference):
${existingDraft.draftContent}

Please generate a new response with the ${tone} tone.`

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const textContent = response.content.find(c => c.type === 'text')
      newDraftContent = textContent?.type === 'text' ? textContent.text : existingDraft.draftContent
      promptTokens = response.usage.input_tokens
      completionTokens = response.usage.output_tokens
      newConfidenceScore = 80 // Regenerated drafts start at 80 confidence
    }

    // Create new version
    const latestVersion = existingDraft.versions[0]?.version || 0
    const previousContent = existingDraft.draftContent
    const editDistance = Math.abs(newDraftContent.length - previousContent.length)
    const changePercent = previousContent.length > 0
      ? (editDistance / previousContent.length) * 100
      : 100

    await prisma.draftVersion.create({
      data: {
        draftId: existingDraft.id,
        version: latestVersion + 1,
        content: newDraftContent,
        editedBy: regeneratedBy || 'AI',
        editedByName: regeneratedByName || 'AI Assistant',
        editType: tone !== existingDraft.tone ? 'TONE_CHANGE' : 'REGENERATE',
        editSummary: `Regenerated with ${tone} tone`,
        editDistance,
        changePercent,
        confidenceScore: newConfidenceScore,
        tone,
      },
    })

    // Update draft
    const _updatedDraft = await prisma.draft.update({
      where: { id: existingDraft.id },
      data: {
        draftContent: newDraftContent,
        tone,
        confidenceScore: newConfidenceScore,
        status: 'PENDING_REVIEW',
        promptTokens: existingDraft.promptTokens
          ? existingDraft.promptTokens + promptTokens
          : promptTokens,
        completionTokens: existingDraft.completionTokens
          ? existingDraft.completionTokens + completionTokens
          : completionTokens,
      },
    })

    // Fetch complete draft
    const completeDraft = await prisma.draft.findUnique({
      where: { id: existingDraft.id },
      include: { versions: { orderBy: { version: 'desc' } } },
    })

    return NextResponse.json({
      success: true,
      message: 'Draft regenerated successfully',
      draft: completeDraft,
    })
  } catch (error) {
    console.error('[Draft Regenerate] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to regenerate draft' },
      { status: 500 }
    )
  }
}
