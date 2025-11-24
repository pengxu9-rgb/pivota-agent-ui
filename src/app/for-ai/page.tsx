import Link from 'next/link';
import { Package, Code, Sparkles, ArrowRight } from 'lucide-react';

export default function ForAiPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white font-sans text-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <header className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Developer & AI Agent Documentation</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Pivota Shopping Agent Protocol
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Standardized interface for LLMs (ChatGPT, Claude, Perplexity) to discover,
            recommend, and facilitate purchases from the Pivota merchant network.
          </p>
        </header>

        <div className="space-y-12">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Code className="w-6 h-6 text-blue-600" />
              Integration Endpoints
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-6 rounded-2xl border bg-white shadow-sm">
                <h3 className="font-semibold mb-2 text-blue-600">AI Manifest</h3>
                <code className="block bg-slate-50 p-3 rounded text-sm text-slate-600 mb-2">
                  GET /.well-known/ai-plugin.json
                </code>
                <p className="text-sm text-slate-500">
                  Plugin configuration for ChatGPT and compatible agents. Defines authentication, api type, and description.
                </p>
              </div>
              <div className="p-6 rounded-2xl border bg-white shadow-sm">
                <h3 className="font-semibold mb-2 text-green-600">OpenAPI Spec</h3>
                <code className="block bg-slate-50 p-3 rounded text-sm text-slate-600 mb-2">
                  GET /openapi.json
                </code>
                <p className="text-sm text-slate-500">
                  Complete API definition including schema for catalog search and product details.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Package className="w-6 h-6 text-purple-600" />
              Core Capabilities
            </h2>
            
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
                <h3 className="text-lg font-semibold mb-2">1. Product Discovery</h3>
                <code className="block bg-white p-3 rounded border border-slate-200 text-sm mb-3">
                  GET /api/catalog?q=keyword&limit=10
                </code>
                <p className="text-slate-600">
                  Returns a list of products matching the search query. The response is optimized for LLM context windows, 
                  providing clear product names, pricing, availability, and tracked &quot;Buy Now&quot; links.
                </p>
                <div className="mt-4 p-3 bg-blue-50 text-blue-800 text-sm rounded-lg">
                  <strong>Note:</strong> This endpoint includes a &quot;why_recommended&quot; field that helps LLMs explain 
                  selection rationale to users.
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
                <h3 className="text-lg font-semibold mb-2">2. Product Detail</h3>
                <code className="block bg-white p-3 rounded border border-slate-200 text-sm mb-3">
                  GET /api/catalog/:id
                </code>
                <p className="text-slate-600">
                  Fetches detailed information for a specific product, including full description and attributes.
                  Use this when a user asks for more details about a specific item found in search.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">How to Test</h2>
            <div className="prose text-slate-600">
              <p>
                You can test the integration by adding the manifest URL to your Custom GPT or agent configuration:
              </p>
              <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto">
https://agent.pivota.cc/.well-known/ai-plugin.json
              </pre>
              <p className="mt-4">
                Or visit the catalog endpoint directly to see the JSON structure:
              </p>
              <Link 
                href="/api/catalog?q=water" 
                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                target="_blank"
              >
                Test Search API <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
