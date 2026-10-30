// The landing in Spanish (at /) and English (at /en/). Each HTML entry sets
// <html lang>, so the language is known before React runs and every page
// works without JS-side routing. All copy lives here, one shape per language.

export type Lang = "es" | "en";

export function pageLang(): Lang {
  return document.documentElement.lang === "en" ? "en" : "es";
}

/** The home page of a language; section links hang off it ("/#piloto"). */
export function home(lang: Lang): string {
  return lang === "en" ? "/en/" : "/";
}

/** The same page in the other language: "/" ⇄ "/en/", "/privacy" ⇄ "/en/privacy". */
export function otherLangHref(lang: Lang, path: string): string {
  if (lang === "en") return path.replace(/^\/en(\/|$)/, "/");
  return path === "/" ? "/en/" : `/en${path}`;
}

const es = {
  nav: {
    how: "Cómo funciona",
    security: "Seguridad",
    faq: "Preguntas",
    signIn: "Iniciar sesión",
    pilot: "Solicitar piloto",
    menu: "Menú",
    main: "Principal",
    switchTo: "English",
    switchShort: "EN",
    theme: { light: "Cambiar a tema claro", dark: "Cambiar a tema oscuro" },
  },
  hero: {
    title: "Las facturas de tus clientes, listas para tu programa contable.",
    subtitle:
      "Sube PDFs o fotos. Extraemos NIF, base, IVA y retención, y marcamos lo dudoso para que lo revises. Sin teclear.",
    cta: "Solicitar piloto gratuito",
    secondary: "Ver cómo funciona",
    demoLabel: "Ejemplo: una factura y los datos que extraemos de ella",
  },
  problem: {
    title: "Cada trimestre, cientos de facturas tecleadas a mano.",
    points: [
      "Horas copiando NIF, bases e IVA de PDFs y fotos.",
      "Un dígito mal tecleado y el modelo no cuadra.",
      "Y todo llega a la vez, al cierre del trimestre.",
    ],
  },
  how: {
    title: "Cómo funciona",
    steps: [
      {
        title: "Envías las facturas",
        text: "PDFs o fotos del móvil, de uno o de varios clientes.",
        alt: "Pantalla de subida de tidybridge con un archivo procesado",
      },
      {
        title: "Extraemos y comprobamos",
        text: "Proveedor, cliente, NIF, fechas, base, IVA y retención. Comprobamos el dígito de control del NIF, que los totales cuadren y que no haya facturas repetidas.",
        alt: "Tabla de registros con las facturas extraídas",
      },
      {
        title: "Revisas y exportas",
        text: "Revisas solo lo marcado y exportas a CSV o Excel para importarlo en tu programa contable.",
        alt: "Exportación de los registros a CSV",
      },
    ],
  },
  samples: {
    title: "Pruébalo con una factura de ejemplo",
    intro: "Facturas inventadas, ya procesadas. Elige una y mira qué extraemos.",
    tabs: "Facturas de ejemplo",
    extracted: "Datos extraídos",
    noIssues: "Sin incidencias",
  },
  control: {
    title: "La IA propone. Tú apruebas.",
    intro:
      "Lo que no está claro se marca, con el motivo. Los registros marcados no se envían a ningún sistema hasta que los corrijas o los apruebes.",
    checks: [
      "NIF con un dígito de control que no cuadra",
      "Base + IVA − retención que no da el total",
      "Datos poco legibles en el documento",
      "La misma factura subida dos veces",
    ],
    alt: "Revisión de una factura con una incidencia marcada",
  },
  pilot: {
    title: "El piloto gratuito, paso a paso",
    steps: [
      { when: "Día 1", text: "Nos envías las facturas de un cliente." },
      { when: "En 2 días laborables", text: "Te las devolvemos revisadas en una hoja de cálculo." },
      { when: "Después", text: "Decides si quieres seguir. Sin compromiso." },
    ],
    dpa: "Antes de enviar nada, firmamos un acuerdo de tratamiento de datos (DPA).",
  },
  security: {
    title: "Seguridad y privacidad",
    cards: [
      {
        title: "Servidores en la UE",
        text: "El servidor y la base de datos están en Ámsterdam; la extracción, con Mistral AI (Francia).",
      },
      { title: "RGPD y DPA", text: "Firmamos un DPA antes de que nos envíes ninguna factura." },
      {
        title: "Sin entrenar modelos",
        text: "No entrenamos modelos con tus facturas, y Mistral tampoco.",
      },
      { title: "Borrado cuando lo pidas", text: "Puedes borrar cualquier dato en cualquier momento." },
    ],
    more: "Detalles en la política de privacidad y el DPA",
  },
  faq: {
    title: "Preguntas frecuentes",
    items: [
      {
        q: "¿Qué formatos aceptáis?",
        a: "PDF y fotos (JPG, PNG, WebP), además de CSV y Excel. Las fotos HEIC del iPhone, todavía no.",
      },
      {
        q: "¿Con qué programa contable funciona?",
        a: "Hoy exportamos a CSV y Excel, que puede importar cualquier programa contable. Las integraciones directas llegarán más adelante.",
      },
      {
        q: "¿Qué pasa con el RGPD?",
        a: "Tú eres el responsable de los datos de tus clientes y nosotros el encargado del tratamiento. Firmamos un DPA antes de empezar, y los servidores están en la UE.",
      },
      {
        q: "¿Cuánto cuesta?",
        a: "El piloto es gratis. Los precios los acordamos contigo después.",
      },
      {
        q: "¿Y si se equivoca?",
        a: "Marca lo que no tiene claro para que lo revises, y nada sale hacia otros sistemas sin tu aprobación.",
      },
    ],
  },
  form: {
    title: "Solicitar piloto",
    intro: "Cuéntanos quién eres y te escribimos en 2 días laborables.",
    name: "Nombre",
    firm: "Gestoría",
    email: "Email",
    phone: "Teléfono (opcional)",
    volume: "¿Cuántas facturas al mes? (opcional)",
    volumeOptions: { "<100": "Menos de 100", "100-500": "100–500", "500+": "Más de 500" },
    message: "Mensaje (opcional)",
    privacyBefore: "He leído la ",
    privacyLink: "política de privacidad",
    privacyAfter: ".",
    submit: "Enviar solicitud",
    sending: "Enviando…",
    success: "¡Gracias! Te escribimos en 2 días laborables.",
    error: "No hemos podido enviar la solicitud. Inténtalo de nuevo o escríbenos a",
    orEmail: "¿Prefieres el email? Escríbenos a",
  },
  footer: {
    product: "Producto",
    legal: "Legal",
    developers: "Para desarrolladores",
    terms: "Términos del servicio",
    privacy: "Política de privacidad",
    dpa: "Acuerdo de tratamiento de datos",
    contact: "Contacto",
    github: "tidybridge en GitHub",
    tidycsv: "tidycsv en GitHub",
    openSource: "Código abierto",
  },
};

