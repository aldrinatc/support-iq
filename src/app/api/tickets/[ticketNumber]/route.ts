/**
 * API Route: Fetch Single Ticket Details from Zoho Desk
 * Provides comprehensive ticket data including conversations and metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZohoDeskClient } from '@/lib/integrations/zoho-desk';
import { ZohoConversation as ImportedZohoConversation } from '@/types/zoho';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Simple in-memory cache for ticket data
const ticketCache = new Map<string, {
  data: any;
  timestamp: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface RouteContext {
  params: Promise<{
    ticketNumber: string;
  }>;
}

// Zoho API Response Types
interface ZohoContact {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
}

interface ZohoAssignee {
  id?: string;
  name?: string;
  email?: string;
}

interface ZohoDepartment {
  name?: string;
}

interface ZohoCategory {
  name?: string;
}

interface ZohoProduct {
  productName?: string;
}

interface ZohoAttachment {
  id: string;
  name: string;
  size?: number;
  href?: string;
}

interface ZohoConversation {
  id: string;
  direction?: string;
  summary?: string;
  content?: string;
  contentType?: string;
  from?: string;
  to?: string;
  cc?: string[];
  bcc?: string[];
  author?: string | { name?: string };
  createdTime: string;
  isPublic?: boolean;
  attachments?: ZohoAttachment[];
}

interface ZohoTicket {
  id: string;
  ticketNumber: string;
  subject?: string;
  description?: string;
  priority?: string;
  status?: string;
  channel?: string;
  contact?: ZohoContact;
  assignee?: ZohoAssignee;
  createdTime: string;
  modifiedTime?: string;
  closedTime?: string;
  dueDate?: string;
  department?: ZohoDepartment;
  category?: ZohoCategory;
  subCategory?: string;
  productId?: ZohoProduct;
  cf?: Record<string, unknown>;
  responseDue?: string;
  resolutionDue?: string;
  isResponseOverdue?: boolean;
  isOverDue?: boolean;
  tags?: string[];
  webUrl?: string;
  commentCount?: number;
  threadCount?: number;
  attachmentCount?: number;
}

interface ZohoTicketResponse {
  data: ZohoTicket[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ZohoConversationsResponse {
  data: ZohoConversation[];
}

/**
 * GET /api/tickets/[ticketNumber]
 * Fetch detailed information for a specific ticket
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { ticketNumber } = await context.params;

    if (!ticketNumber) {
      return NextResponse.json(
        { success: false, error: 'Ticket number is required' },
        { status: 400 }
      );
    }

    // Extract just the number from TICK-XXX format
    // If ticketNumber is "TICK-409", extract "409"
    // If it's already just "409", use as-is
    const numericTicketNumber = ticketNumber.replace(/^(TICK|DESK)-?/i, '');
    console.log('[API /tickets/[ticketNumber]] Original:', ticketNumber, '→ Numeric:', numericTicketNumber);

    // CHECK CACHE FIRST
    const cacheKey = numericTicketNumber;
    const cached = ticketCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log('[API /tickets] Returning cached data for:', numericTicketNumber);
      return NextResponse.json({
        success: true,
        ticket: cached.data,
        source: 'cache'
      });
    }

    // Create fresh Zoho client instance (matches /api/tickets/route.ts pattern)
    const zohoClient = new ZohoDeskClient({
      orgId: Number(process.env.ZOHO_ORG_ID) || 0,
      clientId: process.env.ZOHO_CLIENT_ID || '',
      clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
      refreshToken: process.env.ZOHO_REFRESH_TOKEN || '',
    });

    // Search for the ticket by ticket number
    let ticket: ZohoTicket | undefined;

    // Approach 1: Use Zoho search API
    try {
      const searchResponse = await zohoClient.request<ZohoTicketResponse>(
        `/api/v1/tickets/search?ticketNumber=${numericTicketNumber}`
      );
      ticket = searchResponse.data?.[0];
    } catch {
      // Search API may not be available — fall back to list
    }

    // Approach 2: Fall back to listing with filter
    if (!ticket) {
      const listResponse = await zohoClient.request<ZohoTicketResponse>(
        `/api/v1/tickets?limit=100&sortBy=-createdTime`
      );
      ticket = listResponse.data?.find((t: ZohoTicket) =>
        t.ticketNumber === numericTicketNumber || t.ticketNumber === ticketNumber
      );
    }

    if (!ticket) {
      // Return mock data instead of 404 (demo mode fallback)
      return NextResponse.json({
        success: true,
        ticket: getMockTicketDetail(ticketNumber),
        source: 'mock',
        message: `Ticket #${ticketNumber} not found in Zoho. Using mock data for demo.`
      });
    }

    // Fetch conversations/threads for the ticket WITH full content
    let conversations: ImportedZohoConversation[] = [];
    try {
      console.log('[API /tickets] Fetching conversations for ticket:', ticket.id);
      const conversationsResponse = await zohoClient.getConversations(ticket.id);
      const conversationSummaries = conversationsResponse.data || [];

      console.log('[API /tickets] Found', conversationSummaries.length, 'threads, fetching full content...');

      // Fetch full content for each thread in parallel
      const threadPromises = conversationSummaries.map(async (conv) => {
        try {
          console.log('[API /tickets] Fetching thread:', conv.id);
          const threadResponse = await zohoClient.getThread(ticket.id, conv.id);

          // Merge full content into conversation object
          return {
            ...conv,
            content: threadResponse.content || conv.summary, // Full content from thread API
            contentType: threadResponse.contentType || 'plainText', // Track if it's HTML or plain text
            summary: conv.summary, // Keep original summary
          };
        } catch (err) {
          console.warn(`[API /tickets] Failed to fetch thread ${conv.id}:`, err);
          // Fallback to summary if individual thread fetch fails
          return {
            ...conv,
            content: conv.summary, // Use summary as fallback
          };
        }
      });

      // Wait for all threads to complete
      conversations = await Promise.all(threadPromises);
      console.log('[API /tickets] Successfully fetched full content for', conversations.length, 'threads');

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[API /tickets] Failed to fetch conversations:', errorMessage);
      // Continue without conversations
    }

    // Fetch Jira escalation status from Supabase
    let isJiraTicketCreated = false;
    let jiraTicketId: string | null = null;
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      );

      const { data: ticketData } = await supabase
        .from('tickets_demo')
        .select('isJiraTicketCreated, jiraTicketId')
        .eq('ticket_number', parseInt(numericTicketNumber, 10))
        .single();

      if (ticketData) {
        if (ticketData.isJiraTicketCreated === true) {
          isJiraTicketCreated = true;
          console.log('[API /tickets/[ticketNumber]] Ticket already escalated to Jira');
        }
        if (ticketData.jiraTicketId) {
          jiraTicketId = ticketData.jiraTicketId;
          console.log('[API /tickets/[ticketNumber]] Jira ticket ID:', jiraTicketId);
        }
      }
    } catch (error: unknown) {
      console.warn('[API /tickets/[ticketNumber]] Failed to fetch Jira status from Supabase:', error);
      // Continue without Jira status
    }

    // Transform to detailed ticket format
    const detailedTicket = {
      // Basic Info
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject || 'No subject',
      description: ticket.description || '',
      priority: mapPriority(ticket.priority),
      status: ticket.status || 'Open',
      channel: ticket.channel || 'Unknown',

      // Customer/Contact Info
      contact: {
        name: [ticket.contact?.firstName, ticket.contact?.lastName]
          .filter(Boolean)
          .join(' ') || 'Unknown',
        email: ticket.contact?.email || '',
        phone: ticket.contact?.phone || ticket.contact?.mobile || '',
        id: ticket.contact?.id || '',
      },

      // Assignment
      assignee: {
        name: ticket.assignee?.name || null,
        email: ticket.assignee?.email || null,
        id: ticket.assignee?.id || null,
      },

      // Metadata
      createdTime: ticket.createdTime,
      modifiedTime: ticket.modifiedTime || ticket.createdTime,
      closedTime: ticket.closedTime,
      dueDate: ticket.dueDate,

      // Categorization
      department: ticket.department?.name || null,
      category: ticket.category?.name || null,
      subCategory: ticket.subCategory || null,
      product: ticket.productId?.productName || null,

      // Custom Fields
      customFields: ticket.cf || {},

      // SLA Tracking
      sla: {
        responseDue: ticket.responseDue,
        resolutionDue: ticket.resolutionDue,
        responseOverdue: ticket.isResponseOverdue || false,
        resolutionOverdue: ticket.isOverDue || false,
      },

      // Conversations/Timeline
      conversations: conversations.map((conv: ImportedZohoConversation) => ({
        id: conv.id,
        direction: mapDirection(conv.direction), // in -> INCOMING, out -> OUTGOING
        summary: conv.summary || '',
        content: conv.content || conv.summary || '',
        contentType: conv.contentType || 'plainText',
        from: conv.from || '',
        to: conv.to || '',
        cc: conv.cc || [],
        bcc: conv.bcc || [],
        author: typeof conv.author === 'string' ? conv.author : conv.author?.name || 'Unknown',
        createdTime: conv.createdTime,
        isPublic: true,
        attachments: (conv.attachments || []).map((att: ZohoAttachment) => ({
          id: att.id,
          name: att.name,
          size: att.size,
          href: att.href,
        })),
      })),

      // Tags
      tags: ticket.tags || [],

      // Additional metadata
      webUrl: ticket.webUrl || '',
      commentCount: ticket.commentCount || 0,
      threadCount: ticket.threadCount || 0,
      attachmentCount: ticket.attachmentCount || 0,

      // Jira escalation status
      isJiraTicketCreated,
      jiraTicketId,
    };

    // CACHE THE RESULT
    ticketCache.set(cacheKey, {
      data: detailedTicket,
      timestamp: Date.now()
    });
    console.log('[API /tickets] Cached ticket data for:', numericTicketNumber);

    return NextResponse.json({
      success: true,
      ticket: detailedTicket,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch ticket details';
    console.error('[API /tickets/[ticketNumber]] Error:', errorMessage);

    // Return mock data fallback instead of error (for demo purposes)
    const { ticketNumber } = await context.params;
    return NextResponse.json({
      success: true,
      ticket: getMockTicketDetail(ticketNumber),
      source: 'mock',
      message: `Zoho API error: ${errorMessage}. Using mock data.`
    });
  }
}

/**
 * Generate mock ticket detail for demo/fallback purposes
 */
