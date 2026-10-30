import { useCopy } from "../i18n";
import { Screenshot } from "./Screenshot";
import { Section } from "./Section";

export function Control() {
  const { control } = useCopy();
  return (
    <Section title={control.title}>
      <div className="mt-6 grid gap-8 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-muted-foreground">{control.intro}</p>
          <ul className="mt-5 space-y-2">
            {control.checks.map((check) => (
              <li key={check} className="flex gap-2">
                <span aria-hidden="true" className="text-amber-600 dark:text-amber-400">
                  ⚠
                </span>
                {check}
              </li>
            ))}
          </ul>
        </div>
        <Screenshot name="review" alt={control.alt} />
      </div>
    </Section>
  );
}
