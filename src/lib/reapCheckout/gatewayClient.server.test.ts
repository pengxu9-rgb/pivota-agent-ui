// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { callUcpTool, readAgentApiKey, readGatewayBase, readToolCallBody } from './gatewayClient.server';
import { awaitingApprovalCheckout, rpcResult } from './__fixtures__/checkouts';

const KEY = `ak_live_${'a'.repeat(64)}`;

describe('gateway UCP door client', () => {
  it('POSTs one JSON-RPC tools/call to /ucp/mcp with the two credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(rpcResult(awaitingApprovalCheckout())), { status: 200 }));
    const out = await callUcpTool({
      base: 'http://localhost:8081',
      apiKey: KEY,
      userToken: 'jwt.token.here',
      tool: 'get_checkout',
      toolArgs: { meta: {}, id: 'reap_x' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.kind).toBe('checkout');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:8081/ucp/mcp');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Agent-API-Key']).toBe(KEY);
    expect(headers['X-Agent-User-JWT']).toBe('jwt.token.here');
    expect(headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init.body))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_checkout', arguments: { meta: {}, id: 'reap_x' } },
    });
  });

  it('tolerates the door\'s keep-alive newlines before the body', async () => {
    const fetchImpl = vi.fn(async () => new Response(`\n\n\n${JSON.stringify(rpcResult(awaitingApprovalCheckout()))}`, { status: 200 }));
    const out = await callUcpTool({ base: 'http://localhost:1', apiKey: KEY, userToken: 't', tool: 'create_checkout', toolArgs: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out.kind).toBe('checkout');
  });

  it('reads a tool error, an rpc error, a non-200 and a network failure', async () => {
    expect(readToolCallBody(rpcResult({ error: { code: 'QUOTE_NOT_FOUND', message: 'x' } }, true))).toMatchObject({ kind: 'tool_error', code: 'QUOTE_NOT_FOUND' });
    expect(readToolCallBody({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Internal error.' } })).toMatchObject({ kind: 'unavailable' });
    const non200 = await callUcpTool({ base: 'http://localhost:1', apiKey: KEY, userToken: 't', tool: 'get_checkout', toolArgs: {}, fetchImpl: (async () => new Response('Cannot POST', { status: 404 })) as unknown as typeof fetch });
    expect(non200).toMatchObject({ kind: 'unavailable', status: 404 });
    const down = await callUcpTool({ base: 'http://localhost:1', apiKey: KEY, userToken: 't', tool: 'get_checkout', toolArgs: {}, fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
    expect(down).toMatchObject({ kind: 'unavailable', detail: 'gateway_unreachable' });
  });

  it('reads config: only a Pivota/localhost base, only a well-formed agent key', () => {
    expect(readGatewayBase({ REAP_CHECKOUT_GATEWAY_BASE_URL: 'http://localhost:8081/' } as any)).toBe('http://localhost:8081');
    expect(readGatewayBase({ REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://gateway-abc-uw.a.run.app' } as any)).toBeNull();
    expect(readGatewayBase({ REAP_CHECKOUT_GATEWAY_BASE_URL: 'https://evil.example' } as any)).toBeNull();
    expect(readAgentApiKey({ REAP_CHECKOUT_AGENT_API_KEY: KEY } as any)).toBe(KEY);
    expect(readAgentApiKey({ REAP_CHECKOUT_AGENT_API_KEY: 'sk_test_123' } as any)).toBeNull();
  });
});