function getMockTicketDetail(ticketNumber: string) {
  return {
    // Basic Info
    id: '1234567890',
    ticketNumber: ticketNumber,
    subject: 'Login not working after password reset',
    description: 'Customer reports unable to log in after completing password reset process. Tried multiple times with different browsers. Error message: "Invalid credentials" appears even with correct new password.',
    priority: 'High' as const,
    status: 'Open',
    channel: 'Email',

    // Customer/Contact Info
    contact: {
      name: 'John Smith',
      email: 'john.smith@example.com',
      phone: '+1 (555) 123-4567',
      id: 'contact_001',
    },

    // Assignment
    assignee: {
      name: 'Sarah Johnson',
      email: 'sarah.j@company.com',
      id: 'agent_001',
    },

    // Metadata
    createdTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    modifiedTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    closedTime: null,
    dueDate: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),

    // Categorization
    department: 'Technical Support',
    category: 'Authentication',
    subCategory: 'Password Reset',
    product: 'Enterprise Portal',

    // Custom Fields
    customFields: {},

    // SLA Tracking
    sla: {
      responseDue: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      resolutionDue: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      responseOverdue: false,
      resolutionOverdue: false,
    },

    // Conversations/Timeline
    conversations: [
      {
        id: 'conv_001',
        direction: 'INCOMING',
        summary: 'Initial customer report',
        content: 'I reset my password but now I cannot log in. I get an "Invalid credentials" error even though I know the password is correct. I tried on Chrome, Firefox, and Safari. Same issue on all browsers.',
        contentType: 'plainText',
        from: 'john.smith@example.com',
        to: 'support@company.com',
        cc: [],
        bcc: [],
        author: 'John Smith',
        createdTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        isPublic: true,
        attachments: [],
      },
      {
        id: 'conv_002',
        direction: 'OUTGOING',
        summary: 'Agent response - investigating',
        content: 'Thank you for contacting us. I\'m sorry to hear you\'re having trouble logging in. I\'m investigating your account now and will get back to you shortly with a solution.',
        contentType: 'plainText',
        from: 'sarah.j@company.com',
        to: 'john.smith@example.com',
        cc: [],
        bcc: [],
        author: 'Sarah Johnson',
        createdTime: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
        isPublic: true,
        attachments: [],
      },
    ],

    // Tags
    tags: ['password', 'login', 'authentication'],

    // Additional metadata
    webUrl: `https://desk.zoho.com/support/tickets/${ticketNumber}`,
    commentCount: 2,
    threadCount: 1,
    attachmentCount: 0,
  };
}

/**
 * Map Zoho conversation direction to display format
 */
function mapDirection(zohoDirection: string | undefined): string {
  const direction = (zohoDirection || '').toLowerCase();

  if (direction === 'in') {
    return 'INCOMING';
  } else if (direction === 'out') {
    return 'OUTGOING';
  }

  return 'INTERNAL';
}

/**
 * Map Zoho priority to standard format
 */
function mapPriority(zohoPriority: string | undefined): 'High' | 'Medium' | 'Low' {
  const priority = (zohoPriority || '').toLowerCase();

  if (priority === 'high' || priority === 'urgent') {
    return 'High';
  } else if (priority === 'low') {
    return 'Low';
  }

  return 'Medium';
}
