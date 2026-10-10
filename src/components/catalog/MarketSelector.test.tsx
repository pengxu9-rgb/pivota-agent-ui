import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MarketSelector, { writeMarketChoice } from './MarketSelector';
import { useCartStore } from '@/store/cartStore';

const LINE = { id: 'm1:v1', product_id: 'p1', variant_id: 'v1', title: 'Serum', price: 23, currency: 'USD', quantity: 1, imageUrl: '/placeholder.svg', merchant_id: 'm1' };

const clearCookies = () => {
  for (const name of ['pv_market', 'pv_located_market']) document.cookie = `${name}=; path=/; max-age=0`;
};

describe('MarketSelector', () => {
  let reload: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    clearCookies();
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload, protocol: 'http:' },
    });
  });
  afterEach(() => {
    cleanup();
    clearCookies();
  });

  it('shows the located market as the automatic option when no choice is made (served markets only)', async () => {
    document.cookie = 'pv_located_market=US; path=/';
    await act(async () => { render(<MarketSelector />); });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select.dataset.market).toBe('US');
    expect(select.dataset.marketSource).toBe('located');
    expect(screen.getByText('Market from your location')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'United States (auto)' })).toBeTruthy();
  });

  it('a located SG buyer sees Singapore (served since 2026-10-10), marked as located, and can still choose another market', async () => {
    document.cookie = 'pv_located_market=SG; path=/';
    await act(async () => { render(<MarketSelector />); });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.dataset.market).toBe('SG');
    expect(select.dataset.marketSource).toBe('located');
    expect(screen.getByRole('option', { name: 'Singapore (auto)' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'US' } });
    expect(document.cookie).toContain('pv_market=US');
  });

  it('a located JP buyer (priceable, not served) sees the storefront market, and can still CHOOSE Japan from the list', async () => {
    document.cookie = 'pv_located_market=JP; path=/';
    await act(async () => { render(<MarketSelector />); });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.dataset.market).toBe('US');
    expect(select.dataset.marketSource).toBe('storefront');
    expect(screen.getByRole('option', { name: 'Japan' })).toBeTruthy();
    fireEvent.change(select, { target: { value: 'JP' } });
    expect(document.cookie).toContain('pv_market=JP');
  });

  it('shows the storefront market when nothing places the buyer', async () => {
    await act(async () => { render(<MarketSelector />); });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.dataset.market).toBe('US');
    expect(select.dataset.marketSource).toBe('storefront');
    expect(screen.getByRole('option', { name: 'United States (auto)' })).toBeTruthy();
  });

  it('choosing a market writes the choice cookie, empties the bag, and reloads', async () => {
    document.cookie = 'pv_located_market=US; path=/';
    useCartStore.getState().clearCart();
    useCartStore.getState().addItem(LINE);
    expect(useCartStore.getState().items).toHaveLength(1);
    await act(async () => { render(<MarketSelector />); });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'SG' } });
    expect(document.cookie).toContain('pv_market=SG');
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('re-choosing the market already in force keeps the bag', async () => {
    document.cookie = 'pv_located_market=US; path=/';
    useCartStore.getState().clearCart();
    useCartStore.getState().addItem(LINE);
    await act(async () => { render(<MarketSelector />); });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'US' } });
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a chosen market is selected, and "Use my location" clears the choice', async () => {
    document.cookie = 'pv_market=SG; path=/';
    document.cookie = 'pv_located_market=US; path=/';
    await act(async () => { render(<MarketSelector compact />); });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('SG');
    expect(select.dataset.marketSource).toBe('choice');
    expect(screen.getByRole('option', { name: 'Use my location' })).toBeTruthy();
    fireEvent.change(select, { target: { value: '' } });
    expect(document.cookie).not.toContain('pv_market=SG');
    expect(document.cookie).toContain('pv_located_market=US');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('writeMarketChoice is the only writer, and it writes a year-long lax cookie', () => {
    writeMarketChoice('GB');
    expect(document.cookie).toContain('pv_market=GB');
    writeMarketChoice(null);
    expect(document.cookie).not.toContain('pv_market=');
  });
});
