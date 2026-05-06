'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Package,
  ShoppingCart,
  History,
  Sparkles,
  X,
  Sun,
  Moon,
  User,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useCartStore } from '@/store/cartStore';
import { useChatStore } from '@/store/chatStore';
import { useTheme } from '@/components/theme-provider';

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

type MenuItem = {
  icon: LucideIcon;
  label: string;
  link?: string;
  count?: number;
  onClick?: () => void;
};

export default function ChatSidebar({ isOpen, onClose }: ChatSidebarProps) {
  const { items, open: openCart } = useCartStore();
  const { conversations, switchConversation, clearMessages } = useChatStore();
  const { theme, setTheme } = useTheme();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const sortedConversations = [...conversations].sort(
    (a, b) =>
      new Date(b.timestamp as any).getTime() -
      new Date(a.timestamp as any).getTime(),
  );

  const menuItems: MenuItem[] = [
    { icon: Package,      label: 'My Orders',       link: '/orders' },
    { icon: User,         label: 'Account',         link: '/account' },
    { icon: ShoppingCart, label: 'Shopping Cart',   count: itemCount, onClick: openCart },
    { icon: History,      label: 'Browse History',  link: '/browse-history' },
  ];

  const formatTime = (date: Date | string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${Math.max(0, minutes)}m`;
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-white z-50 transition-transform duration-300 lg:relative lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ borderRightWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
      >
        {/* Header — matches TopBar */}
        <div
          className="flex items-center justify-between px-3 bg-white"
          style={{
            height: '54px',
            borderBottomWidth: '0.5px',
            borderColor: 'rgba(44,44,42,0.08)',
          }}
        >
          <Link href="/" onClick={onClose} className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: '#534AB7' }}
            >
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.2} />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold" style={{ color: '#2C2C2A' }}>Pivota</span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: '#1D9E75' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#1D9E75' }} />
                AI online
              </span>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden h-9 w-9 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" style={{ color: '#2C2C2A' }} />
          </button>
        </div>

        {/* Body — single scroll container, no nested ScrollArea (lucide ScrollArea added padding mismatch) */}
        <div className="overflow-y-auto" style={{ height: 'calc(100% - 54px)' }}>
          {/* Primary actions */}
          <div className="p-3">
            <button
              type="button"
              onClick={() => { clearMessages(); onClose(); }}
              className="w-full flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium text-white transition-opacity active:opacity-85"
              style={{ backgroundColor: '#534AB7' }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              New Chat
            </button>
          </div>

          {/* Menu Items */}
          <nav className="px-2 pb-2 space-y-0.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const inner = (
                <>
                  <Icon className="h-4 w-4" strokeWidth={1.8} style={{ color: '#2C2C2A' }} />
                  <span className="flex-1 text-[13px]" style={{ color: '#2C2C2A' }}>
                    {item.label}
                  </span>
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className="rounded-full px-1.5 text-[10px] font-semibold text-white min-w-4 h-4 flex items-center justify-center"
                      style={{ backgroundColor: '#D85A30' }}
                    >
                      {item.count > 9 ? '9+' : item.count}
                    </span>
                  )}
                </>
              );

              if (item.onClick) {
                return (
                  <button
                    key={item.label}
                    onClick={() => { item.onClick?.(); onClose(); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors active:bg-[#EEEDFE] text-left"
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.link || '#'}
                  onClick={onClose}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors active:bg-[#EEEDFE]"
                >
                  {inner}
                </Link>
              );
            })}

            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors active:bg-[#EEEDFE] text-left"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" strokeWidth={1.8} style={{ color: '#2C2C2A' }} />
              ) : (
                <Sun className="h-4 w-4" strokeWidth={1.8} style={{ color: '#2C2C2A' }} />
              )}
              <span className="flex-1 text-[13px]" style={{ color: '#2C2C2A' }}>
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </span>
            </button>
          </nav>

          {/* Recent Chats */}
          <div
            className="px-3 pt-3 pb-2"
            style={{ borderTopWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
          >
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <MessageSquare className="h-3.5 w-3.5" style={{ color: '#2C2C2A99' }} strokeWidth={1.8} />
              <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#2C2C2A99' }}>
                Recent Chats
              </h3>
            </div>
            <div className="space-y-0.5">
              {sortedConversations.length > 0 ? (
                sortedConversations.slice(0, 6).map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => { switchConversation(conv.id); onClose(); }}
                    className="w-full block px-2 py-1.5 rounded-lg transition-colors active:bg-[#EEEDFE] text-left"
                  >
                    <p
                      className="text-[12px] font-medium line-clamp-1 mb-0.5"
                      style={{ color: '#2C2C2A' }}
                    >
                      {conv.title}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className="text-[10px] line-clamp-1 flex-1"
                        style={{ color: '#2C2C2A66' }}
                      >
                        {conv.lastMessage}
                      </p>
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#2C2C2A66' }}>
                        {formatTime(conv.timestamp)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-[11px] text-center py-2" style={{ color: '#2C2C2A66' }}>
                  No chat history yet
                </p>
              )}
            </div>
          </div>

          {/* Footer link */}
          <div
            className="p-3"
            style={{ borderTopWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
          >
            <Link
              href="/products"
              onClick={onClose}
              className="block w-full text-center rounded-full bg-[#F4F4F2] px-3 py-2 text-[12px] font-medium transition-colors active:bg-[#EEEDFE]"
              style={{ color: '#2C2C2A' }}
            >
              Browse all products
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
