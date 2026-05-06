'use client';

import Link from 'next/link';
import { MessageSquare, Compass, Package, User, type LucideIcon } from 'lucide-react';

export type BottomTabId = 'chat' | 'discover' | 'orders' | 'me';

type Tab = {
  id: BottomTabId;
  label: string;
  href: string;
  icon: LucideIcon;
};

const TABS: Tab[] = [
  { id: 'chat',     label: 'Chat',     href: '/',             icon: MessageSquare },
  { id: 'discover', label: 'Discover', href: '/products',     icon: Compass },
  { id: 'orders',   label: 'Orders',   href: '/orders',       icon: Package },
  { id: 'me',       label: 'Me',       href: '/account',      icon: User },
];

type Props = {
  active: BottomTabId;
  orderBadge?: number;
};

export function BottomTabBar({ active, orderBadge = 0 }: Props) {
  return (
    <nav
      className="flex h-14 items-stretch border-t bg-white"
      style={{
        borderColor: 'rgba(44,44,42,0.08)',
        borderTopWidth: '0.5px',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        const showBadge = tab.id === 'orders' && orderBadge > 0;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 transition-opacity active:opacity-60"
          >
            <span className="relative">
              <Icon
                className="h-5 w-5"
                strokeWidth={isActive ? 2.2 : 1.7}
                color={isActive ? '#534AB7' : '#2C2C2A99'}
              />
              {showBadge ? (
                <span
                  className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
                  style={{ backgroundColor: '#D85A30' }}
                >
                  {orderBadge > 9 ? '9+' : orderBadge}
                </span>
              ) : null}
            </span>
            <span
              className="text-[10px] font-medium"
              style={{ color: isActive ? '#534AB7' : '#2C2C2A99' }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
