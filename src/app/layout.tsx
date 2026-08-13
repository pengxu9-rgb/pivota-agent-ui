import { Suspense } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "../../public/pivota-brand/pivota-brand.css";
import { Toaster } from "sonner";
import CartDrawer from "@/components/cart/CartDrawer";
import { ThemeProvider } from "@/components/theme-provider";
import AuthInitGate from "@/components/auth/AuthInitGate";
import AuroraEmbedBridge from "@/components/aurora/AuroraEmbedBridge";

// Editorial-redesign font stack. Exposed as CSS variables on <html> so the
// redesigned pages can opt-in via `var(--f-*)` or the `pv-*` utility
// classes without changing the global Tailwind `font-sans` / `font-serif`
// defaults (PDP keeps Cormorant + Inter; checkout flow is frozen).
//
// SELF-HOSTED (was next/font/google): `next/font/google` downloads font files
// from fonts.gstatic.com AT BUILD TIME, so a transient network failure in the
// build container fails the entire build — which is exactly what took down the
// deploy of #301, in a file that PR never touched. These are the same Google
// `latin`-subset variable files, vendored under ./fonts, so the build no longer
// reaches the network. See ./fonts/README.md for provenance and refresh steps.
const editorialSerif = localFont({
  // Variable file keeps the `opsz` axis (6..72) intact, so it stays
  // controllable via `font-variation-settings` exactly as before.
  src: [
    {
      path: "./fonts/Newsreader-latin-variable.woff2",
      style: "normal",
      weight: "200 800",
    },
    {
      path: "./fonts/Newsreader-latin-variable-italic.woff2",
      style: "italic",
      weight: "200 800",
    },
  ],
  variable: "--f-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
const editorialSans = localFont({
  src: "./fonts/Geist-latin-variable.woff2",
  style: "normal",
  // File carries wght 100..900; the design uses 300-700 within that range.
  weight: "100 900",
  variable: "--f-sans",
  display: "swap",
  adjustFontFallback: "Arial",
});
const editorialMono = localFont({
  src: "./fonts/GeistMono-latin-variable.woff2",
  style: "normal",
  // File carries wght 100..900; the design uses 400-600 within that range.
  weight: "100 900",
  variable: "--f-mono",
  display: "swap",
  adjustFontFallback: "Arial",
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
      className={`${editorialSerif.variable} ${editorialSans.variable} ${editorialMono.variable}`}
    >
      <head>
        <link rel="icon" type="image/svg+xml" href="/pivota-brand/svg/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/pivota-brand/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/pivota-brand/icons/favicon-16.png" />
        <link rel="apple-touch-icon" href="/pivota-brand/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="dns-prefetch" href="https://js.stripe.com" />
        <link rel="preconnect" href="https://js.stripe.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://m.stripe.network" />
        <link rel="preconnect" href="https://m.stripe.network" crossOrigin="" />
        <link rel="dns-prefetch" href="https://r.stripe.com" />
        <link rel="preconnect" href="https://r.stripe.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://api.stripe.com" />
        <link rel="preconnect" href="https://api.stripe.com" crossOrigin="" />
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
