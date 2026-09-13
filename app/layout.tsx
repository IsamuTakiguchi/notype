import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "NoType — 話すだけで、整った文章に",
  description:
    "音声入力の書き起こしから、フィラーや言い直しを取り除いて、そのまま送信できる文章に整えるAI音声入力ツール。",
  applicationName: "NoType",
  // capable: false は意図的。true にすると iOS でホーム画面から
  // スタンドアロン起動になり、その状態では webkitSpeechRecognition が動かない。
  // つまりアプリらしい見た目と引き換えにマイクが死ぬ。Safari で開かせる。
  appleWebApp: { capable: false, title: "NoType" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ノッチとホームインジケータの下まで背景を敷き、余白は safe-area で確保する。
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#131316" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
