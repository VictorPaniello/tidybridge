import { useCopy } from "../i18n";
import { Section } from "./Section";

export function Faq() {
  const { faq } = useCopy();
  return (
    <Section id="preguntas" title={faq.title}>
      <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
        {faq.items.map((item) => (
          <details key={item.q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {item.q}
              <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
