import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "道路防災カルテ Web GIS (MVP)",
  description: "道路防災カルテ点検業務支援システム MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <header className="flex items-center justify-between border-b border-gray-300 bg-white px-6 py-3">
          <a href="/karte" className="text-lg font-bold text-gray-800">
            道路防災カルテ Web GIS <span className="text-sm font-normal text-gray-500">MVP</span>
          </a>
          <nav className="flex gap-4 text-sm text-gray-600">
            <a href="/karte" className="hover:text-gray-900 hover:underline">
              検索・一覧
            </a>
            <a href="/karte/map" className="hover:text-gray-900 hover:underline">
              地図
            </a>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl p-6">{children}</main>
      </body>
    </html>
  );
}
