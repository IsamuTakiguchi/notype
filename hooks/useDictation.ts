"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type {
  NtSpeechErrorCode,
  NtSpeechRecognition,
  NtSpeechRecognitionErrorEvent,
  NtSpeechRecognitionEvent,
} from "@/types/speech";

export type DictationStatus = "idle" | "starting" | "listening" | "error";

export type DictationError = {
  code: NtSpeechErrorCode | "unsupported" | "restart-failed";
  message: string;
  /** false のときは再試行しても状況が変わらない（権限拒否など）。 */
  recoverable: boolean;
};

export type UseDictationOptions = {
  /** BCP-47。start() の前に設定する必要があるため、変更時はセッションを張り直す。 */
  lang: string;
  /** 確定したセグメントを外に出す。フック側では保持しない。 */
  onFinalSegment: (text: string) => void;
};

export type UseDictation = {
  /** null は「まだ判定していない」。SSR と初回描画で false を出すと hydration mismatch になる。 */
  isSupported: boolean | null;
  /** null は判定前。UI の文言をエンジンの挙動に合わせるために使う。 */
  profile: SpeechProfile | null;
  status: DictationStatus;
  /** 未確定の認識結果。ライブ字幕として薄く表示する。 */
  interim: string;
  error: DictationError | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  clearError: () => void;
};

const RESTART_BACKOFF_MS = [250, 500, 1000, 2000, 4000];
/** これより早く onend が来たら「開始できていない」とみなす。 */
const FAST_END_THRESHOLD_MS = 250;

const TERMINAL_ERRORS: ReadonlySet<string> = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "language-not-supported",
  "bad-grammar",
]);

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed":
    "マイクの使用が許可されていません。アドレスバーの設定からマイクを許可してください（http:// のページでは利用できません）。",
  "service-not-allowed":
    "この環境では音声認識サービスを利用できません。HTTPS または localhost で開いてください。",
  "audio-capture": "マイクが見つかりません。入力デバイスを確認してください。",
  "language-not-supported": "この言語には対応していません。日本語に戻します。",
  "bad-grammar": "音声認識の設定に問題があります。",
  network: "音声認識サービスに接続できません。テキストを貼り付けて整形することもできます。",
  unsupported:
    "このブラウザは音声入力に対応していません。Chrome または Edge をお使いください。テキストを貼り付けて整形することもできます。",
  "restart-failed": "音声認識が繰り返し停止しました。マイクの状態を確認して、もう一度お試しください。",
};

function messageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? "音声認識でエラーが発生しました。";
}

/**
 * 認識エンジンの挙動の型。
 *
 * - continuous: Chrome / Edge。話し続けられる。勝手に終了するので自動で張り直す。
 * - single-shot: WebKit（iOS の全ブラウザと macOS Safari）。continuous が信頼できず、
 *   start() にユーザー操作を要求するため、1タップ＝1発話として扱う。
 * - unsupported: API そのものが無い（Firefox など）。
 *
 * 注意: single-shot 経路は実機の iOS Safari で検証できていない。
 * この環境には WebKit が無く、Playwright も chromium しか入っていない。
 */
export type SpeechProfile = "continuous" | "single-shot" | "unsupported";

/**
 * プロファイル判定はサーバーでは決まらない値なので useSyncExternalStore で扱う。
 * effect で setState して差し替える書き方より素直で、初回描画での
 * 「非対応です」のちらつき（= hydration mismatch）も構造的に起きない。
 */
const subscribeToNothing = () => () => {};
let profileCache: SpeechProfile | null = null;
/** getSnapshot は毎レンダー呼ばれ Object.is で比較されるので、値を固定する。 */
function getProfileSnapshot(): SpeechProfile {
  profileCache ??= detectProfile();
  return profileCache;
}
const getServerProfileSnapshot = (): SpeechProfile | null => null;

function detectProfile(): SpeechProfile {
  if (typeof window === "undefined") return "unsupported";
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return "unsupported";

  const ua = window.navigator.userAgent;
  // iPhone / iPad は全ブラウザが WebKit。iPadOS は Macintosh を名乗るので touch 数も見る。
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);

  return isIOS || isSafari ? "single-shot" : "continuous";
}

