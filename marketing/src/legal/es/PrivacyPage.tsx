import { LegalSection as Section } from "../LegalSection";

// Spanish translation of ../PrivacyPage.tsx: same sections, same facts, same
// links. Change both together. Pending review by a Spanish lawyer.
export function PrivacyPageEs() {
  return (
    <div className="max-w-2xl space-y-8 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Política de privacidad</h1>
        <p className="text-muted-foreground">Última actualización: octubre de 2026</p>
      </div>

      <Section title="Responsable del tratamiento">
        <p>
          tidybridge es un proyecto independiente creado y gestionado por Victor Paniello, con
          sede en Barcelona (España). No existe una sociedad registrada aparte: Victor es el
          responsable del tratamiento (y, respecto a los datos de clientes que usted suba, su
          encargado del tratamiento; véase más abajo) de los datos personales tratados a través de
          este servicio.
        </p>
        <p>
          Contacto para cualquier cuestión de esta página, incluido el ejercicio de los derechos
          descritos más abajo:{" "}
          <a className="text-ring hover:underline" href="mailto:hello@tidybridge.dev">hello@tidybridge.dev</a>.
        </p>
      </Section>

      <Section title="Qué datos recoge este servicio y para qué">
        <p>Aquí hay dos tipos distintos de datos personales, y se tratan de forma distinta.</p>

        <h3 className="font-medium mt-4 mb-1">1. Los datos de su propia cuenta</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Dirección de correo electrónico (obligatoria): para identificar su cuenta e iniciar sesión.</li>
          <li>
            Nombre y apellidos (obligatorios al registrarse con correo y contraseña; el inicio de
            sesión con GitHub solo los aporta cuando usted completa su perfil): se le muestran en
            la aplicación.
          </li>
          <li>Número de teléfono (opcional): de momento no se usa para nada más que guardarlo en su perfil.</li>
          <li>
            Una contraseña cifrada mediante hash (solo en cuentas con correo y contraseña): su
            contraseña real nunca se guarda, solo un hash unidireccional de ella.
          </li>
          <li>
            Si inicia sesión con GitHub: el identificador de su cuenta de GitHub y el correo que
            GitHub indica para ella, además de un token OAuth de acceso/renovación, guardados para
            que el inicio de sesión vinculado siga funcionando.
          </li>
        </ul>
        <p className="mt-2">
          <strong>Base jurídica:</strong> la ejecución del contrato que usted celebra al crear una
          cuenta (art. 6.1.b RGPD). Incluye el inicio de sesión con GitHub, que es solo una de las
          formas de acceder a esa cuenta.
        </p>

        <h3 className="font-medium mt-4 mb-1">2. Los datos que usted sube sobre sus propios clientes</h3>
        <p>
          La finalidad principal de esta herramienta es permitirle subir una exportación CSV/Excel
          de sus propios clientes para limpiarla y guardarla. Esa exportación puede contener el
          nombre, el correo, el teléfono, la fecha de alta y un importe de sus clientes: datos
          personales reales de personas reales que nunca han interactuado directamente con
          tidybridge y no tienen cuenta aquí.
        </p>
        <p className="mt-2">
          También puede subir facturas de proveedor en PDF o imagen. Del documento se leen el
          nombre y el NIF del proveedor y del cliente (en el caso de una persona autónoma, es su
          número de identificación fiscal personal), el número de factura, la fecha y los
          importes, y se guardan de la misma manera.
        </p>
        <p className="mt-2">
          <strong>Respecto a estos datos, el responsable es usted, no tidybridge.</strong> Al subir
          un archivo, usted confirma que dispone de una base jurídica propia (un contrato con ese
          cliente, su consentimiento u otra base válida según la normativa aplicable) para tratar y
          compartir sus datos de esta forma. tidybridge actúa como su{" "}
          <strong>encargado del tratamiento</strong> solo para esta categoría: los guarda y, si
          usted configura un webhook, los reenvía en su nombre y siguiendo sus instrucciones. Las
          condiciones están en el{" "}
          <a href="/dpa" className="text-ring hover:underline">
            Acuerdo de tratamiento de datos
          </a>
          .
        </p>

        <h3 className="font-medium mt-4 mb-1">3. Datos técnicos</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Un token de sesión y su preferencia de tema claro/oscuro, guardados en el
            localStorage de su navegador: nunca se envían a tidybridge, salvo el propio token en
            las peticiones que usted hace.
          </li>
          <li>
            Una cookie, que solo se crea si usa «Iniciar sesión con GitHub»: un token CSRF propio y
            de corta duración necesario para completar ese inicio de sesión de forma segura. No se
            usa para seguimiento y no persiste más allá del proceso de inicio de sesión.
          </li>
        </ul>
        <p className="mt-2">
          Su dirección IP se usa, solo en memoria, para limitar el número de inicios de sesión,
          registros y subidas, y puede aparecer en los registros de peticiones del proveedor de
          alojamiento. Los registros del propio servidor anotan eventos como un restablecimiento
          de contraseña, que pueden incluir su correo; el proveedor de alojamiento conserva los
          registros durante un tiempo limitado. Las copias de seguridad de la base de datos se
          conservan 30 días. <strong>Base jurídica</strong> de todo ello: nuestro interés legítimo
          en mantener el servicio seguro y recuperable (art. 6.1.f RGPD).
        </p>
        <h3 className="font-medium mt-4 mb-1">4. Solicitudes de piloto</h3>
        <p>
          Si solicita un piloto gratuito mediante el formulario de tidybridge.dev, guardamos lo que
          nos envía: su nombre, el nombre de su gestoría o despacho, su correo y, de forma
          opcional, su teléfono, cuántas facturas gestiona al mes y un mensaje. Solo se usa para
          responder a su solicitud y organizar el piloto, y llega como correo a
          hello@tidybridge.dev. <strong>Base jurídica:</strong> la aplicación, a petición suya, de
          medidas precontractuales (art. 6.1.b RGPD). Se conserva <strong>12 meses</strong> y
          después se borra automáticamente, y puede pedir que se borre antes escribiendo a
          hello@tidybridge.dev.
        </p>

        <p className="mt-2">
          Nada de esto se usa para publicidad, analítica ni seguimiento: en este sitio no hay
          ningún script de analítica, píxel de seguimiento ni contenido incrustado de terceros del
          que darse de baja, porque no existe ninguno.
        </p>
      </Section>

      <Section title="Quién más ve sus datos">
        <p>Los servicios de los que depende este proyecto, cada uno solo para lo que se indica:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>GitHub</strong>: solo si elige «Iniciar sesión con GitHub»; véase{" "}
            <a
              className="text-ring hover:underline"
              href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement"
              target="_blank"
              rel="noreferrer"
            >
              la declaración de privacidad de GitHub
            </a>.
          </li>
          <li>
            <strong>Resend</strong>: envía el correo de «he olvidado la contraseña», si lo
            solicita, las respuestas enviadas desde hello@tidybridge.dev y el correo que hace llegar
            una solicitud de piloto a hello@tidybridge.dev. Esto significa que su correo y el
            enlace de restablecimiento pasan por los sistemas de Resend (con sede en Estados
            Unidos) para llegar a su bandeja de entrada. Véase{" "}
            <a
              className="text-ring hover:underline"
              href="https://resend.com/legal/privacy-policy"
              target="_blank"
              rel="noreferrer"
            >
              la política de privacidad de Resend
            </a>.
          </li>
          <li>
            <strong>Cloudflare</strong>: reenvía los correos que usted envía a hello@tidybridge.dev.
            Véase{" "}
            <a
              className="text-ring hover:underline"
              href="https://www.cloudflare.com/privacypolicy/"
              target="_blank"
              rel="noreferrer"
            >
              la política de privacidad de Cloudflare
            </a>.
          </li>
          <li>
            <strong>Mistral AI</strong>: solo cuando la extracción de facturas está activada: si
            sube una factura en PDF o imagen, el documento se envía a la API de Mistral AI
            (Francia, alojada en la UE) para leer sus campos. Mistral AI lo trata por cuenta de
            tidybridge como subencargado, lo conserva hasta 30 días para la supervisión de abusos y
            después lo borra, y tidybridge ha excluido su uso para entrenamiento. Algunos de los
            proveedores de seguridad y de red de Mistral AI están fuera de la UE, con las garantías
            indicadas en{" "}
            <a
              className="text-ring hover:underline"
              href="https://trust.mistral.ai/subprocessors"
              target="_blank"
              rel="noreferrer"
            >
              su lista de subencargados
            </a>
            . Las subidas de CSV y Excel nunca salen de los servidores de tidybridge. Véase{" "}
            <a
              className="text-ring hover:underline"
              href="https://legal.mistral.ai/terms/privacy-policy"
              target="_blank"
              rel="noreferrer"
            >
              la política de privacidad de Mistral AI
            </a>.
          </li>
          <li>
            <strong>Railway</strong>: aloja el backend, la base de datos y sus copias de
            seguridad, en la UE (Ámsterdam, Países Bajos).
          </li>
          <li>
            <strong>Vercel</strong>: sirve las páginas web de la aplicación a su navegador. Sus
            datos van directamente de su navegador al backend, no a través de Vercel.
          </li>
          <li>
            <strong>Una URL de webhook que configure usted mismo</strong> (solo en copias
            autoalojadas de tidybridge; el servicio alojado en tidybridge.dev no envía sus datos a
            ningún webhook): si está configurada, los datos de cada nuevo registro de cliente
            importado se envían allí. Es su propio destino, bajo su propio control, no un tercero
            gestionado por tidybridge.
          </li>
        </ul>
        <p className="mt-2">
          Nadie más. Sus datos no se venden, alquilan ni comparten con fines de marketing: no
          existe ningún programa de marketing con el que compartirlos.
        </p>
      </Section>

      <Section title="Dónde se guardan sus datos y transferencias fuera de la UE">
        <p>
          La base de datos, sus copias de seguridad y todo lo que usted sube se guardan en la UE,
          en la región de Ámsterdam de Railway.
        </p>
        <p className="mt-2">
          Varios de los proveedores anteriores son empresas estadounidenses, por lo que algunos
          datos personales pueden llegar a Estados Unidos. Cada transferencia está cubierta por una
          garantía reconocida por el RGPD (art. 45 o 46):
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            Certificación del <strong>Marco de Privacidad de Datos UE-EE. UU.</strong>: Vercel,
            Resend, Cloudflare, GitHub.
          </li>
          <li>
            <strong>Cláusulas contractuales tipo de la UE</strong> en sus acuerdos de tratamiento de
            datos: Railway (GitHub y Cloudflare también las tienen como respaldo).
          </li>
        </ul>
        <p className="mt-2">
          Escriba a{" "}
          <a className="text-ring hover:underline" href="mailto:hello@tidybridge.dev">hello@tidybridge.dev</a>{" "}
          para más detalles sobre cualquiera de ellas.
        </p>
      </Section>

      <Section title="Cuánto tiempo se conservan los datos">
        <p>
          <strong>Los datos de clientes</strong> (lo que usted sube sobre sus propios clientes) se
          conservan hasta <strong>un año</strong> desde su importación y después se borran
          automáticamente mediante una tarea programada. No es solo una declaración: es un proceso
          real, probado y programado que borra los datos de verdad; el README del proyecto
          explica el detalle técnico. También puede borrar usted mismo un registro de cliente en
          cualquier momento, antes de ese plazo, desde la lista de registros.
        </p>
        <p className="mt-2">
          <strong>Su propia cuenta</strong> (correo, nombre, teléfono, contraseña) es distinta: se
          conserva mientras usted quiera, sin caducidad automática, hasta que la borre usted mismo
          desde{" "}
          <a href="https://app.tidybridge.dev/settings" className="text-ring hover:underline">
            Ajustes de la cuenta
          </a>
          . Borrar la cuenta también elimina de inmediato todos los registros de clientes que le
          pertenecen, sin esperar al plazo de un año.
        </p>
        <p className="mt-2">
          <strong>Las solicitudes de piloto</strong> enviadas mediante el formulario de
          tidybridge.dev se conservan <strong>12 meses</strong> y después se borran
          automáticamente con la misma tarea programada.
        </p>
        <p className="mt-2">
          Las copias de seguridad de la base de datos se conservan aparte hasta 30 días, solo para
          la recuperación ante desastres (protección frente a una migración fallida o un borrado
          accidental, no un sustituto de esta política); el README del proyecto describe ese
          mecanismo.
        </p>
      </Section>

      <Section title="Sus derechos">
        <p>Según el RGPD, usted puede:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Acceder</strong> a los datos que se tienen sobre usted.</li>
          <li><strong>Rectificar</strong> datos inexactos: directamente en Ajustes de la cuenta para su propio perfil.</li>
          <li>
            <strong>Suprimir</strong> sus datos, por su cuenta y en el momento: borre registros de
            clientes concretos desde la lista de registros, o su cuenta entera desde Ajustes de la
            cuenta.
          </li>
          <li><strong>Exportar</strong> sus datos (portabilidad).</li>
          <li><strong>Oponerse al tratamiento o limitarlo</strong>.</li>
        </ul>
        <p className="mt-2">
          Para lo que no pueda hacer usted mismo en la aplicación, escriba a{" "}
          <a className="text-ring hover:underline" href="mailto:hello@tidybridge.dev">hello@tidybridge.dev</a>.
          Si no está satisfecho con la respuesta, puede presentar una reclamación ante la autoridad
          española de protección de datos, la{" "}
          <a
            className="text-ring hover:underline"
            href="https://www.aepd.es"
            target="_blank"
            rel="noreferrer"
          >
            Agencia Española de Protección de Datos (AEPD)
          </a>
          .
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          En este sitio existe una sola cookie: un token CSRF propio y de sesión, que solo se crea
          durante el proceso de «Iniciar sesión con GitHub» y es estrictamente necesario para que
          ese inicio de sesión se complete de forma segura. Según las orientaciones del RGPD y de
          la normativa ePrivacy, las cookies estrictamente necesarias no requieren un banner de
          consentimiento, solo información, que es esta. No hay cookies de analítica, publicidad
          ni seguimiento, y por tanto nada más para lo que pedir su consentimiento.
        </p>
      </Section>

      <Section title="Menores">
        <p>
          Este servicio no está dirigido a menores de 16 años ni es utilizado conscientemente por
          ellos. Es una herramienta para gestionar datos de clientes de empresas, no dirigida al
          público general.
        </p>
      </Section>

      <Section title="Cambios en esta política">
        <p>
          Si esta política cambia de forma relevante, la fecha de «Última actualización» de arriba
          cambiará con ella. Dado el tamaño del proyecto, los cambios serán ocasionales y de
          fondo, no una rotación rutinaria de textos legales.
        </p>
      </Section>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border">
        Esta política es una descripción de buena fe y técnicamente precisa de lo que hace este
        código concreto, redactada por su desarrollador; no sustituye al asesoramiento jurídico
        independiente sobre su propio uso del servicio.
      </p>
    </div>
  );
}
