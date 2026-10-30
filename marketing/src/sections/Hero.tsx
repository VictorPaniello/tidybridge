import { motion, useReducedMotion } from "motion/react";
import type { Sample } from "../format";
import { home, pageLang, useCopy } from "../i18n";
import samples from "../samples.json";
import { Cta, EASE_OUT } from "../site";
import { InvoiceDemo } from "./InvoiceDemo";

const DEMO = (samples as Sample[]).find((s) => s.id === "photo")!;

export function Hero() {
  const reduce = useReducedMotion();
  const copy = useCopy();
  const base = home(pageLang());
  const rise = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.5, ease: EASE_OUT } };
  return (
    <section className="relative isolate py-12 sm:py-20 grid gap-10 md:grid-cols-2 md:items-center">
      <div aria-hidden="true" className="hero-glow pointer-events-none absolute inset-0 -z-10" />
      <div>
        <motion.h1
          {...rise(0)}
          className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] leading-[1.08] text-balance"
        >
          {copy.hero.title}
        </motion.h1>
        <motion.p {...rise(0.08)} className="mt-5 max-w-md text-muted-foreground text-lg">
          {copy.hero.subtitle}
        </motion.p>
        <motion.div {...rise(0.16)} className="mt-8 flex flex-wrap items-center gap-3">
          <Cta href={`${base}#piloto`}>{copy.hero.cta}</Cta>
          <Cta variant="secondary" href={`${base}#como-funciona`}>
            {copy.hero.secondary}
          </Cta>
        </motion.div>
      </div>
      <motion.div {...rise(0.24)} className="min-w-0">
        <InvoiceDemo sample={DEMO} />
      </motion.div>
    </section>
  );
}
