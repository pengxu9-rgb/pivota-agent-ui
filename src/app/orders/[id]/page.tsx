'use client';

import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  params: { id: string };
}

export default function OrderConfirmationPage({ params }: Props) {
  const { id } = params;

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-white/80 backdrop-blur-md rounded-3xl shadow-lg p-8 space-y-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Order Confirmed</h1>
            <p className="text-sm text-muted-foreground">Thank you! Your order has been placed.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground">Order ID</p>
          <p className="text-lg font-semibold break-all">{id}</p>
        </div>

        <p className="text-sm text-muted-foreground">
          We&apos;re processing your order and will notify you when it ships. You can keep this page for
          your records or return to continue shopping.
        </p>

        <div className="flex gap-3">
          <Link href="/">
            <Button variant="gradient">Continue Shopping</Button>
          </Link>
          <Link href="/orders">
            <Button variant="outline">View Orders</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
