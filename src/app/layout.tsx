import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ToastContainer from "@/components/ui/ToastContainer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pivota Shopping AI - Your Personal Shopping Assistant",
  description: "AI-powered shopping made simple. Find products, compare prices, and shop smarter with Pivota's intelligent assistant.",
  keywords: ["shopping", "AI", "assistant", "ecommerce", "Pivota"],
  authors: [{ name: "Pivota Team" }],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#3b82f6" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
