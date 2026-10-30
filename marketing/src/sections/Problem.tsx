import { useCopy } from "../i18n";
import { Section } from "./Section";

export function Problem() {
  const { problem } = useCopy();
  return (
    <Section title={problem.title}>
      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {problem.points.map((point) => (
          <li key={point} className="rounded-lg border border-border bg-card p-4 text-muted-foreground">
            {point}
          </li>
        ))}
      </ul>
    </Section>
  );
}
