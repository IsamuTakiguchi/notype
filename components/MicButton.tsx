"use client";

import type { DictationStatus } from "@/hooks/useDictation";

type Props = {
  status: DictationStatus;
  isSupported: boolean | null;
  /** true のとき押している間だけ録音する（「話して編集」で一言指示を出す用）。 */
  holdToTalk: boolean;
  onToggle: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
};

export function MicButton({ status, isSupported, holdToTalk, onToggle, onHoldStart, onHoldEnd }: Props) {
  const listening = status === "listening" || status === "starting";
  // isSupported が null の間（判定前）は中立の見た目にする。
  // ここで「非対応」を描くと SSR 出力と食い違って hydration mismatch になる。
  const pending = isSupported === null;

  const label = pending
    ? "マイクを準備中"
    : listening
      ? "録音を停止"
      : holdToTalk
        ? "押している間だけ話す"
        : "録音を開始";

  const holdProps = holdToTalk
    ? {
        onPointerDown: onHoldStart,
        onPointerUp: onHoldEnd,
        onPointerLeave: onHoldEnd,
        onPointerCancel: onHoldEnd,
      }
    : {};

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        data-testid="mic-button"
        aria-label={label}
        aria-pressed={listening}
        title={label}
        onClick={holdToTalk ? undefined : onToggle}
        {...holdProps}
        className={[
          "grid size-14 shrink-0 place-items-center rounded-full border transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          listening
            ? "notype-pulse border-live bg-live-soft text-live"
            : "border-line bg-panel text-ink-soft hover:border-accent hover:text-accent",
        ].join(" ")}
      >
        <MicIcon active={listening} />
      </button>

      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {pending ? "　" : listening ? "聞いています…" : holdToTalk ? "押しながら話す" : "話す"}
        </p>
        <p className="truncate text-xs text-ink-faint">
          {holdToTalk ? "ボタンを押している間だけ録音します" : "もう一度押すと停止します"}
        </p>
      </div>
    </div>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" fill={active ? "currentColor" : "none"} />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}
