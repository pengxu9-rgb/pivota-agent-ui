'use client';

import { motion } from 'framer-motion';
import { History, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { useCartStore } from '@/store/cartStore';
import { useChatStore } from '@/store/chatStore';

export default function BrowseHistoryPage() {
  const { items, open } = useCartStore();
  const { conversations, switchConversation } = useChatStore();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  const formatTime = (date: Date) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} days ago`;
    if (hours > 0) return `${hours} hours ago`;
    if (minutes > 0) return `${minutes} minutes ago`;
    return 'Just now';
  };

  return (
    <div className="min-h-screen bg-gradient-mesh">
      {/* Animated background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-400/10 blur-3xl -z-10 animate-pulse" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/70 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Sparkles className="h-6 w-6 text-cyan-400 group-hover:rotate-12 transition-transform" />
            <span className="text-xl font-semibold gradient-text">Pivota</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={open}
              className="relative h-10 w-10 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/80 transition-colors"
            >
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-semibold text-white">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-semibold mb-2">Browse History</h1>
          <p className="text-muted-foreground mb-8">
            Your recent shopping conversations
          </p>

          {/* History List */}
          {conversations.length > 0 ? (
            <div className="space-y-3">
              {conversations.map((conv) => (
                <GlassCard key={conv.id} className="p-4 hover:shadow-glass-hover transition-all">
                  <div className="flex items-start justify-between">
                    <Link 
                      href="/"
                      onClick={() => switchConversation(conv.id)}
                      className="flex-1"
                    >
                      <h3 className="font-semibold text-lg mb-1 hover:text-primary transition-colors">
                        {conv.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {conv.lastMessage}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <History className="h-3 w-3" />
                          {formatTime(conv.timestamp)}
                        </span>
                        <span>
                          {conv.messages.length} messages
                        </span>
                      </div>
                    </Link>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <GlassCard className="p-8 text-center">
              <History className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Browse History</h2>
              <p className="text-muted-foreground mb-6">
                Start a conversation to see your history here
              </p>
              <Link href="/">
                <Button variant="gradient">
                  Start Shopping
                </Button>
              </Link>
            </GlassCard>
          )}
        </motion.div>
      </main>
    </div>
  );
}

