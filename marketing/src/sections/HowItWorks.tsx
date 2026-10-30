import { useCopy } from "../i18n";
import { Screenshot } from "./Screenshot";
import { Section } from "./Section";

export function HowItWorks() {
  const { how } = useCopy();
  return (
    <Section id="como-funciona" title={how.title}>
      <ol className="mt-8 grid gap-8 md:grid-cols-3">
        {how.steps.map((step, i) => (
          <li key={step.title} className="min-w-0">
            <div className="flex items-baseline gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {i + 1}
              </span>
              <h3 className="font-semibold">{step.title}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
      {/* One screen, big enough to read. On phones it scrolls inside its own
          frame - the page itself never scrolls sideways. */}
      <div className="mt-10 overflow-x-auto rounded-lg">
        <div className="min-w-[720px]">
          <Screenshot name="records" alt={how.screenAlt} />
        </div>
      </div>
    </Section>
  );
}
