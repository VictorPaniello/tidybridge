import { useCopy } from "../i18n";
import { Section } from "./Section";

export function Pilot() {
  const { pilot } = useCopy();
  return (
    <Section title={pilot.title}>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {pilot.steps.map((step) => (
          <li key={step.when} className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-medium text-primary">{step.when}</p>
            <p className="mt-2">{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">{pilot.dpa}</p>
    </Section>
  );
}
