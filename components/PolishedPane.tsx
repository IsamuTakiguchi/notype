"use client";

import { useEffect, useRef } from "react";

import type { Engine, FallbackReason } from "@/lib/types";

type Props = {
  text: string;
  sourceLength: number;
  isStreaming: boolean;
  engine: Engine | null;
  fallbackReason: FallbackReason | null;
  error: string | null;
  truncated: boolean;
  /** コピー完了の表示。キーボードショートカットからも押せるので Workbench が持つ。 */
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
  canRetry: boolean;
};

const FALLBACK_NOTE: Record<FallbackReason, string> = {
  "no-api-key":
    "ANTHROPIC_API_KEY が設定されていないため、ルールベースで処理しました。箇条書き化・段落化・トーン適応・翻訳はモデルが必要です。",
  auth: "APIキーが拒否されたため、ルールベースで処理しました。サーバーの設定を確認してください。",
  connection: "モデルに接続できなかったため、ルールベースで処理しました。",
  refusal: "モデルが応答しなかったため、ルールベースで処理しました。",
};

export function PolishedPane({
  text,
  sourceLength,
  isStreaming,
  engine,
  fallbackReason,
  error,
  truncated,
  copied,
  onCopy,
  onRetry,
  canRetry,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 既に最下部を見ているときだけ追従する。読んでいる最中にスクロールを奪わない。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isStreaming) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [text, isStreaming]);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-ink">整形後</h2>
          {engine ? <EngineBadge engine={engine} /> : null}
        </div>
        <div className="flex items-center gap-3">
          {text ? (
            <span className="text-xs tabular-nums text-ink-faint" data-testid="diff-count">
              {sourceLength} → {text.length} 文字
            </span>
          ) : null}
          <button
            type="button"
            data-testid="retry-button"
            onClick={onRetry}
            disabled={!canRetry}
            className="rounded px-1.5 py-0.5 text-xs text-ink-faint transition hover:text-ink disabled:opacity-40 disabled:hover:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            やり直す
          </button>
          <button
            type="button"
            data-testid="copy-button"
            onClick={onCopy}
            disabled={!text}
            className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
      </header>

      {fallbackReason ? (
        <p
          data-testid="fallback-note"
          className="border-b border-line bg-accent-soft/60 px-4 py-2.5 text-xs leading-relaxed text-ink-soft"
        >
          {FALLBACK_NOTE[fallbackReason]}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="polish-error"
          className="border-b border-line bg-live-soft px-4 py-2.5 text-xs leading-relaxed text-ink"
        >
          {error}
          {truncated ? "（受け取った分までを表示しています）" : ""}
        </p>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {text ? (
          <p
            data-testid="polished-output"
            className={[
              "whitespace-pre-wrap text-[15px] leading-[1.9] text-ink",
              isStreaming ? "notype-caret" : "",
            ].join(" ")}
          >
            {text}
          </p>
        ) : isStreaming ? (
          <Shimmer />
        ) : (
          <p data-testid="polished-placeholder" className="text-[15px] leading-[1.9] text-ink-faint/70">
            ここに整形結果が表示されます。
          </p>
        )}
      </div>
    </section>
  );
}

function EngineBadge({ engine }: { engine: Engine }) {
  const isClaude = engine === "claude";
  return (
    <span
      data-testid="engine-badge"
      className={[
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        isClaude ? "bg-accent-soft text-accent" : "bg-line/60 text-ink-soft",
      ].join(" ")}
    >
      {isClaude ? "Claude Opus 5" : "ルールベース"}
    </span>
  );
}

/** 最初のトークンが来るまでの間。thinking が入るぶん、無反応に見える時間が生じる。 */
function Shimmer() {
  return (
    <div aria-hidden="true" className="space-y-2.5">
      {[100, 92, 68].map((width) => (
        <div
          key={width}
          className="h-3.5 animate-pulse rounded bg-line"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}