export type Copy = typeof es;

const en: Copy = {
  nav: {
    how: "How it works",
    security: "Security",
    faq: "FAQ",
    signIn: "Sign in",
    pilot: "Request a pilot",
    menu: "Menu",
    main: "Main",
    switchTo: "Español",
    switchShort: "ES",
    theme: { light: "Switch to light theme", dark: "Switch to dark theme" },
  },
  hero: {
    title: "Your clients' invoices, ready for your accounting software.",
    subtitle:
      "Upload PDFs or photos. We extract tax IDs, net amount, VAT and withholding, and flag anything doubtful for you to review. No typing.",
    cta: "Request a free pilot",
    secondary: "See how it works",
    demoLabel: "Example: an invoice and the data we extract from it",
  },
  problem: {
    title: "Every quarter, hundreds of invoices typed in by hand.",
    points: [
      "Hours copying tax IDs, net amounts and VAT from PDFs and photos.",
      "One mistyped digit and the tax return doesn't add up.",
      "And it all arrives at once, at quarter end.",
    ],
  },
  how: {
    title: "How it works",
    steps: [
      {
        title: "You send the invoices",
        text: "PDFs or phone photos, from one client or several.",
        alt: "tidybridge's upload screen with a processed file",
      },
      {
        title: "We extract and check",
        text: "Supplier, customer, tax IDs, dates, net amount, VAT and withholding. We check the tax ID's check digit, that the totals add up, and that no invoice appears twice.",
        alt: "Records table with the extracted invoices",
      },
      {
        title: "You review and export",
        text: "Review only what's flagged and export to CSV or Excel to import into your accounting software.",
        alt: "Exporting the records to CSV",
      },
    ],
  },
  samples: {
    title: "Try it with a sample invoice",
    intro: "Made-up invoices, already processed. Pick one and see what we extract.",
    tabs: "Sample invoices",
    extracted: "Extracted data",
    noIssues: "No issues",
  },
  control: {
    title: "The AI proposes. You approve.",
    intro:
      "Anything unclear is flagged, with the reason. Flagged records aren't sent to any system until you fix or approve them.",
    checks: [
      "A tax ID whose check digit doesn't match",
      "Net + VAT − withholding that doesn't give the total",
      "Hard-to-read data on the document",
      "The same invoice uploaded twice",
    ],
    alt: "Reviewing an invoice with a flagged issue",
  },
  pilot: {
    title: "The free pilot, step by step",
    steps: [
      { when: "Day 1", text: "You send us one client's invoices." },
      { when: "Within 2 working days", text: "We send them back reviewed, in a spreadsheet." },
      { when: "Then", text: "You decide whether to continue. No commitment." },
    ],
    dpa: "Before you send anything, we sign a data processing agreement (DPA).",
  },
  security: {
    title: "Security and privacy",
    cards: [
      {
        title: "Servers in the EU",
        text: "The server and its database are in Amsterdam; extraction runs on Mistral AI (France).",
      },
      { title: "GDPR and DPA", text: "We sign a DPA before you send us any invoice." },
      {
        title: "No model training",
        text: "We don't train models on your invoices, and neither does Mistral.",
      },
      { title: "Deletion on request", text: "You can delete any data at any time." },
    ],
    more: "Details in the privacy policy and the DPA",
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      {
        q: "Which formats do you accept?",
        a: "PDF and photos (JPG, PNG, WebP), plus CSV and Excel. iPhone HEIC photos, not yet.",
      },
      {
        q: "Which accounting software does it work with?",
        a: "Today we export to CSV and Excel, which any accounting software can import. Direct integrations will come later.",
      },
      {
        q: "What about GDPR?",
        a: "You're the controller of your clients' data and we're the processor. We sign a DPA before starting, and the servers are in the EU.",
      },
      {
        q: "How much does it cost?",
        a: "The pilot is free. We agree on prices with you afterwards.",
      },
      {
        q: "What if it gets something wrong?",
        a: "It flags what it isn't sure about for you to review, and nothing goes out to other systems without your approval.",
      },
    ],
  },
  form: {
    title: "Request a pilot",
    intro: "Tell us who you are and we'll write back within 2 working days.",
    name: "Name",
    firm: "Firm",
    email: "Email",
    phone: "Phone (optional)",
    volume: "How many invoices a month? (optional)",
    volumeOptions: { "<100": "Fewer than 100", "100-500": "100–500", "500+": "More than 500" },
    message: "Message (optional)",
    privacyBefore: "I've read the ",
    privacyLink: "privacy policy",
    privacyAfter: ".",
    submit: "Send request",
    sending: "Sending…",
    success: "Thank you! We'll write back within 2 working days.",
    error: "We couldn't send your request. Try again or write to",
    orEmail: "Prefer email? Write to",
  },
  footer: {
    product: "Product",
    legal: "Legal",
    developers: "For developers",
    terms: "Terms of service",
    privacy: "Privacy policy",
    dpa: "Data processing agreement",
    contact: "Contact",
    github: "tidybridge on GitHub",
    tidycsv: "tidycsv on GitHub",
    openSource: "Open source",
  },
};

export const COPY: Record<Lang, Copy> = { es, en };

export function useCopy(): Copy {
  return COPY[pageLang()];
}
