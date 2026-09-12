"use client";

import { useEffect, useRef } from "react";

import type { DictationError } from "@/hooks/useDictation";
import type { Mode } from "@/lib/types";

type Props = {
  value: string;
  interim: string;
  mode: Mode;
  listening: boolean;
  error: DictationError | null;
  onChange: (value: string) => void;
  onClear: () => void;
  onDismissError: () => void;
};

const PLACEHOLDER: Record<Mode, string> = {
  polish: "マイクを押して話すか、粗い書き起こしをここに貼り付けてください。",
  edit: "「もっと短く」「敬語にして」など、書き換えの指示を話すか入力してください。",
  translate: "翻訳したい内容を話すか、ここに貼り付けてください。",
};

export function TranscriptPane({
  value,
  interim,
  mode,
  listening,
  error,
  onChange,
  onClear,
  onDismissError,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 発話が確定するたびに末尾へスクロールする。ただし手で編集中は邪魔をしない。
  useEffect(() => {
    if (!listening) return;
    const el = textareaRef.current;
    if (el && document.activeElement !== el) el.scrollTop = el.scrollHeight;
  }, [value, listening]);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-panel">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-medium text-ink">
          {mode === "edit" ? "音声の指示" : "生の書き起こし"}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-ink-faint" data-testid="transcript-count">
            {value.length} 文字
          </span>
          <button
            type="button"
            onClick={onClear}
            disabled={!value}
            className="rounded px-1.5 py-0.5 text-xs text-ink-faint transition hover:text-ink disabled:opacity-40 disabled:hover:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            クリア
          </button>
        </div>
      </header>

      {error ? (
        <div
          role="status"
          data-testid="mic-error"
          className="flex items-start gap-2 border-b border-line bg-live-soft px-4 py-2.5 text-xs leading-relaxed text-ink"
        >
          <span className="flex-1">{error.message}</span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="このメッセージを閉じる"
            className="shrink-0 rounded px-1 text-ink-faint transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <textarea
          ref={textareaRef}
          data-testid="transcript-input"
          aria-label={mode === "edit" ? "音声の指示" : "生の書き起こし"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={PLACEHOLDER[mode]}
          spellCheck={false}
          className="size-full resize-none bg-transparent px-4 py-3 text-[15px] leading-[1.9] text-ink placeholder:text-ink-faint/70 focus:outline-none"
        />
        {interim ? (
          // 未確定の認識結果。これが出ていることが「聞こえている」という一番強い合図になる。
          <p
            data-testid="interim"
            aria-live="polite"
            className="pointer-events-none absolute inset-x-4 bottom-3 rounded-md bg-panel/90 px-2 py-1 text-[15px] italic leading-[1.9] text-ink-faint"
          >
            {interim}
          </p>
        ) : null}
      </div>
    </section>
  );
}
