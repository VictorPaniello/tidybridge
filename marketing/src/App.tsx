import { useCopy } from "./i18n";
import { Control } from "./sections/Control";
import { Faq } from "./sections/Faq";
import { Hero } from "./sections/Hero";
import { HowItWorks } from "./sections/HowItWorks";
import { Pilot } from "./sections/Pilot";
import { PilotForm } from "./sections/PilotForm";
import { Problem } from "./sections/Problem";
import { Samples } from "./sections/Samples";
import { Security } from "./sections/Security";
import { SiteFooter, SiteHeader } from "./site";

// tidybridge.dev for gestorías: the section order approved 2026-10-30.
export default function App() {
  const copy = useCopy();
  return (
    <div className="min-h-dvh flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {copy.nav.skip}
      </a>
      <SiteHeader />
      <main id="main" className="flex-1 mx-auto w-full max-w-6xl px-4">
        <Hero />
        <Problem />
        <HowItWorks />
        <Samples />
        <Control />
        <Pilot />
        <Security />
        <Faq />
        <PilotForm />
      </main>
      <SiteFooter />
    </div>
  );
}
