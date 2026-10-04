import 'server-only';

// ONE JSON-RPC `tools/call` to the gateway's UCP-dialect commerce door (`POST /ucp/mcp`).
//
// Why this door and not `/ucp/v1/checkout-sessions`. The Reap lane lives inside the UCP MCP door's
// `create_checkout` / `get_checkout` (PIVOTA-Agent mcp-server/src/commerceToolSurface.js, the lane
// order Reap -> storefront escalation -> kernel). The gateway has NO REST binding of those tools:
// `/ucp/v1/*` is not routed anywhere in PIVOTA-Agent src/server.js and answers `Cannot GET` in
// production. So the UI calls the same door, with the same two credentials, any buyer agent uses.
// No gateway change: same dials, same mapping.
//
// Credentials (server-only env, never NEXT_PUBLIC):
//   REAP_CHECKOUT_AGENT_API_KEY   the calling agent's key, sent as X-Agent-API-Key (the door reads
//                                 the key from X-Agent-API-Key or Authorization: Bearer only)
//   X-Agent-User-JWT              minted per request, see buyerToken.server.ts
// The gateway forwards both to the backend rail and nothing else.
import { safePivotaServiceUrl } from '@/lib/returnUrl';
import { LOOPBACK_HOSTS, readPilotOrigins, reapCheckoutProfile } from './config';

const DEFAULT_TIMEOUT_MS = 12_000;

export type ToolCallOutcome =
  | { kind: 'checkout'; checkout: unknown }
  | { kind: 'tool_error'; code: string | null; message: string | null; reason: string | null; cause: string | null; reconciliationId: string | null }
  | { kind: 'unavailable'; status: number | null; detail: string };

/** The gateway base: LOOPBACK only (the local proxy to staging), http or https. Anything else is null. */
export function readGatewayBase(env: NodeJS.ProcessEnv = process.env): string | null {
  if (reapCheckoutProfile(env) === 'pilot') return readPilotOrigins(env)?.gatewayOrigin ?? null;
  const base = safePivotaServiceUrl(String(env.REAP_CHECKOUT_GATEWAY_BASE_URL || '').trim() || null);
  if (!base) return null;
  return LOOPBACK_HOSTS.has(new URL(base).hostname.toLowerCase()) ? base : null;
}

export function readAgentApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = String(env.REAP_CHECKOUT_AGENT_API_KEY || '').trim();
  return /^ak_(live_)?[0-9a-f]{64}$/.test(key) ? key : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The tool result's text content, parsed, as a checkout or a tool error. Exported for tests. */
export function readToolCallBody(body: unknown): ToolCallOutcome {
  if (!isRecord(body)) return { kind: 'unavailable', status: null, detail: 'malformed_rpc_body' };
  if (isRecord(body.error)) {
    return { kind: 'unavailable', status: null, detail: `rpc_error_${String(body.error.code ?? 'unknown')}` };
  }
  const result = isRecord(body.result) ? body.result : null;
  const content = result && Array.isArray(result.content) ? result.content : [];
  const first = content.find((c) => isRecord(c) && c.type === 'text' && typeof c.text === 'string') as
    | { text: string }
    | undefined;
  if (!first) return { kind: 'unavailable', status: null, detail: 'no_text_content' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(first.text);
  } catch {
    return { kind: 'unavailable', status: null, detail: 'unparseable_tool_text' };
  }
  if (result?.isError === true || (isRecord(parsed) && isRecord(parsed.error) && !parsed.id)) {
    // The door's tool error is `{ error: { code, message, retriable?, detail?: { reason, ... } } }`
    // (PIVOTA-Agent commerceToolSurface.js toToolError; the reason is buyerIntake's `acp_detail.reason`,
    // surfaced as `detail`).
    const err = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : {};
    const detail = isRecord(err.detail) ? err.detail : {};
    return {
      kind: 'tool_error',
      code: typeof err.code === 'string' ? err.code : null,
      message: typeof err.message === 'string' ? err.message.slice(0, 400) : null,
      reason: typeof detail.reason === 'string' ? detail.reason.slice(0, 80) : null,
      cause: typeof detail.cause === 'string' ? detail.cause.slice(0, 40) : null,
      reconciliationId: typeof detail.reconciliation_id === 'string' && /^[a-f0-9]{32}$/.test(detail.reconciliation_id) ? detail.reconciliation_id : null,
    };
  }
  return { kind: 'checkout', checkout: parsed };
}

export async function callUcpTool(args: {
  base: string;
  apiKey: string;
  userToken: string;
  tool: 'create_checkout' | 'get_checkout' | 'recover_checkout' | 'prepare_checkout' | 'resume_checkout';
  toolArgs: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ToolCallOutcome> {
  const fetchImpl = args.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${args.base}/ucp/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'X-Agent-API-Key': args.apiKey,
        'X-Agent-User-JWT': args.userToken,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: args.tool, arguments: args.toolArgs },
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { kind: 'unavailable', status: res.status, detail: 'gateway_http_error' };
    let body: unknown;
    try {
      // The door may commit 200 early and write keep-alive newlines before the JSON body.
      body = JSON.parse(text.trim());
    } catch {
      return { kind: 'unavailable', status: res.status, detail: 'unparseable_rpc_body' };
    }
    return readToolCallBody(body);
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    return { kind: 'unavailable', status: null, detail: aborted ? 'gateway_timeout' : 'gateway_unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