export function useDictation({ lang, onFinalSegment }: UseDictationOptions): UseDictation {
  const profile = useSyncExternalStore<SpeechProfile | null>(
    subscribeToNothing,
    getProfileSnapshot,
    getServerProfileSnapshot,
  );
  const isSupported = profile === null ? null : profile !== "unsupported";
  const singleShot = profile === "single-shot";
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<DictationError | null>(null);

  const recognitionRef = useRef<NtSpeechRecognition | null>(null);
  /** onend ハンドラは作られた時点のレンダーを閉じ込めるので、意図は必ず ref で持つ。 */
  const wantListeningRef = useRef(false);
  const startedRef = useRef(false);
  const lastStartAtRef = useRef(0);
  const fastEndsRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef(lang);
  const onFinalRef = useRef(onFinalSegment);
  /** onend ハンドラから読むので ref に持つ。state だと生成時の古い値を見る。 */
  const singleShotRef = useRef(singleShot);

  useEffect(() => {
    onFinalRef.current = onFinalSegment;
    singleShotRef.current = singleShot;
  }, [onFinalSegment, singleShot]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const rawStart = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || startedRef.current) return;
    recognition.lang = langRef.current;
    try {
      recognition.start();
      startedRef.current = true;
      lastStartAtRef.current = Date.now();
    } catch {
      // 既に開始済みだと InvalidStateError を投げる。二重開始は無視してよい。
      startedRef.current = true;
    }
  }, []);

  const teardown = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    // 順序が重要。先に abort すると onend がゾンビセッションを再起動し、
    // マイクのインジケータが消えなくなる。
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;
    try {
      recognition.abort();
    } catch {
      // 既に停止している場合は何もしない。
    }
    startedRef.current = false;
  }, []);

  const buildRecognition = useCallback((): NtSpeechRecognition | null => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return null;

    const recognition = new Ctor();
    // WebKit は continuous を立てても素直に従わず、切れたまま戻らないことがある。
    // 動いたり動かなかったりするより、1発話ずつ確実に取るほうがよい。
    recognition.continuous = !singleShotRef.current;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = langRef.current;

    recognition.onstart = () => {
      lastStartAtRef.current = Date.now();
      setStatus("listening");
    };

    recognition.onresult = (event: NtSpeechRecognitionEvent) => {
      let pending = "";
      // results は「今のセッション分」でしかない。再起動すると resultIndex は 0 に戻り、
      // 前のセッションの確定分はここから消える。確定分は必ず外へ出して積み上げる。
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onFinalRef.current(trimmed);
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };

    recognition.onerror = (event: NtSpeechRecognitionErrorEvent) => {
      const code = event.error;
      // no-speech は沈黙のたびに飛んでくる。出すとノイズにしかならない。
      if (code === "no-speech") return;
      // aborted はこちらが止めたときのもの。
      if (code === "aborted") return;

      if (TERMINAL_ERRORS.has(code)) {
        wantListeningRef.current = false;
        clearRestartTimer();
        setStatus("error");
        setInterim("");
        setError({ code, message: messageFor(code), recoverable: false });
        return;
      }
      // network はこの後 onend が来るので、再起動側のバックオフに任せる。
      setError({ code, message: messageFor(code), recoverable: true });
    };

    recognition.onend = () => {
      startedRef.current = false;
      setInterim("");
      if (!wantListeningRef.current) {
        setStatus("idle");
        return;
      }

      // single-shot では1発話で終わるのが正常。ここで張り直すと、
      // WebKit が start() にユーザー操作を要求するぶん失敗し、エラーだけが増える。
      if (singleShotRef.current) {
        wantListeningRef.current = false;
        setStatus("idle");
        return;
      }

      const elapsed = Date.now() - lastStartAtRef.current;
      if (elapsed < FAST_END_THRESHOLD_MS) {
        fastEndsRef.current += 1;
      } else {
        fastEndsRef.current = 0;
      }

      if (fastEndsRef.current >= RESTART_BACKOFF_MS.length) {
        // 素朴に再起動し続けると CPU を焼き、権限ダイアログを出し続けることになる。
        wantListeningRef.current = false;
        setStatus("error");
        setError({ code: "restart-failed", message: messageFor("restart-failed"), recoverable: true });
        return;
      }

      const delay = fastEndsRef.current === 0 ? 0 : RESTART_BACKOFF_MS[fastEndsRef.current - 1] ?? 0;
      setStatus("starting");
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (wantListeningRef.current) rawStart();
      }, delay);
    };

    return recognition;
  }, [clearRestartTimer, rawStart]);

  const start = useCallback(() => {
    if (isSupported === false) {
      setError({ code: "unsupported", message: messageFor("unsupported"), recoverable: false });
      return;
    }
    if (wantListeningRef.current) return;

    if (!recognitionRef.current) {
      recognitionRef.current = buildRecognition();
      if (!recognitionRef.current) {
        setError({ code: "unsupported", message: messageFor("unsupported"), recoverable: false });
        return;
      }
    }

    setError(null);
    fastEndsRef.current = 0;
    wantListeningRef.current = true;
    setStatus("starting");
    rawStart();
  }, [buildRecognition, isSupported, rawStart]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    clearRestartTimer();
    setInterim("");
    setStatus("idle");
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // 停止済みなら何もしない。
    }
  }, [clearRestartTimer]);

  const toggle = useCallback(() => {
    if (wantListeningRef.current) stop();
    else start();
  }, [start, stop]);

  // lang は start() の前に設定しないと効かない。聞いている最中なら張り直す。
  useEffect(() => {
    langRef.current = lang;
    const recognition = recognitionRef.current;
    if (!recognition || !wantListeningRef.current) return;
    recognition.lang = lang;
    try {
      // abort() で onend が走り、再起動ロジックが新しい lang で立ち上げ直す。
      recognition.abort();
    } catch {
      // 何もしない。
    }
  }, [lang]);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      clearRestartTimer();
      teardown();
      recognitionRef.current = null;
    };
  }, [clearRestartTimer, teardown]);

  const clearError = useCallback(() => setError(null), []);

  return { isSupported, profile, status, interim, error, start, stop, toggle, clearError };
}
