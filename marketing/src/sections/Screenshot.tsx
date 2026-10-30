// An app screen in the current theme: both images are in the page and the
// .dark class (system theme or the toggle) picks one.
export function Screenshot({ name, alt }: { name: string; alt: string }) {
  const cls = "w-full h-auto rounded-lg border border-border";
  return (
    <>
      <img src={`/screens/${name}-light.png`} alt={alt} loading="lazy" className={`${cls} dark:hidden`} />
      <img src={`/screens/${name}-dark.png`} alt={alt} loading="lazy" className={`${cls} hidden dark:block`} />
    </>
  );
}
