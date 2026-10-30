import { getLang } from "./i18n";

// The legal pages live on the landing site (marketing/), not in this app -
// frontend/vercel.json redirects the old app.tidybridge.dev paths there.
// Spanish at the root, English under /en/, following the app's language.
export function legalUrls(): { privacy: string; terms: string; dpa: string } {
  const base = getLang() === "en" ? "https://tidybridge.dev/en" : "https://tidybridge.dev";
  return { privacy: `${base}/privacy`, terms: `${base}/terms`, dpa: `${base}/dpa` };
}
