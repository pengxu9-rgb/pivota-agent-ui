import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import CartDrawer from "@/components/cart/CartDrawer";
import { ThemeProvider } from "@/components/theme-provider";
import AuthInitGate from "@/components/auth/AuthInitGate";
import AuroraEmbedBridge from "@/components/aurora/AuroraEmbedBridge";

export const metadata: Metadata = {
  title: "Pivota Shopping AI",
  description: "Shop smarter through conversation",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="dns-prefetch" href="https://js.stripe.com" />
        <link rel="preconnect" href="https://js.stripe.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://m.stripe.network" />
        <link rel="preconnect" href="https://m.stripe.network" crossOrigin="" />
        <link rel="dns-prefetch" href="https://r.stripe.com" />
        <link rel="preconnect" href="https://r.stripe.com" crossOrigin="" />
      </head>
      <body className="antialiased font-sans">
        <ThemeProvider defaultTheme="light" storageKey="pivota-ui-theme">
          <AuthInitGate />
          <Suspense fallback={null}>
            <AuroraEmbedBridge />
          </Suspense>
          {children}
          <CartDrawer />
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
