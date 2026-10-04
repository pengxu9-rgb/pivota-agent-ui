import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DecisionComparison } from './DecisionComparison';
import { evaluateProduct } from '@/features/shopping/decision';
import { deriveBrief } from '@/features/shopping/model';
import { MAX_EVIDENCE_AGE_MS, summarizeDecisionItems } from '@/features/shopping/evidenceFreshness';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/image', () => ({ default: ({ fill, unoptimized, ...props }: any) => <img {...props} alt={props.alt || ''} /> }));
vi.mock('next/link', () => ({ default: ({ prefetch, children, ...props }: any) => <a {...props}>{children}</a> }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('visible verification and its positive summary expire even without a reload', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T00:00:00Z'));
  const product = { product_id: 'sig_alpha', merchant_id: 'seller-a', title: 'Alpha Moisturizer', description: '', price: 12, currency: 'USD', in_stock: true };
  const ingredient = { raw_text: 'Water, Glycerin', fragrance_free_claim: 'Fragrance-free', is_complete: true, source_url: 'https://retailer.example/alpha', source_observed_at: new Date().toISOString() };
  const pdp = { modules: [{ type: 'canonical', data: { pdp_payload: { product, modules: [{ type: 'ingredients_inci', data: ingredient }] } } }] };
  const item = evaluateProduct(product, pdp, deriveBrief('Find fragrance-free moisturizer'));
  expect(item.fragrance).toBe('verified');
  render(<DecisionComparison report={{ summary: summarizeDecisionItems([item], true), items: [item], compared: true, fragranceRequired: true, includeIngredients: true }} />);
  expect(screen.getByText('Fragrance-free: Sourced claim verified')).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(MAX_EVIDENCE_AGE_MS + 1); });
  expect(screen.queryByText('Fragrance-free: Sourced claim verified')).not.toBeInTheDocument();
  expect(screen.getByText('Fragrance-free: Unverified')).toBeInTheDocument();
  expect(screen.getByText(/None of these products has verified/)).toBeInTheDocument();
  expect(screen.queryByText(/1 product has sourced/)).not.toBeInTheDocument();
});
