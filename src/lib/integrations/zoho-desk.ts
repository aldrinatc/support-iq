/**
 * Zoho Desk API Integration
 * OAuth token management, conversations, and reply functionality
 */

import type {
  ZohoDeskConfig,
  ZohoTokenResponse,
  ZohoConversationsResponse,
  ZohoThreadResponse,
  ZohoSendReplyRequest,
  ZohoSendReplyResponse,
  ZohoErrorResponse,
} from '@/types/zoho';

const DEFAULT_BASE_URL = 'https://desk.zoho.com';
const TOKEN_API_URL = 'https://accounts.zoho.com/oauth/v2/token';

/**
 * Global Token Manager (Singleton)
 * Prevents race conditions when multiple components request tokens simultaneously
 */
class ZohoTokenManager {
  private static instance: ZohoTokenManager;
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;
  private refreshPromise: Promise<string> | null = null;
  private config: ZohoDeskConfig | null = null;

  private constructor() {}

  static getInstance(): ZohoTokenManager {
    if (!ZohoTokenManager.instance) {
      ZohoTokenManager.instance = new ZohoTokenManager();
    }
    return ZohoTokenManager.instance;
  }

  setConfig(config: ZohoDeskConfig) {
    this.config = config;
  }

  async getAccessToken(): Promise<string> {
    if (!this.config) {
      throw new Error('Token manager not configured');
    }

    // Check if current token is still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      console.log('[Zoho] Token refresh already in progress, waiting...');
      return this.refreshPromise;
    }

    // Start new refresh
    this.refreshPromise = this.refreshToken();

    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async refreshToken(): Promise<string> {
    if (!this.config) {
      throw new Error('Token manager not configured');
    }

    console.log('[Zoho] Refreshing access token...');

    const params = new URLSearchParams({
      refresh_token: this.config.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    });

    const response = await fetch(`${TOKEN_API_URL}?${params.toString()}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = response.statusText;

      try {
        const error: ZohoErrorResponse = JSON.parse(errorText);
        errorMessage = error.message || errorMessage;
      } catch {
        // If JSON parsing fails, use the text response
        errorMessage = errorText || errorMessage;
      }

      console.error('[Zoho] OAuth refresh failed:', errorMessage);
      throw new Error(`Zoho OAuth failed: ${errorMessage}`);
    }

    const data: ZohoTokenResponse = await response.json();

    // Store token and expiry (expires_in is in seconds)
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 min buffer

    console.log('[Zoho] Token refreshed successfully, expires in', data.expires_in, 'seconds');

    return this.accessToken;
  }
}

/**
 * Zoho Desk API Client
 */
export class ZohoDeskClient {
  private config: ZohoDeskConfig;
  private tokenManager: ZohoTokenManager;

  constructor(config: ZohoDeskConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    };

    // Use singleton token manager
    this.tokenManager = ZohoTokenManager.getInstance();
    this.tokenManager.setConfig(this.config);
  }

  /**
   * Get valid access token (refresh if expired)
   */
  private async getAccessToken(): Promise<string> {
    return this.tokenManager.getAccessToken();
  }

  /**
   * Make authenticated API request
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'orgId': this.config.orgId.toString(),
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const error: ZohoErrorResponse = await response.json();
        errorMessage = error.message || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(`Zoho Desk API error: ${errorMessage}`);
    }

    return response.json();
  }

  /**
   * Get all conversations for a ticket
   */
  async getConversations(ticketId: string): Promise<ZohoConversationsResponse> {
    return this.request<ZohoConversationsResponse>(
      `/api/v1/tickets/${ticketId}/conversations`
    );
  }

  /**
   * Get specific thread details with full content
   */
  async getThread(ticketId: string, threadId: string): Promise<ZohoThreadResponse> {
    return this.request<ZohoThreadResponse>(
      `/api/v1/tickets/${ticketId}/threads/${threadId}?include=plainText`
    );
  }

  /**
   * Send reply to ticket
   */
  async sendReply(
    ticketId: string,
    reply: ZohoSendReplyRequest
  ): Promise<ZohoSendReplyResponse> {
    return this.request<ZohoSendReplyResponse>(
      `/api/v1/tickets/${ticketId}/sendReply`,
      {
        method: 'POST',
        body: JSON.stringify(reply),
      }
    );
  }

  /**
   * Get ticket details
   */
  async getTicket(ticketId: string): Promise<unknown> {
    return this.request(`/api/v1/tickets/${ticketId}`);
  }
}

/**
 * Create Zoho Desk client from environment variables
 */
export function createZohoDeskClient(): ZohoDeskClient {
  const orgId = process.env.ZOHO_ORG_ID;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!orgId || !clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Zoho Desk configuration. Required env vars: ZOHO_ORG_ID, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN'
    );
  }

  return new ZohoDeskClient({
    orgId: parseInt(orgId, 10),
    clientId,
    clientSecret,
    refreshToken,
  });
}

/**
 * Singleton instance
 */
let zohoDeskClient: ZohoDeskClient | null = null;

export function getZohoDeskClient(): ZohoDeskClient {
  if (!zohoDeskClient) {
    zohoDeskClient = createZohoDeskClient();
  }
  return zohoDeskClient;
}
