"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { curlExample, polishEndpoint, requestBodyFields, TRANSCRIPT_PLACEHOLDER } from "@/lib/shortcut";
import { MODES, TONES, OUTPUT_LANGS, type Mode, type Tone } from "@/lib/types";

/**
 * location はサーバでは決まらない値なので、effect で setState して差し替えるのではなく
 * useSyncExternalStore で扱う。初回描画のちらつきと hydration mismatch を構造的に避ける。
 */
const subscribeToNothing = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getServerOriginSnapshot = () => "";

/**
 * iPhone から使うための案内。
 *
 * iOS のキーボード拡張はマイクを使えず、共有シート拡張もネイティブアプリが要る。
 * Mac も Apple Developer 登録も無しで済む経路はショートカットだけなので、
 * その組み立て方をアプリ内で示す。URL は実際のデプロイ先から埋める。
 */
export function ShortcutGuide() {
  const origin = useSyncExternalStore(subscribeToNothing, getOriginSnapshot, getServerOriginSnapshot);
  const [mode, setMode] = useState<Mode>("polish");
  const [tone, setTone] = useState<Tone>("business");
  const [outputLang, setOutputLang] = useState("ja");
  const [copied, setCopied] = useState<string | null>(null);

  const endpoint = useMemo(() => (origin ? polishEndpoint(origin) : ""), [origin]);
  const fields = useMemo(() => requestBodyFields({ mode, tone, outputLang }), [mode, tone, outputLang]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (label: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(label);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-ink">iPhone から使う</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          話して、整形結果をクリップボードに入れるところまでを iOS
          のショートカットで組みます。アクションボタン・背面タップ・共有シート・ホーム画面のどこからでも起動できます。
        </p>
      </header>

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-sm font-medium text-ink">なぜキーボードではないのか</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          iOS のキーボード拡張は、サンドボックスの制約でマイクを使えません。回避するにはネイティブアプリ
          （Xcode と Apple Developer Program、年 $99）が必要で、それでも Apple
          が保証した経路ではありません。ショートカットなら、その全部が要りません。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          音声認識は Apple 自身のものを使います。このサーバがやるのは整形だけです。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink">1. 設定を選ぶ</h2>
        <div className="flex flex-wrap gap-3">
          <Field label="モード">
            <Select value={mode} onChange={(v) => setMode(v as Mode)} options={MODES} />
          </Field>
          <Field label="トーン">
            <Select value={tone} onChange={(v) => setTone(v as Tone)} options={TONES} />
          </Field>
          <Field label="出力言語">
            <Select
              value={outputLang}
              onChange={setOutputLang}
              options={OUTPUT_LANGS.map((l) => ({ value: l.value, label: l.label }))}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink">2. ショートカットを組む</h2>
        <ol className="space-y-3 text-sm leading-relaxed text-ink-soft">
          <li>
            <Step n={1} />
            ショートカット App で新規ショートカットを作る
          </li>
          <li>
            <Step n={2} />
            <b className="text-ink">テキストを音声入力</b> を追加する（「音声」で検索）。言語は話す言語に合わせる
          </li>
          <li>
            <Step n={3} />
            <b className="text-ink">URLの内容を取得</b> を追加し、URL に次を入れる
            <CopyBox
              label="url"
              value={endpoint}
              copied={copied === "url"}
              onCopy={() => copy("url", endpoint)}
            />
          </li>
          <li>
            <Step n={4} />
            同じアクションを開き、<b className="text-ink">方法</b> を <code className="rounded bg-surface px-1">POST</code>、
            <b className="text-ink">要求のボディ</b> を <code className="rounded bg-surface px-1">JSON</code> にして、次の4つのフィールドを足す
            <div className="mt-2 overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="bg-surface text-ink-faint">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">キー</th>
                    <th className="px-3 py-1.5 text-left font-medium">値</th>
                  </tr>
                </thead>
                <tbody data-testid="shortcut-fields">
                  {fields.map((f) => (
                    <tr key={f.key} className="border-t border-line">
                      <td className="px-3 py-1.5 font-mono text-ink">{f.key}</td>
                      <td className="px-3 py-1.5 text-ink-soft">
                        {f.value === TRANSCRIPT_PLACEHOLDER ? (
                          <span className="text-accent">{f.value}</span>
                        ) : (
                          <span className="font-mono">{f.value}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">
              <code className="rounded bg-surface px-1">transcript</code> の値だけは手で打たず、変数の
              <b className="text-ink"> 音声入力したテキスト </b>
              を選んでください。ここが手打ちだと、毎回同じ文章を送ることになります。
            </p>
          </li>
          <li>
            <Step n={5} />
            <b className="text-ink">クリップボードに設定</b> を追加する。これで整形結果がコピーされ、どのアプリにも貼れます
          </li>
          <li>
            <Step n={6} />
            ショートカットの設定から、アクションボタン・背面タップ・ホーム画面のいずれかに割り当てる
          </li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-ink">3. 先に手元で試す</h2>
        <p className="text-xs leading-relaxed text-ink-soft">
          ショートカットを組む前に、この curl が通ることを確かめておくと切り分けが楽になります。
        </p>
        <CopyBox
          label="curl"
          value={origin ? curlExample({ origin, mode, tone, outputLang }) : ""}
          copied={copied === "curl"}
          onCopy={() => copy("curl", curlExample({ origin, mode, tone, outputLang }))}
          multiline
        />
      </section>

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-sm font-medium text-ink">うまくいかないとき</h2>
        <dl className="mt-2 space-y-2 text-xs leading-relaxed text-ink-soft">
          <div>
            <dt className="font-medium text-ink">結果が整形されていない</dt>
            <dd>
              サーバに <code className="rounded bg-surface px-1">ANTHROPIC_API_KEY</code>{" "}
              が設定されていません。鍵が無いとエラーにはならず、フィラー除去だけのルールベースに落ちます。
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">429 が返る</dt>
            <dd>
              レート制限です。既定は1つのIPあたり5分20回。モバイル回線は他の利用者と IP
              を共有することがあるため、身に覚えがなくても当たる場合があります。サーバ側の{" "}
              <code className="rounded bg-surface px-1">RATE_LIMIT_MAX</code> で調整できます。
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink">空が返る</dt>
            <dd>意味のある発話が無かったときは、仕様として空文字列を返します。</dd>
          </div>
        </dl>
      </section>

      <footer className="text-xs text-ink-faint">
        <Link href="/" className="underline underline-offset-2 hover:text-ink">
          ← NoType に戻る
        </Link>
      </footer>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="mr-2 inline-grid size-5 place-items-center rounded-full bg-accent-soft text-[11px] font-medium text-accent">
      {n}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CopyBox({
  label,
  value,
  copied,
  onCopy,
  multiline = false,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  multiline?: boolean;
}) {
  return (
    <div className="mt-2 flex items-start gap-2">
      <pre
        data-testid={`shortcut-${label}`}
        className={[
          "min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink",
          multiline ? "whitespace-pre" : "whitespace-nowrap",
        ].join(" ")}
      >
        {value || "　"}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        disabled={!value}
        className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        {copied ? "コピー済" : "コピー"}
      </button>
    </div>
  );
}
