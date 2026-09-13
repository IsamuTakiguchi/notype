"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DictionaryPanel } from "@/components/DictionaryPanel";
import { HistoryList } from "@/components/HistoryList";
import { MicButton } from "@/components/MicButton";
import { ModeBar } from "@/components/ModeBar";
import { PolishedPane } from "@/components/PolishedPane";
import { TranscriptPane } from "@/components/TranscriptPane";
import { useDictation } from "@/hooks/useDictation";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePolishStream } from "@/hooks/usePolishStream";
import { isMode, isTone, type DictEntry, type HistoryItem, type Settings } from "@/lib/types";

/**
 * 表示名を NoType に変えたあともキーは notype: のまま据え置く。
 * ここを変えると、既に使っている人の個人辞書と履歴が黙って消える。
 * ストレージキーは識別子であって表示名ではない。
 */
const KEYS = {
  settings: "notype:v1:settings",
  dictionary: "notype:v1:dictionary",
  history: "notype:v1:history",
} as const;

const DEFAULT_SETTINGS: Settings = {
  mode: "polish",
  tone: "business",
  inputLang: "ja-JP",
  outputLang: "ja",
};

const MAX_HISTORY = 20;

function parseSettings(raw: unknown): Settings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Partial<Settings>;
  return {
    mode: isMode(value.mode) ? value.mode : DEFAULT_SETTINGS.mode,
    tone: isTone(value.tone) ? value.tone : DEFAULT_SETTINGS.tone,
    inputLang: typeof value.inputLang === "string" ? value.inputLang : DEFAULT_SETTINGS.inputLang,
    outputLang:
      typeof value.outputLang === "string" ? value.outputLang : DEFAULT_SETTINGS.outputLang,
  };
}

function parseDictionary(raw: unknown): DictEntry[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (entry): entry is DictEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as DictEntry).to === "string" &&
      Array.isArray((entry as DictEntry).from),
  );
}

function parseHistory(raw: unknown): HistoryItem[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (item): item is HistoryItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as HistoryItem).id === "string" &&
      typeof (item as HistoryItem).polished === "string",
  );
}

type Panel = "dictionary" | "history" | "help" | null;

