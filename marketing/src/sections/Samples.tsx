import { type KeyboardEvent, useId, useRef, useState } from "react";
import { type Sample, SHOWN_FIELDS, formatValue } from "../format";
import { pageLang, useCopy } from "../i18n";
import samples from "../samples.json";
import { Section } from "./Section";

const SAMPLES = samples as Sample[];

export function Samples() {
  const copy = useCopy();
  const lang = pageLang();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const sample = SAMPLES[active];

  function onKeyDown(e: KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = (active + step + SAMPLES.length) % SAMPLES.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <Section title={copy.samples.title}>
      <p className="mt-3 text-muted-foreground">{copy.samples.intro}</p>
      <div role="tablist" aria-label={copy.samples.tabs} className="mt-6 flex flex-wrap gap-2">
        {SAMPLES.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              i === active ? "border-ring bg-accent text-accent-foreground" : "border-border hover:bg-secondary"
            }`}
          >
            {s.label[lang]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${active}`}
        className="mt-6 grid gap-6 md:grid-cols-2 md:items-start"
      >
        <img src={sample.image} alt="" className="w-full h-auto rounded-lg" />
        <div className="min-w-0">
          <h3 className="font-semibold">{copy.samples.extracted}</h3>
          <dl className="mt-3 divide-y divide-border rounded-lg border border-border bg-card text-sm">
            {SHOWN_FIELDS.map((field) => (
              <div key={field} className="flex justify-between gap-4 px-4 py-2">
                <dt className="text-muted-foreground">{copy.fields[field]}</dt>
                <dd className="font-medium text-right break-words">
                  {formatValue(lang, field, sample.invoice[field])}
                </dd>
              </div>
            ))}
          </dl>
          <p
            className={`mt-3 rounded-md px-3 py-2 text-sm ${
              sample.issues.length
                ? "border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                : "bg-accent text-accent-foreground"
            }`}
          >
            {sample.issues.length
              ? sample.issues
                  .map((issue) => `${copy.fields[issue.field as keyof typeof copy.fields]}: ${issue[lang]}`)
                  .join(" · ")
              : copy.samples.noIssues}
          </p>
        </div>
      </div>
    </Section>
  );
}
