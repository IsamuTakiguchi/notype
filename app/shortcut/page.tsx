import type { Metadata } from "next";

import { ShortcutGuide } from "@/components/ShortcutGuide";

export const metadata: Metadata = {
  title: "iPhone から使う — notype",
  description:
    "iOS のショートカットから notype の整形を呼ぶ手順。キーボード拡張はマイクを使えないため、ショートカットが Mac も Apple Developer 登録も不要な唯一の経路になります。",
};

export default function ShortcutPage() {
  return (
    <main>
      <ShortcutGuide />
    </main>
  );
}
