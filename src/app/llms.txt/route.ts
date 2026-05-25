/**
 * /llms.txt — root-level markdown index for LLM agents.
 *
 * Background (Stage 3b-3 of plans/rosy-mixing-bengio.md):
 *
 * The llms.txt convention (proposed by Jeremy Howard / Answer.AI;
 * see https://llmstxt.org) is a structured markdown file at the
 * domain root that an LLM agent reads INSTEAD of scraping raw HTML.
 * It's deliberately small + curated — meant to fit in a context
 * window — and lists the canonical URLs the site wants surfaced.
 *
 * Pivota's role here: every PDP we want LLMs to cite gets a stable
 * `agent.pivota.cc/products/sig_*` URL with rich Product JSON-LD
 * (Stage 3b-1). llms.txt advertises the index so LLM agents don't
 * have to discover PDPs by crawling.
 *
 * Helpers live in ./utils to satisfy Next.js App Router's rule that
 * route.ts may only export GET/POST/etc + config flags. Tests import
 * from utils directly.
 */

import {
  _buildSeedSection,
  _enrichWithRuntimeProducts,
  _renderMarkdown,
} from './utils';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const seeds = _buildSeedSection();
  const enriched = await _enrichWithRuntimeProducts(seeds);
  const body = _renderMarkdown(enriched);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Cache 1h at the CDN level — matches the public sitemap routes. New seeds
      // added to sitemap-seeds.ts ship within an hour without a
      // fresh deploy.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
