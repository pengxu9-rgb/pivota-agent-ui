'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, History, ShoppingCart, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProductCard from '@/components/product/ProductCard';
import { useCartStore } from '@/store/cartStore';
import {
  clearBrowseHistory as clearAccountBrowseHistory,
  getBrowseHistory,
} from '@/lib/api';
import {
  mergeHistoryItems,
  hasPositiveHistoryPrice,
  type HistoryItem,
} from './historyItems';
import { hydrateZeroPriceItems } from './priceHydration';
import { extractPositivePriceAmount } from '@/lib/price';

const LOCAL_HISTORY_KEY = 'browse_history';
const LOCAL_HISTORY_VERSION_KEY = 'browse_history_version';
const LOCAL_HISTORY_VERSION = 'positive-price-v1';

function priceFromHistoryItem(item: any): number {
  return extractPositivePriceAmount(item?.price);
}

function readLocalHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  const savedHistory = localStorage.getItem(LOCAL_HISTORY_KEY);
  if (!savedHistory) {
    localStorage.setItem(LOCAL_HISTORY_VERSION_KEY, LOCAL_HISTORY_VERSION);
    return [];
  }
  try {
    const parsed = JSON.parse(savedHistory);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => ({
        product_id: String(item?.product_id || '').trim(),
        merchant_id:
          item?.merchant_id == null ? undefined : String(item.merchant_id).trim() || undefined,
        title: String(item?.title || 'Untitled product').trim() || 'Untitled product',
        price: priceFromHistoryItem(item),
        image: String(item?.image || item?.image_url || '/placeholder.svg').trim() || '/placeholder.svg',
        description:
          item?.description == null ? undefined : String(item.description).trim() || undefined,
        timestamp: Number(item?.timestamp) || Date.now(),
      }))
      .filter((item: HistoryItem) => Boolean(item.product_id))
      .sort((a: HistoryItem, b: HistoryItem) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to load local browse history:', error);
    return [];
  }
}

function writeLocalHistory(items: HistoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    const positiveItems = items.filter(hasPositiveHistoryPrice);
    localStorage.setItem(LOCAL_HISTORY_VERSION_KEY, LOCAL_HISTORY_VERSION);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(positiveItems));
  } catch {
    // ignore storage errors
  }
}

function mapRemoteHistory(items: any[]): HistoryItem[] {
  return items
    .map((item: any) => ({
      product_id: String(item?.product_id || '').trim(),
      merchant_id:
        item?.merchant_id == null ? undefined : String(item.merchant_id).trim() || undefined,
      title: String(item?.title || 'Untitled product').trim() || 'Untitled product',
      price: priceFromHistoryItem(item),
      image: String(item?.image_url || '/placeholder.svg').trim() || '/placeholder.svg',
      description:
        item?.description == null ? undefined : String(item.description).trim() || undefined,
      timestamp:
        Number(item?.timestamp) ||
        (item?.viewed_at ? new Date(item.viewed_at).getTime() : Date.now()) ||
        Date.now(),
      }))
      .filter((item: HistoryItem) => Boolean(item.product_id))
      .sort((a: HistoryItem, b: HistoryItem) => b.timestamp - a.timestamp);
}

function resolvedHistoryItems(items: HistoryItem[]): HistoryItem[] {
  return items.filter(hasPositiveHistoryPrice);
}

export default function BrowseHistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { items, open } = useCartStore();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const localItems = readLocalHistory();
      try {
        const remote = await getBrowseHistory(100);
        if (cancelled) return;
        const remoteItems = mapRemoteHistory(remote?.items || []);
        if (remoteItems.length > 0) {
          const mergedItems = mergeHistoryItems(remoteItems, localItems);
          const hydratedItems = await hydrateZeroPriceItems(mergedItems);
          const resolvedItems = resolvedHistoryItems(hydratedItems);
          if (cancelled) return;
          setHistory(resolvedItems);
          writeLocalHistory(resolvedItems);
        } else {
          const hydratedItems = await hydrateZeroPriceItems(localItems);
          const resolvedItems = resolvedHistoryItems(hydratedItems);
          if (cancelled) return;
          setHistory(resolvedItems);
          writeLocalHistory(resolvedItems);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load account browse history:', error);
        const hydratedItems = await hydrateZeroPriceItems(localItems);
        if (cancelled) return;
        const resolvedItems = resolvedHistoryItems(hydratedItems);
        setHistory(resolvedItems);
        writeLocalHistory(resolvedItems);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearHistory = async () => {
    localStorage.removeItem(LOCAL_HISTORY_KEY);
    setHistory([]);
    try {
      await clearAccountBrowseHistory();
    } catch {
      // ignore accounts clear failure; local clear already applied
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      {/* Top bar */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between bg-white px-3"
        style={{
          height: '54px',
          borderBottomWidth: '0.5px',
          borderColor: 'rgba(44,44,42,0.08)',
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="h-9 w-9 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" style={{ color: '#2C2C2A' }} />
        </button>
        <h1 className="text-[14px] font-semibold" style={{ color: '#2C2C2A' }}>Browse history</h1>
        <button
          onClick={open}
          className="relative h-9 w-9 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
          aria-label="Cart"
        >
          <ShoppingCart className="h-5 w-5" style={{ color: '#2C2C2A' }} strokeWidth={1.7} />
          {itemCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
              style={{ backgroundColor: '#D85A30' }}
            >
              {itemCount > 9 ? '9+' : itemCount}
            </span>
          )}
        </button>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-3 lg:px-6 py-4">
        {/* Section header with count + clear */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[12px]" style={{ color: '#2C2C2A99' }}>
            {history.length} {history.length === 1 ? 'product' : 'products'} viewed
          </p>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors active:bg-[#FAECE7]"
              style={{
                color: '#993C1D',
                borderWidth: '0.5px',
                borderColor: 'rgba(216, 90, 48, 0.3)',
              }}
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        {/* History Grid */}
        {loading ? (
          <div className="text-center py-16 text-[13px]" style={{ color: '#2C2C2A99' }}>
            Loading browse history…
          </div>
        ) : history.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 space-y-3"
          >
            <span
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: '#EEEDFE' }}
            >
              <History className="h-6 w-6" style={{ color: '#534AB7' }} strokeWidth={1.6} />
            </span>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold" style={{ color: '#2C2C2A' }}>No browsing history yet</p>
              <p className="text-[12px]" style={{ color: '#2C2C2A99' }}>
                Start exploring products to see them here
              </p>
            </div>
            <Link
              href="/products"
              className="inline-flex items-center justify-center rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-opacity active:opacity-85"
              style={{ backgroundColor: '#534AB7' }}
            >
              Browse products
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5"
          >
            {history.map((item, index) => (
              <motion.div
                key={`${item.product_id}-${item.timestamp}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.4) }}
              >
                <ProductCard
                  product_id={item.product_id}
                  merchant_id={item.merchant_id}
                  title={item.title}
                  price={item.price}
                  image={item.image}
                  description={item.description}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
