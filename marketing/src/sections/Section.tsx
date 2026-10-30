import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "../site";

// Every section below the hero: a gentle reveal when it scrolls into view.
export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      id={id}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="scroll-mt-20 py-14 sm:py-20 border-t border-border"
    >
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] max-w-2xl">{title}</h2>
      {children}
    </motion.section>
  );
}
