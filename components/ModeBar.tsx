"use client";

import {
  INPUT_LANGS,
  MODES,
  OUTPUT_LANGS,
  TONES,
  type Mode,
  type Settings,
  type Tone,
} from "@/lib/types";

type Props = {
  settings: Settings;
  onChange: (next: Partial<Settings>) => void;
};

export function ModeBar({ settings, onChange }: Props) {
  const activeMode = MODES.find((m) => m.value === settings.mode);

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <Field label="モード" hint={activeMode?.hint}>
        <div
          role="radiogroup"
          aria-label="モード"
          data-testid="mode-select"
          className="flex rounded-lg border border-line bg-panel p-0.5"
        >
          {MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={settings.mode === mode.value}
              data-testid={`mode-${mode.value}`}
              onClick={() => onChange({ mode: mode.value as Mode })}
              className={[
                "rounded-md px-3 py-1.5 text-sm transition",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                settings.mode === mode.value
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-soft hover:text-ink",
              ].join(" ")}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="トーン" hint={TONES.find((t) => t.value === settings.tone)?.hint}>
        <Select
          testId="tone-select"
          ariaLabel="トーン"
          value={settings.tone}
          onChange={(value) => onChange({ tone: value as Tone })}
          options={TONES.map((t) => ({ value: t.value, label: t.label }))}
        />
      </Field>

      <Field label="話す言語">
        <Select
          testId="input-lang-select"
          ariaLabel="話す言語"
          value={settings.inputLang}
          onChange={(value) => onChange({ inputLang: value })}
          options={INPUT_LANGS.map((l) => ({ value: l.value, label: l.label }))}
        />
      </Field>

      {settings.mode === "translate" ? (
        <Field label="翻訳先">
          <Select
            testId="output-lang-select"
            ariaLabel="翻訳先の言語"
            value={settings.outputLang}
            onChange={(value) => onChange({ outputLang: value })}
            options={OUTPUT_LANGS.map((l) => ({ value: l.value, label: l.label }))}
          />
        </Field>
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-xs font-medium tracking-wide text-ink-faint">{label}</span>
        {hint ? <span className="truncate text-xs text-ink-faint/80">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Select({
  testId,
  ariaLabel,
  value,
  onChange,
  options,
}: {
  testId: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <select
      data-testid={testId}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
