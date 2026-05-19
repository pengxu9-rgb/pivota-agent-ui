import { Suspense } from "react";
import type { Metadata } from "next";
import { Newsreader, Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "sonner";
import CartDrawer from "@/components/cart/CartDrawer";
import { ThemeProvider } from "@/components/theme-provider";
import AuthInitGate from "@/components/auth/AuthInitGate";
import AuroraEmbedBridge from "@/components/aurora/AuroraEmbedBridge";

// Editorial-redesign font stack. Exposed as CSS variables on <html> so the
// redesigned pages can opt-in via `var(--f-*)` or the `pv-*` utility
// classes without changing the global Tailwind `font-sans` / `font-serif`
// defaults (PDP keeps Cormorant + Inter; checkout flow is frozen).
const editorialSerif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  // `weight: 'variable'` keeps the variable font intact so the `opsz`
  // axis is controllable via `font-variation-settings`. Pinning weights
  // is mutually exclusive with `axes` per next/font.
  weight: "variable",
  axes: ["opsz"],
  variable: "--f-serif",
  display: "swap",
});
const editorialSans = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--f-sans",
  display: "swap",
});
const editorialMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--f-mono",
  display: "swap",
});
// Pivota Sans — custom display face. Compiled from src/pivota-font/glyphs.ts
// via handoff-pivota-sans/otf-build (FontForge pipeline). Exposed as
// `var(--f-pivota)`; v0.1 ships upright Regular + Bold only. No italic
// master yet — `font-style: italic` falls back to upright by design until
// the v0.2 type-designer pass adds bespoke italic shapes.
const pivotaSans = localFont({
  src: [
    { path: "../pivota-font/fonts/PivotaSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../pivota-font/fonts/PivotaSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--f-pivota",
  display: "swap",
});

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${editorialSerif.variable} ${editorialSans.variable} ${editorialMono.variable} ${pivotaSans.variable}`}
    >
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
