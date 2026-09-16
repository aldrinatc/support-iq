/** Server-only transport. Synced to standalone apps by scripts/sync-ai-runtime.mjs. */
const GATEWAY = 'https://ai-gateway.vercel.sh';
const RETRYABLE = new Set([400, 401, 402, 403, 404, 408, 429, 500, 502, 503, 504]);

export function gatewayToken(): string | undefined {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
}

export function aiKey(provider: 'anthropic' | 'openai'): string | undefined {
  return gatewayToken() || process.env[provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'];
}

export function currentModel(model: string): string {
  if (/^claude-(3|sonnet-4-20250514|opus-4-20250514)/.test(model)) {
    return model.includes('haiku') ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
  }
  return model;
}

/** Approved gateway generation path: OpenAI only. Embeddings stay on their existing provider. */
export async function resilientAIFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (!['api.anthropic.com', 'api.openai.com'].includes(url.hostname)) return fetch(request);
  if (url.pathname.endsWith('/embeddings')) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return Response.json({ error: { message: 'Embeddings unavailable' } }, { status: 503 });
    const headers = new Headers(request.headers);
    headers.set('authorization', `Bearer ${key}`);
    return fetch(new Request(request, { headers }));
  }
  const original = JSON.parse(await request.text());
  const gateway = gatewayToken();
  const directKey = process.env[url.hostname === 'api.anthropic.com' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'];
  const routes = [
    ...(gateway ? [{ gateway: true, key: gateway }] : []),
    ...(directKey ? [{ gateway: false, key: directKey }] : []),
  ];
  let last: Response | undefined;
  for (const route of routes) {
    const headers = new Headers(request.headers);
    headers.delete('authorization');
    headers.delete('x-api-key');
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    if (route.gateway || url.hostname === 'api.openai.com') headers.set('authorization', `Bearer ${route.key}`);
    else headers.set('x-api-key', route.key);
    const body = { ...original };
    if (route.gateway) {
      // A server-controlled allowlist prevents client requests selecting another vendor/model.
      body.model = 'openai/gpt-4o-mini';
      body.providerOptions = { gateway: { only: ['openai'] } };
    } else body.model = currentModel(original.model);
    try {
      last = await fetch(route.gateway ? `${GATEWAY}${url.pathname}` : request.url, {
        method: request.method, headers, body: JSON.stringify(body),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
      });
      if (last.ok || !RETRYABLE.has(last.status)) return last;
      console.warn('[ai-provider]', JSON.stringify({ provider: route.gateway ? 'gateway-openai' : url.hostname, status: last.status }));
    } catch {
      if (request.signal.aborted) throw new Error('AI request cancelled');
      console.warn('[ai-provider]', JSON.stringify({ provider: route.gateway ? 'gateway-openai' : url.hostname, status: 'timeout-or-network' }));
    }
  }
  return last || Response.json({ error: { message: 'AI service unavailable', type: 'service_unavailable' } }, { status: 503 });
}

export function anthropicOptions() {
  return { apiKey: aiKey('anthropic'), fetch: resilientAIFetch, maxRetries: 0, timeout: 35_000 };
}

export function openaiOptions() {
  return { apiKey: process.env.OPENAI_API_KEY || aiKey('openai'), fetch: resilientAIFetch, maxRetries: 0, timeout: 35_000 };
}

/** Cheap readiness check: no generation, prompts, or balance amount exposed publicly. */
export async function aiHealth() {
  const token = gatewayToken();
  if (!token) return { status: 'degraded', gateway: 'not_configured', funding: 'unknown' };
  try {
    const response = await fetch(`${GATEWAY}/v1/credits`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000), cache: 'no-store',
    });
    if (!response.ok) return { status: 'degraded', gateway: 'unavailable', funding: 'unknown' };
    const { balance } = await response.json();
    const available = Number(balance);
    const threshold = Number(process.env.AI_LOW_CREDIT_THRESHOLD || '2');
    return { status: available > threshold ? 'healthy' : 'degraded', gateway: available > 0 ? 'available' : 'unavailable', funding: available <= 0 ? 'exhausted' : available <= threshold ? 'low' : 'available' };
  } catch {
    return { status: 'degraded', gateway: 'unavailable', funding: 'unknown' };
  }
}
