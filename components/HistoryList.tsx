"use client";

import { MODES, TONES, type HistoryItem } from "@/lib/types";

type Props = {
  items: HistoryItem[];
  hydrated: boolean;
  onRestore: (item: HistoryItem) => void;
  onClear: () => void;
};

export function HistoryList({ items, hydrated, onRestore, onClear }: Props) {
  if (!hydrated) {
    return <div aria-hidden="true" className="h-8 animate-pulse rounded bg-line" />;
  }

  if (items.length === 0) {
    return <p className="text-xs text-ink-faint">まだ履歴がありません。</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-faint">クリックすると両方のペインに復元します。</p>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-1.5 py-0.5 text-xs text-ink-faint transition hover:text-live focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          すべて削除
        </button>
      </div>

      <ul data-testid="history-list" className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-testid="history-item"
              onClick={() => onRestore(item)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                <time dateTime={new Date(item.at).toISOString()}>{formatTime(item.at)}</time>
                <span>·</span>
                <span>{MODES.find((m) => m.value === item.mode)?.label ?? item.mode}</span>
                <span>·</span>
                <span>{TONES.find((t) => t.value === item.tone)?.label ?? item.tone}</span>
                {item.engine === "rules" ? (
                  <>
                    <span>·</span>
                    <span>ルールベース</span>
                  </>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink">{item.polished}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatTime(at: number): string {
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`;
}
