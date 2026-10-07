// Shared heading + body block for the Privacy, Terms and DPA pages.
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight mb-2">{title}</h2>
      {children}
    </section>
  );
}
