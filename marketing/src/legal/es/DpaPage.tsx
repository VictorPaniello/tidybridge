import { LegalSection as Section } from "../LegalSection";

const linkClass = "text-ring hover:underline";

// Spanish translation of ../DpaPage.tsx (GDPR art. 28 processor terms): same
// sections, same commitments, same links. Change both together. Pending
// review by a Spanish lawyer.
export function DpaPageEs() {
  return (
    <div className="max-w-2xl space-y-8 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Acuerdo de tratamiento de datos</h1>
        <p className="text-muted-foreground">Última actualización: octubre de 2026</p>
      </div>

      <p>
        Este acuerdo cubre los datos personales que usted sube a tidybridge sobre sus propios
        clientes y proveedores. Forma parte de los{" "}
        <a href="/terms" className={linkClass}>
          Términos del servicio
        </a>{" "}
        y se aplica automáticamente en cuanto usted sube esos datos, tal como exige el artículo 28
        del RGPD. Si necesita una copia firmada para sus archivos, escriba a{" "}
        <a className={linkClass} href="mailto:hello@tidybridge.dev">hello@tidybridge.dev</a>.
      </p>

      <Section title="1. Quién es quién">
        <p>
          <strong>Usted</strong> (el titular de la cuenta, por ejemplo una gestoría o un despacho
          contable) es el <strong>responsable del tratamiento</strong> de los datos de clientes y
          facturas que sube. <strong>tidybridge</strong>, gestionado por Victor Paniello
          (Barcelona, España), es su <strong>encargado del tratamiento</strong>: trata esos datos
          únicamente para prestarle el servicio.
        </p>
        <p className="mt-2">
          Los datos de su propia cuenta (su correo, nombre, contraseña) son otra cuestión: respecto
          a ellos, tidybridge es el responsable, tal como describe la{" "}
          <a href="/privacy" className={linkClass}>
            Política de privacidad
          </a>
          .
        </p>
      </Section>

      <Section title="2. Qué se trata">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Finalidad y naturaleza:</strong> limpiar, validar, marcar, guardar y exportar
            los archivos que usted sube, y leer los campos de las facturas en PDF e imagen (cuando
            la extracción de facturas está activada). El servicio alojado no reenvía sus datos a
            ningún webhook ni a otro sistema.
          </li>
          <li>
            <strong>Tipos de datos:</strong> nombres, direcciones de correo, teléfonos, fechas,
            importes y, de las facturas: nombres y NIF/CIF del proveedor y del cliente, números de
            factura, fechas e importes.
          </li>
          <li>
            <strong>De quién son los datos:</strong> de sus clientes y proveedores.
          </li>
          <li>
            <strong>Duración:</strong> mientras usted use el servicio, dentro de los límites de
            conservación del apartado 9.
          </li>
          <li>
            <strong>No permitido:</strong> categorías especiales de datos (salud, biométricos y
            similares). El servicio no está preparado para ellas y los Términos prohíben subirlas.
          </li>
        </ul>
      </Section>

      <Section title="3. Sus instrucciones">
        <p>
          tidybridge trata estos datos únicamente siguiendo sus instrucciones documentadas: usar el
          servicio tal como usted lo configura es esa instrucción. No usará sus datos para ningún
          fin propio: ni analítica, ni marketing, ni venta, ni entrenamiento de modelos de IA. La
          única excepción requiere su permiso expreso por escrito: conservar determinadas facturas
          para comprobar con qué precisión las lee la extracción. Puede retirar ese permiso en
          cualquier momento, y esas facturas se borran entonces. Si una instrucción parece
          infringir la normativa de protección de datos, tidybridge se lo comunicará.
        </p>
      </Section>

      <Section title="4. Confidencialidad">
        <p>
          Solo Victor Paniello tiene acceso a los sistemas que contienen sus datos. Cualquier
          persona a la que se dé acceso en el futuro quedará obligada antes a la confidencialidad.
        </p>
      </Section>

      <Section title="5. Medidas de seguridad">
        <p>Las medidas que existen hoy (artículo 32 del RGPD):</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Los datos se alojan en la UE (Ámsterdam, Países Bajos).</li>
          <li>Todo el tráfico va cifrado en tránsito (HTTPS/TLS, con HSTS).</li>
          <li>
            Cada registro está vinculado a la cuenta que lo subió, y cada petición comprueba que
            pertenece a la cuenta que lo solicita.
          </li>
          <li>Las contraseñas solo se guardan como hashes unidireccionales.</li>
          <li>Las sesiones se pueden revocar; cerrar sesión invalida la sesión en el servidor.</li>
          <li>Limitación de peticiones en el inicio de sesión, el registro y las subidas, y un tamaño máximo de subida.</li>
          <li>
            La aplicación se conecta a la base de datos con un rol de privilegios mínimos, no como
            propietaria de la base de datos.
          </li>
          <li>Copias de seguridad diarias de la base de datos, conservadas 30 días, para la recuperación ante desastres.</li>
        </ul>
      </Section>

      <Section title="6. Subencargados">
        <p>Usted autoriza a tidybridge a usar estos subencargados para sus datos:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>Railway Corporation</strong> (empresa estadounidense): aloja la aplicación, la
            base de datos y las copias de seguridad en su región EU West (Ámsterdam). Las
            transferencias están cubiertas por las cláusulas contractuales tipo de la UE del{" "}
            <a className={linkClass} href="https://railway.com/legal/dpa" target="_blank" rel="noreferrer">
              DPA de Railway
            </a>
            .
          </li>
          <li>
            <strong>Mistral AI</strong> (Francia): solo si la extracción de facturas está activada,
            recibe las facturas en PDF e imagen que usted sube, para leer sus campos. Se tratan en
            su infraestructura de la UE, se conservan hasta 30 días para la supervisión de abusos y
            después se borran, y tidybridge ha excluido su uso para entrenamiento, conforme al{" "}
            <a className={linkClass} href="https://legal.mistral.ai/terms/data-processing-addendum" target="_blank" rel="noreferrer">
              DPA de Mistral
            </a>
            . Algunos de los proveedores de seguridad y de red de Mistral están fuera de la UE,
            cubiertos por las cláusulas contractuales tipo de la UE o por el Marco de Privacidad de
            Datos UE-EE. UU. (véase{" "}
            <a className={linkClass} href="https://trust.mistral.ai/subprocessors" target="_blank" rel="noreferrer">
              los subencargados de Mistral
            </a>
            ). Las subidas de CSV y Excel nunca se le envían.
          </li>
        </ul>
        <p className="mt-2">
          Cada subencargado está sujeto a condiciones de protección de datos al menos tan
          protectoras como estas. tidybridge le avisará por correo con al menos{" "}
          <strong>30 días</strong> de antelación antes de añadir o sustituir alguno. Si se opone,
          puede dejar de usar el servicio y borrar sus datos antes de que el cambio surta efecto.
        </p>
      </Section>

      <Section title="7. Ayudarle con sus obligaciones">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Solicitudes de las personas cuyos datos trata</strong> (acceso, rectificación,
            supresión): puede atender la mayoría usted mismo, editando, exportando o borrando
            registros en la aplicación. Para todo lo demás, tidybridge le ayudará.
          </li>
          <li>
            <strong>Brechas de seguridad:</strong> si una brecha de datos personales afecta a sus
            datos, tidybridge se lo comunicará sin dilación indebida y, cuando sea posible, en un
            plazo de <strong>48 horas</strong> desde que tenga conocimiento de ella, con lo que se
            sepa en ese momento, para que usted pueda cumplir su propio plazo de 72 horas ante la
            AEPD.
          </li>
          <li>
            <strong>Evaluaciones de impacto:</strong> tidybridge le facilitará la información sobre
            el servicio que necesite para realizarla.
          </li>
        </ul>
      </Section>

      <Section title="8. Auditorías">
        <p>
          tidybridge responderá a preguntas razonables sobre cómo se tratan sus datos y le
          facilitará la información que necesite para demostrar el cumplimiento. Si necesita una
          auditoría más allá de eso, puede organizarse con un preaviso razonable, a su cargo y sin
          exponer los datos de otros clientes.
        </p>
      </Section>

      <Section title="9. Conservación, borrado y facturas">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Los datos subidos se borran automáticamente un año después de su importación, o antes si
            usted los borra.
          </li>
          <li>
            Borrar su cuenta elimina de inmediato todos sus datos subidos. Exporte antes lo que
            necesite.
          </li>
          <li>Las copias de seguridad que aún contengan datos borrados caducan en un plazo de 30 días.</li>
          <li>
            <strong>tidybridge no es un archivo de facturas.</strong> La normativa española exige
            conservar las facturas entre cuatro y seis años. Esa obligación sigue siendo suya y de
            su programa contable, no de tidybridge.
          </li>
        </ul>
      </Section>

      <Section title="10. Adónde van sus datos">
        <p>
          Sus datos subidos se guardan y se tratan en la UE. Cuando la extracción de facturas está
          activada, los proveedores de seguridad y de red de Mistral AI situados fuera de la UE
          pueden tratar las facturas en tránsito, con las garantías del apartado 6.
        </p>
      </Section>

      <Section title="11. El piloto gratuito">
        <p>
          En el piloto gratuito, usted envía sus facturas a Victor en lugar de subirlas usted
          mismo, y él realiza el tratamiento por usted. Para el piloto:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            Este acuerdo se aplica desde que usted lo acepta, respondiendo al correo con el que se
            le envía, y <strong>antes</strong> de que envíe ninguna factura.
          </li>
          <li>
            Usted envía los archivos por correo. El proveedor de correo que los recibe se indica en
            ese mismo correo y actúa como subencargado adicional durante el piloto.
          </li>
          <li>
            Victor los sube a su propia cuenta de tidybridge (alojada en la UE, como se indica
            arriba), revisa los resultados y le devuelve una hoja de cálculo.
          </li>
          <li>
            Cuando usted confirma que la ha recibido, borra los registros de tidybridge y, en un
            plazo de 30 días, los archivos y sus correos de su buzón y sus dispositivos.
          </li>
        </ul>
      </Section>

      <Section title="12. Todo lo demás">
        <p>
          Este acuerdo dura mientras tidybridge trate sus datos. Si entra en conflicto con los
          Términos en materia de protección de datos, prevalece este acuerdo. Se rige por la
          legislación española, igual que los Términos.
        </p>
      </Section>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border">
        Adaptado de la plantilla pública CC0 de acuerdo de tratamiento de datos de General Legal y
        redactado para reflejar lo que este servicio hace realmente. No sustituye al asesoramiento
        jurídico independiente.
      </p>
    </div>
  );
}
