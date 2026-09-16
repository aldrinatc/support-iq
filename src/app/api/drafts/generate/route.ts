import { validateDraftRequest } from '@/lib/workplace-auth';
import { anthropicOptions } from '@/lib/ai-provider';
// ============================================================================
// V20 ITSS - AI Draft Generation API
// POST /api/drafts/generate - Generate AI response draft for a ticket
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { generateDraftId } from '@/types/draft'
import type { GenerateDraftRequest, DraftTone, TicketCategory, Sentiment, Complexity } from '@/types/draft'

const anthropic = new Anthropic(anthropicOptions())

const DEMO_MODE = process.env.DEMO_MODE === 'true'

// System prompt for draft generation
const getDraftSystemPrompt = (tone: DraftTone = 'friendly') => `You are an expert IT support agent generating professional response drafts for support tickets.

Your task is to:
1. Analyze the customer's issue
2. Classify the ticket (category, sentiment, complexity)
3. Generate a helpful, accurate response draft

RESPONSE TONE: ${tone.toUpperCase()}
${tone === 'formal' ? '- Use professional, business language\n- Avoid contractions\n- Be concise and direct' : ''}
${tone === 'friendly' ? '- Use warm, approachable language\n- Show empathy for the customer\n- Be helpful and patient' : ''}
${tone === 'technical' ? '- Use precise technical terminology\n- Include step-by-step instructions\n- Reference documentation when applicable' : ''}

RESPONSE FORMAT:
- Start with acknowledging the customer's issue
- Provide clear, actionable steps or information
- End with an offer for further assistance
- Keep responses concise but complete

IMPORTANT:
- Do NOT include placeholders like [Your Name] or [Company Name]
- Do NOT include greeting salutations (Hi, Hello, Dear) - the email system adds those
- Do NOT include closing signatures - the email system adds those
- Focus on the CONTENT of the response only

Return your analysis and draft in the following JSON format:
{
  "classification": {
    "category": "password_reset|access_request|bug_report|question|feature_request|complaint|general_inquiry|technical_issue|billing|other",
    "sentiment": "frustrated|neutral|satisfied",
    "complexity": "simple|moderate|complex",
    "confidenceScore": 0-100
  },
  "draft": "Your response content here",
  "kbArticlesRecommended": ["article_id_1", "article_id_2"],
  "reasoning": "Brief explanation of your classification and approach"
}`

// Demo response generator
const generateDemoResponse = (originalContent: string, tone: DraftTone = 'friendly'): {
  classification: {
    category: TicketCategory
    sentiment: Sentiment
    complexity: Complexity
    confidenceScore: number
  }
  draft: string
  kbArticlesRecommended: string[]
  reasoning: string
} => {
  const lowerContent = originalContent.toLowerCase()

  // Simple keyword-based classification for demo
  let category: TicketCategory = 'general_inquiry'
  let sentiment: Sentiment = 'neutral'
  let complexity: Complexity = 'simple'
  let confidenceScore = 85
  let draft = ''

  if (lowerContent.includes('password') || lowerContent.includes('reset') || lowerContent.includes('login')) {
    category = 'password_reset'
    confidenceScore = 92
    draft = tone === 'formal'
      ? `Thank you for contacting us regarding your password issue.

To reset your password, please follow these steps:
1. Navigate to the login page at https://portal.example.com
2. Click "Forgot Password" below the sign-in button
3. Enter the email address associated with your account
4. Check your inbox for a password reset link (valid for 24 hours)
5. Create a new password meeting our security requirements

If you do not receive the reset email within 5 minutes, please check your spam folder. If the issue persists, we can initiate a manual reset from our end.

Please let us know if you require any additional assistance.`
      : `I understand how frustrating password issues can be - let me help you get back into your account quickly!

Here's what you can do:
1. Head to our login page at https://portal.example.com
2. Click the "Forgot Password" link
3. Enter your email address
4. Check your inbox for the reset link (don't forget to check spam!)
5. Create your new password

The reset link is valid for 24 hours. If you don't see the email within a few minutes, let me know and I can send a manual reset from our end.

Is there anything else I can help you with?`
  } else if (lowerContent.includes('access') || lowerContent.includes('permission')) {
    category = 'access_request'
    confidenceScore = 88
    complexity = 'moderate'
    draft = `I've received your access request and I'm happy to help.

To process your request, I'll need to verify a few things:
1. The specific system or resource you need access to
2. Your manager's approval (if not already provided)
3. The level of access required (read-only, edit, admin)

Once I have this information, I can typically complete access provisioning within 24 hours for standard requests.

Could you please confirm these details so I can proceed?`
  } else if (lowerContent.includes('bug') || lowerContent.includes('error') || lowerContent.includes('not working')) {
    category = 'bug_report'
    sentiment = 'frustrated'
    complexity = 'moderate'
    confidenceScore = 78
    draft = `Thank you for reporting this issue - I understand how disruptive technical problems can be.

I've logged this as a bug report and our team will investigate. To help us resolve this faster, could you please provide:
1. The exact error message (if any)
2. Steps to reproduce the issue
3. Your browser and operating system
4. When the issue first started

In the meantime, you might try:
- Clearing your browser cache
- Trying a different browser
- Checking if the issue persists in incognito mode

I'll keep you updated on our progress. We aim to resolve issues like this within 2-3 business days.`
  } else {
    draft = `Thank you for reaching out to our support team.

I've reviewed your inquiry and I'm here to help. Based on your message, it seems you're looking for assistance with your account or service.

To better assist you, could you provide a bit more detail about:
1. What you were trying to accomplish
2. Any error messages or unexpected behavior you encountered
3. When the issue started

This will help me provide you with the most accurate and helpful response.

Looking forward to resolving this for you!`
  }

  if (lowerContent.includes('urgent') || lowerContent.includes('asap') || lowerContent.includes('immediately')) {
    sentiment = 'frustrated'
    complexity = 'moderate'
    confidenceScore = Math.min(confidenceScore, 75)
  }

  return {
    classification: {
      category,
      sentiment,
      complexity,
      confidenceScore,
    },
    draft,
    kbArticlesRecommended: ['KB-001', 'KB-002'],
    reasoning: `Classified as ${category} based on keyword analysis. Tone: ${tone}. Demo mode response.`,
  }
}

