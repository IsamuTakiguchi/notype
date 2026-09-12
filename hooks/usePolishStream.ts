"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DictEntry, Engine, FallbackReason, Mode, Tone } from "@/lib/types";

export type PolishInput = {
  mode: Mode;
  tone: Tone;
  outputLang: string;
  transcript: string;
  target?: string;
  dictionary: DictEntry[];
};

export type PolishState = {
  text: string;
  isStreaming: boolean;
  engine: Engine | null;
  fallbackReason: FallbackReason | null;
  error: string | null;
  /** ストリームが途中で切れた（部分的な結果が残っている）。 */
  truncated: boolean;
};

const IDLE: PolishState = {
  text: "",
  isStreaming: false,
  engine: null,
  fallbackReason: null,
  error: null,
  truncated: false,
};

export type PolishResult = { text: string; engine: Engine };

export type UsePolishStream = PolishState & {
  /** 完了時は結果を返す。中断・エラー時は null。 */
  run: (input: PolishInput) => Promise<PolishResult | null>;
  abort: () => void;
  reset: () => void;
};

export function usePolishStream(): UsePolishStream {
  const [state, setState] = useState<PolishState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  /** トークン到着ごとに setState すると日本語テキストの再描画が目に見えてカクつく。 */
  const bufferRef = useRef("");
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const pending = bufferRef.current;
    if (!pending) return;
    bufferRef.current = "";
    setState((prev) => ({ ...prev, text: prev.text + pending }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const cancelFlush = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abort();
    cancelFlush();
    bufferRef.current = "";
    setState(IDLE);
  }, [abort, cancelFlush]);

  const run = useCallback(
    async (input: PolishInput): Promise<PolishResult | null> => {
      abort();
      cancelFlush();
      bufferRef.current = "";

      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ ...IDLE, isStreaming: true });

      try {
        const response = await fetch("/api/polish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          setState({ ...IDLE, error: message });
          return null;
        }

        const engine = (response.headers.get("x-notype-engine") as Engine | null) ?? "claude";
        const fallbackReason = response.headers.get(
          "x-notype-fallback-reason",
        ) as FallbackReason | null;
        setState((prev) => ({ ...prev, engine, fallbackReason }));

        const body = response.body;
        if (!body) {
          setState((prev) => ({ ...prev, isStreaming: false }));
          return null;
        }

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let full = "";

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            full += chunk;
            bufferRef.current += chunk;
            scheduleFlush();
          }
        } catch (streamError) {
          // 1バイト送出後にサーバー側で失敗すると read() が reject する。
          // 受け取り済みの部分は捨てずに残す。
          if (controller.signal.aborted) throw streamError;
          cancelFlush();
          flush();
          setState((prev) => ({
            ...prev,
            text: full,
            isStreaming: false,
            truncated: true,
            error: "生成が途中で中断されました。",
          }));
          return null;
        }

        cancelFlush();
        bufferRef.current = "";
        setState((prev) => ({ ...prev, text: full, isStreaming: false }));
        return { text: full, engine };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          cancelFlush();
          setState((prev) => ({ ...prev, isStreaming: false }));
          return null;
        }
        cancelFlush();
        setState({
          ...IDLE,
          error: "サーバーに接続できませんでした。ネットワークを確認してください。",
        });
        return null;
      } finally {
        controllerRef.current = null;
      }
    },
    [abort, cancelFlush, flush, scheduleFlush],
  );

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { ...state, run, abort, reset };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "error" in data) {
      const message = (data as { error: unknown }).error;
      if (typeof message === "string") return message;
    }
  } catch {
    // JSON でないエラー本文は無視して定型文にする。
  }
  return `整形に失敗しました（HTTP ${response.status}）。`;
}
