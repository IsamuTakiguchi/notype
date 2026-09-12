"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SSR 安全な永続状態。
 *
 * 初回レンダーは必ず initial を返す。useState の遅延初期化で localStorage を
 * 読むのは CSR なら動くが、Next では サーバー出力とクライアント初回描画が
 * 食い違って hydration mismatch になる。読み出しは必ず effect の中で行う。
 *
 * parse は初回マウント時にしか使わないので、参照が安定していることを前提にする
 * （モジュールトップレベルの関数を渡すこと）。
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
  parse?: (raw: unknown) => T | null,
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const parseRef = useRef(parse);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const decoded: unknown = JSON.parse(raw);
        const validated = parseRef.current ? parseRef.current(decoded) : (decoded as T);
        if (validated !== null && validated !== undefined) setValue(validated);
      }
    } catch {
      // 壊れた値・パース不能・アクセス不可（プライベートモード等）はすべて
      // 「保存されていなかった」と同じ扱いにする。
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ここも失敗するなら諦める。
      }
    }
    setHydrated(true);
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Safari のプライベートモードは setItem で throw する。保存できなくても
          // 画面上の状態は進めてよい。
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update, hydrated];
}