export async function POST(request: NextRequest) {
  const authError = await validateDraftRequest(request);
  if (authError) return authError;
  try {
    const body: GenerateDraftRequest = await request.json()

    const {
      ticketId,
      ticketSubject,
      customerName,
      customerEmail,
      originalContent,
      tone = 'friendly',
      assignedAgentId,
      kbArticleIds,
    } = body

    // Validate required fields
    if (!ticketId || !ticketSubject || !originalContent) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: ticketId, ticketSubject, originalContent'
        },
        { status: 400 }
      )
    }

    // Generate unique draft ID
    const draftId = generateDraftId()

    let aiResponse: {
      classification: {
        category: TicketCategory
        sentiment: Sentiment
        complexity: Complexity
        confidenceScore: number
      }
      draft: string
      kbArticlesRecommended: string[]
      reasoning: string
    }

    // Track token usage
    let promptTokens = 0
    let completionTokens = 0

    if (DEMO_MODE) {
      // Use demo response
      aiResponse = generateDemoResponse(originalContent, tone)
    } else {
      // Call Claude API
      const userPrompt = `Customer Ticket:
Subject: ${ticketSubject}
From: ${customerName || 'Unknown'} <${customerEmail || 'unknown@email.com'}>

Message:
${originalContent}

${kbArticleIds?.length ? `Available KB Articles: ${kbArticleIds.join(', ')}` : ''}

Please analyze this ticket and generate a response draft.`

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: getDraftSystemPrompt(tone),
        messages: [
          { role: 'user', content: userPrompt }
        ],
      })

      // Extract text content
      const textContent = response.content.find(c => c.type === 'text')
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from AI')
      }

      // Parse JSON response
      try {
        // Extract JSON from potential markdown code blocks
        let jsonStr = textContent.text
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        }
        aiResponse = JSON.parse(jsonStr.trim())
      } catch {
        // Fallback if JSON parsing fails
        aiResponse = {
          classification: {
            category: 'general_inquiry',
            sentiment: 'neutral',
            complexity: 'moderate',
            confidenceScore: 70,
          },
          draft: textContent.text,
          kbArticlesRecommended: [],
          reasoning: 'Could not parse structured response, using raw text',
        }
      }

      // Track token usage
      promptTokens = response.usage.input_tokens
      completionTokens = response.usage.output_tokens
    }

    // Create draft in database
    const draft = await prisma.draft.create({
      data: {
        draftId,
        ticketId,
        ticketSubject,
        customerName,
        customerEmail,
        originalContent,
        draftContent: aiResponse.draft,
        status: 'PENDING_REVIEW',
        confidenceScore: aiResponse.classification.confidenceScore,
        category: aiResponse.classification.category,
        sentiment: aiResponse.classification.sentiment,
        complexity: aiResponse.classification.complexity,
        tone,
        priority: aiResponse.classification.complexity === 'complex' ? 'HIGH' :
                 aiResponse.classification.sentiment === 'frustrated' ? 'HIGH' : 'MEDIUM',
        assignedAgentId,
        generatedAt: new Date(),
        kbArticlesUsed: aiResponse.kbArticlesRecommended || [],
        sourcesUsed: { reasoning: aiResponse.reasoning },
        modelVersion: DEMO_MODE ? 'demo-mode' : 'claude-3-5-sonnet-20241022',
        promptTokens,
        completionTokens,
      },
    })

    // Create initial version
    await prisma.draftVersion.create({
      data: {
        draftId: draft.id,
        version: 1,
        content: aiResponse.draft,
        editedBy: 'AI',
        editedByName: 'AI Assistant',
        editType: 'AI_GENERATED',
        editSummary: `Generated with ${tone} tone`,
        confidenceScore: aiResponse.classification.confidenceScore,
        tone,
      },
    })

    // Fetch complete draft with versions
    const completeDraft = await prisma.draft.findUnique({
      where: { id: draft.id },
      include: { versions: true },
    })

    return NextResponse.json({
      success: true,
      draft: completeDraft,
    })

  } catch (error) {
    console.error('[Draft Generation] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate draft'
      },
      { status: 500 }
    )
  }
}
