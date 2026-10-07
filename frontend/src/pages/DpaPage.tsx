import { Link } from "react-router-dom";
import { LegalSection as Section } from "../components/LegalSection";

const linkClass = "text-ring hover:underline";

// GDPR Art. 28(3) processor terms for the client/invoice data customers
// upload. Adapted from the EU parts of General Legal's CC0 "dpa-global"
// template (github.com/General-Legal/legal-templates), cut down to what
// this service actually does. Every security measure and sub-processor
// below is checked against the code / Railway setup - see
// docs/superpowers/plans/2026-10-07-legal-update.md. Not legal advice.
export function DpaPage() {
  return (
    <div className="max-w-2xl space-y-8 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Data processing agreement</h1>
        <p className="text-muted-foreground">Last updated: October 2026</p>
      </div>

      <p>
        This agreement covers the personal data you upload to tidybridge about your own clients
        and suppliers. It forms part of the{" "}
        <Link to="/terms" className={linkClass}>
          Terms of service
        </Link>{" "}
        and applies automatically as soon as you upload such data, as required by Article 28 of
        the GDPR. If you need a signed copy for your records, email{" "}
        <a className={linkClass} href="mailto:panivictor14@gmail.com">panivictor14@gmail.com</a>.
      </p>

      <Section title="1. Who is who">
        <p>
          <strong>You</strong> (the account holder, for example a gestoría or accounting firm) are
          the <strong>controller</strong> of the client and invoice data you upload.{" "}
          <strong>tidybridge</strong>, operated by Victor Paniello (Barcelona, Spain), is your{" "}
          <strong>processor</strong>: it handles that data only to provide the service to you.
        </p>
        <p className="mt-2">
          Your own account data (your email, name, password) is a different matter: there,
          tidybridge is the controller, as described in the{" "}
          <Link to="/privacy" className={linkClass}>
            Privacy policy
          </Link>
          .
        </p>
      </Section>

      <Section title="2. What is processed">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Purpose and nature:</strong> cleaning, validating, flagging, storing and
            exporting the files you upload, and reading invoice fields from PDFs and images (when
            invoice extraction is enabled). The hosted service doesn't forward your data to any
            webhook or other system.
          </li>
          <li>
            <strong>Types of data:</strong> names, email addresses, phone numbers, dates, monetary
            amounts, and from invoices: supplier names, tax IDs (NIF/CIF), invoice numbers, dates
            and amounts.
          </li>
          <li>
            <strong>Whose data:</strong> your clients, customers and suppliers.
          </li>
          <li>
            <strong>Duration:</strong> for as long as you use the service, within the retention
            limits in section 9.
          </li>
          <li>
            <strong>Not allowed:</strong> special-category data (health, biometric and similar).
            The service isn't built for it, and the Terms forbid uploading it.
          </li>
        </ul>
      </Section>

      <Section title="3. Your instructions">
        <p>
          tidybridge processes this data only on your documented instructions: using the service
          as you configure it is that instruction. It won't use your data for any purpose of its
          own: no analytics, no marketing, no selling it, and no training AI models on it. The
          only exception needs your explicit written permission: keeping selected invoices to
          test how accurately extraction reads them. You can withdraw that permission at any
          time, and those invoices are then deleted. If an instruction seems to break data
          protection law, tidybridge will tell you.
        </p>
      </Section>

      <Section title="4. Confidentiality">
        <p>
          Only Victor Paniello has access to the systems that hold your data. Anyone given access
          in the future will be bound to confidentiality first.
        </p>
      </Section>

      <Section title="5. Security measures">
        <p>The measures actually in place today (GDPR Article 32):</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Data is hosted in the EU (Amsterdam, Netherlands).</li>
          <li>All traffic is encrypted in transit (HTTPS/TLS, with HSTS).</li>
          <li>
            Every record is tied to the account that uploaded it, and every request checks that
            it belongs to the account asking for it.
          </li>
          <li>Passwords are stored only as one-way hashes.</li>
          <li>Sessions can be revoked; logging out invalidates the session on the server.</li>
          <li>Rate limiting on login, registration and uploads, and a cap on upload size.</li>
          <li>
            The application connects to the database with a least-privilege role, not as the
            database owner.
          </li>
          <li>Daily database backups, kept for 30 days, for disaster recovery.</li>
        </ul>
      </Section>

      <Section title="6. Sub-processors">
        <p>You authorize tidybridge to use these sub-processors for your data:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>Railway Corporation</strong> (US company): hosts the application, database
            and backups, in its EU West region (Amsterdam). Transfers are covered by the EU
            Standard Contractual Clauses in{" "}
            <a className={linkClass} href="https://railway.com/legal/dpa" target="_blank" rel="noreferrer">
              Railway's DPA
            </a>
            .
          </li>
          <li>
            <strong>Anthropic, PBC</strong> (United States): only if invoice extraction is
            enabled, receives the invoice PDFs and images you upload, to read their fields. It
            may not train its models on them under{" "}
            <a className={linkClass} href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noreferrer">
              its commercial terms
            </a>
            , and transfers are covered by the Standard Contractual Clauses in{" "}
            <a className={linkClass} href="https://www.anthropic.com/legal/data-processing-addendum" target="_blank" rel="noreferrer">
              Anthropic's DPA
            </a>
            . CSV and Excel uploads are never sent to it.
          </li>
        </ul>
        <p className="mt-2">
          Each sub-processor is bound by data protection terms at least as protective as these.
          tidybridge will email you at least <strong>30 days</strong> before adding or replacing
          one. If you object, you can stop using the service and delete your data before the
          change takes effect.
        </p>
      </Section>

      <Section title="7. Helping you with your obligations">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Requests from the people in your data</strong> (access, correction,
            deletion): you can answer most yourself, by editing, exporting or deleting records in
            the app. For anything else, tidybridge will help.
          </li>
          <li>
            <strong>Breaches:</strong> if a personal data breach affects your data, tidybridge
            will tell you without undue delay, and where possible within{" "}
            <strong>48 hours</strong> of becoming aware of it, with what is known at the time, so
            you can meet your own 72-hour deadline with the AEPD.
          </li>
          <li>
            <strong>Impact assessments:</strong> tidybridge will give you the information about
            the service you need for one.
          </li>
        </ul>
      </Section>

      <Section title="8. Audits">
        <p>
          tidybridge will answer reasonable questions about how your data is handled and give you
          the information you need to show compliance. If you need an audit beyond that, it can
          be arranged with reasonable notice, at your cost, without exposing other customers'
          data.
        </p>
      </Section>

      <Section title="9. Retention, deletion and invoices">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Uploaded data is deleted automatically one year after it's ingested, or earlier when
            you delete it.
          </li>
          <li>
            Deleting your account erases all your uploaded data immediately. Export what you
            need first.
          </li>
          <li>Backups that still contain deleted data expire within 30 days.</li>
          <li>
            <strong>tidybridge is not an invoice archive.</strong> Spanish law requires invoices
            to be kept for four to six years. That obligation stays with you and your accounting
            software, not with tidybridge.
          </li>
        </ul>
      </Section>

      <Section title="10. Where your data goes">
        <p>
          Your uploaded data is stored and processed in the EU. The only exception is invoice
          documents sent to Anthropic in the United States when extraction is enabled, under the
          safeguards in section 6.
        </p>
      </Section>

      <Section title="11. The free pilot">
        <p>
          In the free pilot you send your invoices to Victor instead of uploading them yourself,
          and he does the processing for you. For the pilot:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            This agreement applies from when you accept it, by replying to the email that sends
            it to you, and <strong>before</strong> you send any invoices.
          </li>
          <li>
            You send the files by email. The email provider that receives them is named in that
            same email and acts as an additional sub-processor for the pilot.
          </li>
          <li>
            Victor uploads them into his own tidybridge account (hosted in the EU, as above),
            reviews the results and sends you back a spreadsheet.
          </li>
          <li>
            Once you confirm you've received it, he deletes the records from tidybridge and,
            within 30 days, the files and your emails from his mailbox and devices.
          </li>
        </ul>
      </Section>

      <Section title="12. Everything else">
        <p>
          This agreement lasts as long as tidybridge processes your data. If it conflicts with the
          Terms on data protection, this agreement wins. It is governed by Spanish law, like the
          Terms.
        </p>
      </Section>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border">
        Adapted from General Legal's public CC0 data processing addendum template and written to
        match what this service actually does. Not a substitute for independent legal advice.
      </p>
    </div>
  );
}
