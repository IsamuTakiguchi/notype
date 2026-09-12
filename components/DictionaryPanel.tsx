"use client";

import { useState } from "react";

import { MAX_DICT_ENTRIES } from "@/lib/dictionary";
import type { DictEntry } from "@/lib/types";

type Props = {
  entries: DictEntry[];
  hydrated: boolean;
  onChange: (entries: DictEntry[]) => void;
};

export function DictionaryPanel({ entries, hydrated, onChange }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const add = () => {
    const froms = from
      .split(/[,、\/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const target = to.trim();
    if (!froms.length || !target) return;
    onChange([...entries, { from: froms, to: target }]);
    setFrom("");
    setTo("");
  };

  const remove = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-soft">
        音声認識が間違えやすい固有名詞や専門用語を登録します。読みが一致する場合だけ、
        正しい表記に置き換えます。
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label className="flex min-w-40 flex-1 flex-col gap-1">
          <span className="text-xs text-ink-faint">認識されがちな表記（カンマ区切り）</span>
          <input
            data-testid="dict-from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder="のたいぷ, ノータイプ"
            className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </label>
        <label className="flex min-w-32 flex-1 flex-col gap-1">
          <span className="text-xs text-ink-faint">正しい表記</span>
          <input
            data-testid="dict-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="notype"
            className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </label>
        <button
          type="submit"
          data-testid="dict-add"
          disabled={!from.trim() || !to.trim() || entries.length >= MAX_DICT_ENTRIES}
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          追加
        </button>
      </form>

      {!hydrated ? (
        <div aria-hidden="true" className="h-8 animate-pulse rounded bg-line" />
      ) : entries.length === 0 ? (
        <p className="text-xs text-ink-faint">まだ登録がありません。</p>
      ) : (
        <ul data-testid="dict-list" className="flex flex-wrap gap-2">
          {entries.map((entry, index) => (
            <li
              key={`${entry.to}-${index}`}
              className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink"
            >
              <span className="text-ink-faint">{entry.from.join(" / ")}</span>
              <span aria-hidden="true" className="text-ink-faint">
                →
              </span>
              <span className="font-medium">{entry.to}</span>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`${entry.to} の登録を削除`}
                className="rounded text-ink-faint transition hover:text-live focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {entries.length >= MAX_DICT_ENTRIES ? (
        <p className="text-xs text-ink-faint">
          登録は {MAX_DICT_ENTRIES} 件までです。使わない語を削除してください。
        </p>
      ) : null}
    </div>
  );
}