export function Workbench() {
  const [raw, setRaw] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [copied, setCopied] = useState(false);
  // スマホ幅では2ペインを並べる余地が無いので1枚ずつ出す。md 以上では両方見せる。
  const [mobilePane, setMobilePane] = useState<"raw" | "polished">("raw");

  const [settings, setSettings] = useLocalStorage(KEYS.settings, DEFAULT_SETTINGS, parseSettings);
  const [dictionary, setDictionary, dictHydrated] = useLocalStorage<DictEntry[]>(
    KEYS.dictionary,
    [],
    parseDictionary,
  );
  const [history, setHistory, historyHydrated] = useLocalStorage<HistoryItem[]>(
    KEYS.history,
    [],
    parseHistory,
  );

  const polish = usePolishStream();

  // 確定したセグメントを書き起こしに積む。フックは確定分を保持しないので、
  // 文字列の所有者はここ1つだけになる。
  const appendSegment = useCallback((segment: string) => {
    setRaw((prev) => (prev ? `${prev.replace(/\s+$/, "")}${needsSpace(prev, segment)}${segment}` : segment));
  }, []);

  const dictation = useDictation({ lang: settings.inputLang, onFinalSegment: appendSegment });

  const listening = dictation.status === "listening" || dictation.status === "starting";
  const holdToTalk = settings.mode === "edit";

  // 「話して編集」の書き換え対象は、いま整形後ペインに出ているテキスト。
  const editTarget = polish.text;
  const canRun =
    Boolean(raw.trim()) &&
    !polish.isStreaming &&
    (settings.mode !== "edit" || Boolean(editTarget.trim()));

  const runPolish = polish.run;

  // run が結果を返すので、履歴への積み上げもここで完結する。
  // コールバック登録とレンダー中の ref 書き込みが要らなくなる。
  const run = useCallback(async () => {
    if (!raw.trim()) return;
    if (settings.mode === "edit" && !editTarget.trim()) return;

    // スマホでは結果ペインがタブの裏に隠れている。押した瞬間に表へ出さないと
    // 「押したのに何も起きない」に見える。
    setMobilePane("polished");

    const { mode, tone, outputLang } = settings;
    const source = raw;
    const result = await runPolish({
      mode,
      tone,
      outputLang,
      transcript: source,
      target: mode === "edit" ? editTarget : undefined,
      dictionary,
    });
    if (!result?.text.trim()) return;

    const item: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      mode,
      tone,
      raw: source,
      polished: result.text,
      engine: result.engine,
    };
    setHistory((prev) => [item, ...prev].slice(0, MAX_HISTORY));
  }, [dictionary, editTarget, raw, runPolish, setHistory, settings]);


  // トーンや翻訳先を変えたら、録り直さずにその場で整形し直す。
  // 「話して編集」は対象が入れ替わってしまうので自動実行の対象から外す。
  const hasResult = Boolean(polish.text);
  const lastAutoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasResult || settings.mode === "edit") return;
    const signature = `${settings.mode}|${settings.tone}|${settings.outputLang}`;
    if (lastAutoRef.current === null) {
      lastAutoRef.current = signature;
      return;
    }
    if (lastAutoRef.current === signature) return;
    lastAutoRef.current = signature;
    void run();
    // run は raw と設定に依存するが、ここで見たいのは「設定が変わったか」だけ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode, settings.tone, settings.outputLang, hasResult]);

  const copy = useCallback(() => {
    if (!polish.text) return;
    void copyToClipboard(polish.text);
    setCopied(true);
  }, [polish.text]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const restore = useCallback((item: HistoryItem) => {
    setRaw(item.raw);
    setPanel(null);
  }, []);

  // ショートカット。素の Space はテキスト入力に食われるので使わない。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        if (polish.isStreaming) polish.abort();
        else if (listening) dictation.stop();
        else setPanel(null);
        return;
      }
      if (!mod) return;

      if (event.shiftKey && event.code === "Space") {
        event.preventDefault();
        dictation.toggle();
      } else if (event.key === "Enter") {
        event.preventDefault();
        void run();
      } else if (event.shiftKey && (event.key === "C" || event.key === "c")) {
        event.preventDefault();
        copy();
      } else if (event.key === "/") {
        event.preventDefault();
        setPanel((prev) => (prev === "help" ? null : "help"));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copy, dictation, listening, polish, run]);

  const modeHint = useMemo(() => {
    if (settings.mode !== "edit") return null;
    if (editTarget.trim()) return null;
    return "「話して編集」は整形後のテキストを書き換えるモードです。まず整形を1回実行してください。";
  }, [editTarget, settings.mode]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-5 sm:px-6 sm:pt-6 lg:px-8">
      <Header />

      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <ModeBar settings={settings} onChange={(next) => setSettings((p) => ({ ...p, ...next }))} />
        <div className="flex items-center gap-2">
          <PanelToggle active={panel === "dictionary"} onClick={() => togglePanel(setPanel, "dictionary")}>
            個人辞書{dictionary.length ? `（${dictionary.length}）` : ""}
          </PanelToggle>
          <PanelToggle active={panel === "history"} onClick={() => togglePanel(setPanel, "history")}>
            履歴{history.length ? `（${history.length}）` : ""}
          </PanelToggle>
          <PanelToggle active={panel === "help"} onClick={() => togglePanel(setPanel, "help")}>
            ショートカット
          </PanelToggle>
        </div>
      </div>

      {panel ? (
        <div className="rounded-xl border border-line bg-panel p-4">
          {panel === "dictionary" ? (
            <DictionaryPanel entries={dictionary} hydrated={dictHydrated} onChange={setDictionary} />
          ) : null}
          {panel === "history" ? (
            <HistoryList
              items={history}
              hydrated={historyHydrated}
              onRestore={restore}
              onClear={() => setHistory([])}
            />
          ) : null}
          {panel === "help" ? <ShortcutHelp /> : null}
        </div>
      ) : null}

      {/*
        スマホでは親指の届く下端に固定する。ページ末尾に置くと、
        書き起こしをスクロールしている最中にマイクが画面外へ消えてしまう。
      */}
      <div className="sticky bottom-0 z-10 -mx-4 order-last flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:order-none sm:mx-0 sm:rounded-xl sm:border sm:pb-3 sm:backdrop-blur-none">
        <MicButton
          status={dictation.status}
          isSupported={dictation.isSupported}
          profile={dictation.profile}
          holdToTalk={holdToTalk}
          onToggle={dictation.toggle}
          onHoldStart={dictation.start}
          onHoldEnd={dictation.stop}
        />
        <div className="flex items-center gap-3">
          {polish.isStreaming ? (
            <button
              type="button"
              onClick={polish.abort}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft transition hover:border-live hover:text-live focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              停止
            </button>
          ) : null}
          <button
            type="button"
            data-testid="polish-button"
            onClick={() => void run()}
            disabled={!canRun}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {polish.isStreaming ? "整形中…" : settings.mode === "translate" ? "翻訳する" : "整形する"}
          </button>
        </div>
      </div>

      {modeHint ? (
        <p className="rounded-lg border border-line bg-accent-soft/60 px-4 py-2.5 text-xs text-ink-soft">
          {modeHint}
        </p>
      ) : null}

      <PaneTabs
        active={mobilePane}
        onChange={setMobilePane}
        rawLength={raw.length}
        polishedLength={polish.text.length}
      />

      <div className="grid min-h-[18rem] flex-1 grid-cols-1 gap-4 sm:min-h-[26rem] md:grid-cols-2">
        <TranscriptPane
          hiddenOnMobile={mobilePane !== "raw"}
          value={raw}
          interim={dictation.interim}
          mode={settings.mode}
          listening={listening}
          error={dictation.error}
          onChange={setRaw}
          onClear={() => setRaw("")}
          onDismissError={dictation.clearError}
        />
        <PolishedPane
          hiddenOnMobile={mobilePane !== "polished"}
          text={polish.text}
          sourceLength={raw.length}
          isStreaming={polish.isStreaming}
          engine={polish.engine}
          fallbackReason={polish.fallbackReason}
          error={polish.error}
          truncated={polish.truncated}
          copied={copied}
          onCopy={copy}
          onRetry={() => void run()}
          canRetry={canRun}
        />
      </div>

      <Footer />
    </div>
  );
}

