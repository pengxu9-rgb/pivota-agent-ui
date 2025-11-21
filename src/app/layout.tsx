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
    <html lang="en">
      <body className={inter.className}>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
