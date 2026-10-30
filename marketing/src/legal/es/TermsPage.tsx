import { LegalSection as Section } from "../LegalSection";

// Spanish translation of ../TermsPage.tsx: same sections, same terms, same
// links. Change both together. Pending review by a Spanish lawyer.
export function TermsPageEs() {
  return (
    <div className="max-w-2xl space-y-8 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Términos del servicio</h1>
        <p className="text-muted-foreground">Última actualización: octubre de 2026</p>
      </div>

      <Section title="Qué es">
        <p>
          tidybridge es un servicio de importación de datos para profesionales: usted sube un
          archivo CSV/Excel con datos de clientes, o facturas de proveedor en PDF o imagen (cuando
          la extracción de facturas está activada), y el servicio los limpia, los valida, marca lo
          que parece incorrecto, los guarda y permite exportarlos. Los registros marcados siguen
          marcados hasta que usted los corrija o los apruebe tal cual.
        </p>
        <p className="mt-2">
          Lo gestiona un desarrollador individual (Victor Paniello), no una empresa, y funciona
          como una única instancia sin garantía de disponibilidad ni acuerdo de nivel de servicio;
          el README del proyecto recoge la lista completa y honesta de lo que aún no hace (sin
          escalado horizontal, sin conmutación por error, limitación de peticiones en memoria). Al
          usarlo, usted acepta esa contrapartida.
        </p>
        <p className="mt-2">
          El servicio está pensado para su uso en su empresa o profesión. Nada de lo aquí
          dispuesto limita los derechos que usted tenga como consumidor según el Derecho de la UE,
          cuando sean aplicables.
        </p>
      </Section>

      <Section title="Su cuenta">
        <ul className="list-disc pl-5 space-y-1">
          <li>Debe facilitar información exacta al registrarse (o al completar su perfil tras iniciar sesión con GitHub).</li>
          <li>Es responsable de mantener la confidencialidad de su contraseña y de la actividad de su cuenta.</li>
          <li>Una cuenta por persona; no comparta sus credenciales.</li>
        </ul>
      </Section>

      <Section title="Los datos que usted sube sobre sus propios clientes">
        <p>
          Solo puede subir datos que tenga derecho legítimo a tratar y compartir: los datos de sus
          propios clientes, con una base jurídica que ya tenga con ellos (un contrato, su
          consentimiento u otra base válida). Usted es el responsable del tratamiento de todo lo
          que sube; tidybridge actúa solo como su encargado, siguiendo sus instrucciones. La{" "}
          <a href="/privacy" className="text-ring hover:underline">
            Política de privacidad
          </a>{" "}
          explica qué significa esto en la práctica.
        </p>
        <p className="mt-2">
          No suba datos que no tenga derecho a compartir: la lista de clientes de otra persona
          obtenida sin autorización, datos obtenidos de forma ilícita, o categorías especiales de
          datos (salud, biométricos, etc.) que este servicio no está preparado para tratar de forma
          segura.
        </p>
        <p className="mt-2">
          El{" "}
          <a href="/dpa" className="text-ring hover:underline">
            Acuerdo de tratamiento de datos
          </a>{" "}
          forma parte de estos términos desde el momento en que usted sube datos de otras
          personas, y establece cómo los trata tidybridge como su encargado.
        </p>
      </Section>

      <Section title="Revisar los resultados le corresponde a usted">
        <p>
          Las marcas de validación y la extracción de facturas le ayudan a detectar problemas,
          pero pueden pasar algo por alto o leer mal un documento. Usted es responsable de revisar
          los datos antes de basarse en ellos, por ejemplo en su contabilidad o en sus
          declaraciones fiscales. Aprobar un registro marcado significa que usted lo ha comprobado.
        </p>
      </Section>

      <Section title="tidybridge no es un archivo">
        <p>
          Los datos subidos se borran automáticamente al cabo de un año. La normativa española
          exige conservar las facturas entre cuatro y seis años: consérvelas en su programa
          contable o en sus propios archivos, no en tidybridge.
        </p>
      </Section>

      <Section title="Uso aceptable">
        <p>No use tidybridge para:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Atacar o sobrecargar el servicio, o intentar acceder sin autorización a él o a otras cuentas.</li>
          <li>Subir archivos maliciosos, o datos destinados a explotar el proceso de importación.</li>
          <li>Infringir cualquier ley aplicable, o los derechos de las personas cuyos datos sube.</li>
        </ul>
        <p className="mt-2">
          Se aplican límites razonables al registro y al inicio de sesión en concreto (5 intentos
          por minuto) para evitar abusos; la sección de seguridad del README describe el mecanismo
          exacto.
        </p>
      </Section>

      <Section title="Borrar sus datos">
        <p>
          Puede borrar un registro de cliente concreto en cualquier momento desde la lista de
          registros, y su cuenta entera (junto con todos los registros de clientes, entradas del
          historial de subidas y envíos por webhook que le pertenecen) desde{" "}
          <a href="https://app.tidybridge.dev/settings" className="text-ring hover:underline">
            Ajustes de la cuenta
          </a>
          . Es un borrado real y permanente, no una desactivación: una vez confirmado no se puede
          deshacer, y tidybridge no puede recuperarlo después.
        </p>
      </Section>

      <Section title="Sin garantía">
        <p>
          tidybridge se ofrece «tal cual», sin garantía de ningún tipo, expresa o implícita,
          incluidas la comerciabilidad o la idoneidad para un fin concreto. Es un proyecto de un
          solo ingeniero, no un producto comercial respaldado por un equipo de soporte; el README
          recoge la lista explícita y actual de lo que (aún) no hace.
        </p>
      </Section>

      <Section title="Limitación de responsabilidad">
        <p>
          En la máxima medida permitida por la ley, Victor Paniello no responde de daños
          indirectos, incidentales o consecuentes derivados del uso (o de la imposibilidad de uso)
          de este servicio, incluida la pérdida de datos más allá de las medidas de copia de
          seguridad descritas en el README. Nada de lo aquí dispuesto limita la responsabilidad
          cuando la ley no permite limitarla (por ejemplo, en caso de negligencia grave o dolo).
        </p>
      </Section>

      <Section title="Terminación">
        <p>
          Puede dejar de usar el servicio y borrar su cuenta en cualquier momento. El acceso puede
          suspenderse o cancelarse por incumplir estos términos (por ejemplo, abuso o subida de
          datos ilícitos), con aviso previo cuando sea razonablemente posible.
        </p>
      </Section>

      <Section title="Cambios en estos términos">
        <p>
          Si estos términos cambian de forma relevante, la fecha de «Última actualización» de
          arriba cambiará con ellos. Seguir usando el servicio tras un cambio supone aceptar los
          términos actualizados.
        </p>
      </Section>

      <Section title="Ley aplicable">
        <p>
          Estos términos se rigen por la legislación española. Cualquier controversia que no se
          resuelva de manera informal se someterá a los juzgados y tribunales de Barcelona
          (España), sin perjuicio de los derechos imperativos de protección de los consumidores que
          pueda tener en su país de residencia según el Derecho de la UE.
        </p>
      </Section>

      <Section title="Contacto">
        <p>
          <a className="text-ring hover:underline" href="mailto:hello@tidybridge.dev">hello@tidybridge.dev</a>
        </p>
      </Section>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border">
        Redactado por el desarrollador como una descripción de buena fe y precisa de este servicio
        concreto; no sustituye al asesoramiento jurídico independiente sobre su propio uso.
      </p>
    </div>
  );
}
