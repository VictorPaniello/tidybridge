import { motion, useReducedMotion } from "motion/react";
import { type Sample, SHOWN_FIELDS, formatValue } from "../format";
import { pageLang, useCopy } from "../i18n";

const STEP = 0.18; // seconds between fields filling in

// The hero's proof: an invoice, and its fields filling in one by one, then
// the one thing flagged for review. Plays once when it scrolls into view;
// with reduced motion it's simply the final state. Every value is in the
// DOM from the start (only opacity animates), so screen readers get it all.
export function InvoiceDemo({ sample }: { sample: Sample }) {
  const reduce = useReducedMotion();
  const lang = pageLang();
  const copy = useCopy();
  const issue = sample.issues[0];
  const shown = SHOWN_FIELDS.filter((f) => sample.invoice[f] != null);
  const fieldIn = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, x: 8 },
          whileInView: { opacity: 1, x: 0 },
          viewport: { once: true },
          transition: { delay: 0.4 + i * STEP, duration: 0.3 },
        };

  return (
    <figure
      aria-label={copy.hero.demoLabel}
      className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] gap-3 rounded-xl border border-border bg-card p-3 shadow-[0_18px_40px_-20px_rgba(28,25,23,0.35)]"
    >
      <img
        src={sample.image}
        alt=""
        width={760}
        height={700}
        className="w-full h-auto rounded-md self-center"
      />
      <dl className="space-y-1 text-xs sm:text-sm min-w-0">
        {shown.map((field, i) => {
          const flagged = issue?.field === field;
          return (
            <motion.div
              key={field}
              {...fieldIn(i)}
              className={`flex justify-between gap-2 rounded-md px-2 py-1 ${
                flagged
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-secondary"
              }`}
            >
              <dt className="text-muted-foreground truncate">{copy.fields[field]}</dt>
              <dd className="font-medium text-right break-words">
                {formatValue(lang, field, sample.invoice[field])}
                {field === "supplier_tax_id" && (
                  <span className="ml-1 text-primary" title={copy.fields.validTaxId}>
                    ✓
                  </span>
                )}
                {flagged && <span aria-hidden="true"> ⚠</span>}
              </dd>
            </motion.div>
          );
        })}
        {issue && (
          <motion.p
            {...fieldIn(shown.length + 1)}
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
          >
            {copy.fields[issue.field as keyof typeof copy.fields]}: {issue[lang]}
          </motion.p>
        )}
      </dl>
    </figure>
  );
}
