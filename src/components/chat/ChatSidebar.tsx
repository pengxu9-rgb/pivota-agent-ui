'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Package, ShoppingCart, History, Sparkles, X, Sun, Moon, User } from 'lucide-react';
import Link from 'next/link';
import { useCartStore } from '@/store/cartStore';
import { useChatStore } from '@/store/chatStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTheme } from '@/components/theme-provider';

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

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

  const menuItems = [
    { icon: Package, label: 'My Orders', link: '/orders' },
    { icon: User, label: 'Account', link: '/account' },
    { icon: ShoppingCart, label: 'Shopping Cart', count: itemCount, onClick: openCart },
    { icon: History, label: 'Browse History', link: '/browse-history' },
  ];

  const formatTime = (date: Date) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-card/70 backdrop-blur-xl border-r border-border z-50 transition-transform duration-300 lg:relative lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header with logo */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border">
          <Link href="/" className="flex items-center gap-2 group">
            <Sparkles className="h-6 w-6 text-cyan-400 group-hover:rotate-12 transition-transform" />
            <span className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">
              Pivota
            </span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Menu Items */}
        <ScrollArea className="h-[calc(100%-4rem)]">
          <nav className="p-4 space-y-2">
            {menuItems.map((item) => {
              const content = (
                <>
                  <item.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="flex-1 text-sm text-foreground group-hover:text-primary transition-colors">
                    {item.label}
                  </span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-xs font-semibold text-white">
                      {item.count}
                    </span>
                  )}
                </>
              );

              if (item.onClick) {
                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      item.onClick();
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary transition-colors text-left group"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.link || '#'}
                  onClick={onClose}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary transition-colors text-left group"
                >
                  {content}
                </Link>
              );
            })}

            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-secondary transition-colors text-left group"
            >
              {theme === 'light' ? (
                <Moon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              )}
              <span className="flex-1 text-sm text-foreground group-hover:text-primary transition-colors">
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </span>
            </button>
          </nav>

          {/* Chat History Section */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Recent Chats</h3>
            </div>
            <div className="space-y-2">
              {sortedConversations.length > 0 ? (
                sortedConversations.slice(0, 5).map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      switchConversation(conv.id);
                      onClose();
                    }}
                    className="w-full block p-2 rounded-lg hover:bg-secondary transition-colors group text-left"
                  >
                    <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1 mb-1">
                      {conv.title}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground line-clamp-1 flex-1">
                        {conv.lastMessage}
                      </p>
                      <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                        {formatTime(conv.timestamp)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No chat history yet
                </p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-4 border-t border-border space-y-2">
            <Link href="/products" onClick={onClose}>
              <Button variant="secondary" className="w-full" size="sm">
                Browse Products
              </Button>
            </Link>
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={() => {
                clearMessages();
                onClose();
              }}
            >
              New Chat
            </Button>
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
