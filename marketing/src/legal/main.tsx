import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SiteFooter, SiteHeader } from "../site";
import { DpaPage } from "./DpaPage";
import { PrivacyPage } from "./PrivacyPage";
import { TermsPage } from "./TermsPage";
import "../index.css";

// One entry for privacy.html, terms.html and dpa.html - each sets
// data-page on #root to pick its page.
const PAGES = { privacy: PrivacyPage, terms: TermsPage, dpa: DpaPage };

const root = document.getElementById("root")!;
const Page = PAGES[root.dataset.page as keyof typeof PAGES];

createRoot(root).render(
  <StrictMode>
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 mx-auto w-full max-w-6xl px-4 py-12">
        <Page />
      </main>
      <SiteFooter />
    </div>
  </StrictMode>,
);
