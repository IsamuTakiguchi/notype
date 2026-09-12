/**
 * Web Speech API（webkit 接頭辞付き）の型定義。
 *
 * 名前に Nt を付けているのは意図的。lib.dom.d.ts は版によって
 * SpeechRecognition を持ったり持たなかったりするので、素直な名前で
 * `declare var SpeechRecognition` と書くと Duplicate identifier で落ちる。
 */

export interface NtSpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface NtSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): NtSpeechRecognitionAlternative;
  readonly [index: number]: NtSpeechRecognitionAlternative;
}

export interface NtSpeechRecognitionResultList {
  readonly length: number;
  item(index: number): NtSpeechRecognitionResult;
  readonly [index: number]: NtSpeechRecognitionResult;
}

export interface NtSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: NtSpeechRecognitionResultList;
}

export type NtSpeechErrorCode =
  | "no-speech"
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported";

export interface NtSpeechRecognitionErrorEvent extends Event {
  readonly error: NtSpeechErrorCode;
  readonly message: string;
}

export interface NtSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: NtSpeechRecognitionEvent) => void) | null;
  onerror: ((event: NtSpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

declare global {
  interface Window {
    // optional にしてあるのは、全ての呼び出し箇所をサポート判定経由に強制するため。
    webkitSpeechRecognition?: new () => NtSpeechRecognition;
    SpeechRecognition?: new () => NtSpeechRecognition;
  }
}
