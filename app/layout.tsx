import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ツクルンジャー | 建設業向け統合管理",
  description:
    "工事写真管理・電子納品・見積原価管理を一元化する建設業向けプラットフォーム",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#ea580c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Providers>
          <header className="bg-orange-600 text-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-2xl font-bold tracking-tight">
                  ツクルンジャー
                </span>
                <span className="text-xs bg-orange-800 px-2 py-0.5 rounded-full">
                  建設DX
                </span>
              </Link>
              <nav className="flex gap-1">
                <NavLink href="/">ダッシュボード</NavLink>
                <NavLink href="/photos">工事写真</NavLink>
                <NavLink href="/delivery">電子納品</NavLink>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-4 text-center text-sm text-gray-500">
            相模建設ツクルンジャー &copy; {new Date().getFullYear()} 相模建設
          </footer>
        </Providers>
      </body>
    </html>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-sm font-medium hover:bg-orange-700 transition-colors"
    >
      {children}
    </Link>
  );
}