/** スマホ幅でだけ出るペイン切替。md 以上では両方並ぶので不要。 */
function PaneTabs({
  active,
  onChange,
  rawLength,
  polishedLength,
}: {
  active: "raw" | "polished";
  onChange: (pane: "raw" | "polished") => void;
  rawLength: number;
  polishedLength: number;
}) {
  const tabs = [
    { id: "raw" as const, label: "生の書き起こし", count: rawLength },
    { id: "polished" as const, label: "整形後", count: polishedLength },
  ];
  return (
    <div
      role="tablist"
      aria-label="表示するペイン"
      data-testid="pane-tabs"
      className="flex rounded-lg border border-line bg-panel p-0.5 md:hidden"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          data-testid={`pane-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={[
            "flex-1 rounded-md px-3 py-2 text-sm transition",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            active === tab.id ? "bg-accent-soft font-medium text-accent" : "text-ink-soft",
          ].join(" ")}
        >
          {tab.label}
          {tab.count ? (
            <span className="ml-1.5 text-xs tabular-nums opacity-70">{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function togglePanel(set: (fn: (prev: Panel) => Panel) => void, value: Exclude<Panel, null>) {
  set((prev) => (prev === value ? null : value));
}

/** 直前が日本語で終わっているなら区切りを足さない。英語なら空白を入れる。 */
function needsSpace(prev: string, next: string): string {
  const last = prev.trimEnd().slice(-1);
  const first = next.slice(0, 1);
  const jp = /[　-ヿ㐀-䶿一-鿿＀-￯]/;
  if (!last || !first) return "";
  return jp.test(last) || jp.test(first) ? "" : " ";
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // クリップボード API はセキュアコンテキストでしか使えない。
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {
    // ここまで失敗したら諦める。テキストは画面上で選択できる。
  }
  document.body.removeChild(textarea);
}

function Header() {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">NoType</h1>
        <p className="text-sm text-ink-soft">話すだけで、整った文章に。</p>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-faint">
        <span className="hidden sm:inline">
          音声入力は Chrome / Edge のみ。音声は認識のため Google の音声サービスに送信されます。
        </span>
        <span className="sm:hidden">音声は Google の音声サービスに送信されます。</span>
        <Link
          href="/shortcut"
          data-testid="shortcut-link"
          className="underline underline-offset-2 transition hover:text-ink"
        >
          iPhone から使う
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  return (
    // スマホでは下部固定バーに隠れるうえ、本文までの距離を伸ばすだけなので出さない。
    <footer className="hidden text-xs leading-relaxed text-ink-faint sm:block">
      フィラー・言い直し・繰り返しを取り除き、指定したトーンに整えます。
      内容の要約や創作はしません（議事録トーンを除く）。
    </footer>
  );
}

function PanelToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={[
        "rounded-lg border px-3 py-2 text-sm transition",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-line bg-panel text-ink-soft hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ShortcutHelp() {
  const rows: Array<[string, string]> = [
    ["Ctrl / Cmd + Shift + Space", "マイクの開始・停止"],
    ["Ctrl / Cmd + Enter", "整形を実行"],
    ["Ctrl / Cmd + Shift + C", "整形結果をコピー"],
    ["Esc", "生成を中断 → マイクを停止 → パネルを閉じる"],
    ["Ctrl / Cmd + /", "このヘルプの表示・非表示"],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      {rows.map(([key, description]) => (
        <div key={key} className="contents">
          <dt className="font-mono text-xs text-ink-soft">{key}</dt>
          <dd className="text-ink-soft">{description}</dd>
        </div>
      ))}
    </dl>
  );
}
