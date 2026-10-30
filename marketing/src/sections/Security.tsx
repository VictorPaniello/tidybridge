import { legalHref, pageLang, useCopy } from "../i18n";
import { Section } from "./Section";

export function Security() {
  const { security } = useCopy();
  return (
    <Section id="seguridad" title={security.title}>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {security.cards.map((card) => (
          <li key={card.title} className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{card.text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm">
        <a href={legalHref(pageLang(), "privacy")} className="text-ring hover:underline">
          {security.more}
        </a>
      </p>
    </Section>
  );
}
