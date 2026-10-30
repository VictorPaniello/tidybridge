// Spanish (default) and English UI text. No library: two dictionaries and
// t(). A key ending in _one/_other is a plural pair - t("rows", { count })
// picks _one when count is 1. {name} placeholders are filled from vars.
// ponytail: language changes reload the page (setLang + reload) instead of
// a React context; add one if switching without a reload ever matters.

const es = {
  // layout
  skipToContent: "Saltar al contenido",
  uploadHistory: "Historial de subidas",
  accountSettings: "Ajustes de la cuenta",
  logOut: "Cerrar sesión",
  privacyPolicy: "Política de privacidad",
  terms: "Términos del servicio",
  dataProcessing: "Tratamiento de datos",
  hello: "Hola, {name}",
  // shared
  dismiss: "Cerrar",
  dismissError: "Cerrar el error",
  loading: "Cargando…",
  review: "Revisar",
  noRecordsYet: "Aún no hay registros. Sube un archivo para empezar.",
  cancel: "Cancelar",
  delete: "Eliminar",
  deleting: "Eliminando…",
  export: "Exportar",
  statusClean: "Correcto",
  statusNeedsReview: "Por revisar",
  statusApproved: "Aprobado",
  // records page
  records: "Registros",
  exportCsv: "Exportar CSV",
  exporting: "Exportando…",
  uploadFileOrInvoice: "Subir archivo o factura",
  uploadFile: "Subir archivo",
  uploading: "Subiendo…",
  uploadingNotice: "Limpiando e importando el archivo. Si es grande, puede tardar un poco.",
  mappingSaved: "Mapeo guardado.",
  noChanges: "Sin cambios.",
  rowsProcessed_one: "{count} fila procesada",
  rowsProcessed_other: "{count} filas procesadas",
  clean_one: "correcta",
  clean_other: "correctas",
  needReview_one: "por revisar",
  needReview_other: "por revisar",
  duplicatesSkipped_one: "duplicado omitido",
  duplicatesSkipped_other: "duplicados omitidos",
  alreadyImported_one: "ya importado",
  alreadyImported_other: "ya importados",
  viewHistory: "Ver historial",
  statTotal: "Total",
  statClean: "Correctos",
  statNeedsReview: "Por revisar",
  statApproved: "Aprobados",
  allUploads: "Todas las subidas",
  filterByUpload: "Filtrar por subida",
  uploads: "Subidas",
  seeAllUploads: "Ver todas en el historial →",
  searchRecords: "Buscar…",
  searchRecordsLabel: "Buscar registros",
  noMatches: "Ningún registro coincide con el filtro o la búsqueda.",
  selectAll: "Seleccionar todo",
  selectRecord: "Seleccionar registro {id}",
  status: "Estado",
  deleteCount: "Eliminar ({count})",
  deleteRecordTitle: "¿Eliminar este registro?",
  deleteRecordsTitle_one: "¿Eliminar {count} registro?",
  deleteRecordsTitle_other: "¿Eliminar {count} registros?",
  deleteRecordMessage: "Se eliminará el registro de forma permanente. No se puede deshacer.",
  deleteRecordMessageWebhooks:
    "Se eliminarán el registro y su historial de envíos por webhook de forma permanente. No se puede deshacer.",
  deleteRecordsMessage: "Se eliminarán los registros seleccionados de forma permanente. No se puede deshacer.",
  deleteRecordsMessageWebhooks:
    "Se eliminarán los registros seleccionados y su historial de envíos por webhook de forma permanente. No se puede deshacer.",
  loadRecordsFailed: "No se pudieron cargar los registros.",
  uploadFailed: "Error al subir el archivo.",
  exportFailed: "Error al exportar.",
  deleteRecordFailed: "No se pudo eliminar el registro.",
  deleteRecordsFailed: "No se pudieron eliminar los registros seleccionados.",
  newShape: "Formato nuevo: ¿revisas los campos que hemos detectado?",
  reviewMapping: "Revisar mapeo",
  // upload history
  uploadHistoryIntro: "Cada archivo que has subido y qué ha pasado con cada fila.",
  noUploadsYet: "Aún no hay subidas.",
  uploadAFile: "Sube un archivo",
  toStart: "para empezar.",
  colFile: "Archivo",
  colUploaded: "Subido",
  colTotalRows: "Filas",
  colClean: "Correctas",
  colNeedReview: "Por revisar",
  colDuplicates: "Duplicados",
  colAlreadyImported: "Ya importados",
  viewRecords: "Ver registros",
  loadUploadsFailed: "No se pudo cargar el historial de subidas.",
  exportUploadFailed: "No se pudieron exportar los registros de esta subida.",
  // record detail
  backToRecords: "← Volver a registros",
  unnamedRecord: "Registro sin nombre",
  edit: "Editar",
  saveChanges: "Guardar cambios",
  saving: "Guardando…",
  sourceFile: "Archivo de origen",
  imported: "Importado",
  issues: "Incidencias",
  heldForReview: "No se envía a ningún sistema hasta que corrijas estas incidencias o apruebes el registro tal cual.",
  approve: "Aprobar",
  approving: "Aprobando…",
  approvedOn: "Aprobado el {date}",
  recordNotFound: "Registro no encontrado.",
  loadRecordFailed: "No se pudo cargar el registro.",
  saveFailed: "No se pudieron guardar los cambios.",
  approveFailed: "No se pudo aprobar el registro.",
  webhookDeliveries: "Envíos por webhook",
  resendWebhook: "Reenviar webhook",
  resending: "Reenviando…",
  resendFailed: "No se pudo reenviar el webhook.",
  noWebhookYet: "No hay webhook configurado o aún no se ha intentado ningún envío para este registro.",
  copyWebhookUrl: "Copiar la URL del webhook",
  colAttempt: "Intento",
  colAttempted: "Fecha",
  colStatus: "Estado",
  colResult: "Resultado",
  delivered: "Entregado",
  failed: "Fallido",
  provisioning: "Aprovisionamiento",
  retryProvisioning: "Reintentar aprovisionamiento",
  retrying: "Reintentando…",
  retryProvisioningFailed: "No se pudo reintentar el aprovisionamiento.",
  provisionedAs: "Aprovisionado como {id} en el sistema de destino.",
  noProvisioningYet:
    "No hay sistema de destino configurado o aún no se ha intentado ningún aprovisionamiento para este registro.",
  provisioned: "Aprovisionado",
  alreadyExisted: "Ya existía",
  retryingAttempt: "Reintentando (intento {n})",
  deliveryPending: "Envío pendiente",
  provisioningPending: "Aprovisionamiento pendiente",
  awaitingReview: "Esperando revisión",
  deliveryFailedPermanently: "El envío ha fallado definitivamente",
  provisioningFailedPermanently: "El aprovisionamiento ha fallado definitivamente",
  // field labels (schema fields; custom CSV columns are humanized instead)
  field_supplier_name: "Proveedor",
  field_supplier_tax_id: "NIF proveedor",
  field_customer_name: "Cliente",
  field_customer_tax_id: "NIF cliente",
  field_invoice_number: "Nº factura",
  field_invoice_date: "Fecha",
  field_currency: "Moneda",
  field_net_amount: "Base imponible",
  field_vat_amount: "IVA",
  field_withholding_amount: "Retención IRPF",
  field_total_amount: "Total",
  field_full_name: "Nombre",
  field_email: "Email",
  field_signup_date: "Fecha de alta",
  field_amount: "Importe",
  field_phone: "Teléfono",
};

type Key = keyof typeof es;

const en: Record<Key, string> = {
  skipToContent: "Skip to content",
  uploadHistory: "Upload history",
  accountSettings: "Account settings",
  logOut: "Log out",
  privacyPolicy: "Privacy policy",
  terms: "Terms of service",
  dataProcessing: "Data processing",
  hello: "Hello, {name}",
  dismiss: "Dismiss",
  dismissError: "Dismiss error",
  loading: "Loading…",
  review: "Review",
  noRecordsYet: "No records yet. Upload a file to get started.",
  cancel: "Cancel",
  delete: "Delete",
  deleting: "Deleting…",
  export: "Export",
  statusClean: "Clean",
  statusNeedsReview: "Needs review",
  statusApproved: "Approved",
  records: "Records",
  exportCsv: "Export CSV",
  exporting: "Exporting…",
  uploadFileOrInvoice: "Upload file or invoice",
  uploadFile: "Upload file",
  uploading: "Uploading…",
  uploadingNotice: "Cleaning and importing your file - this can take a moment for larger uploads.",
  mappingSaved: "Mapping saved.",
  noChanges: "No changes.",
  rowsProcessed_one: "{count} row processed",
  rowsProcessed_other: "{count} rows processed",
  clean_one: "clean",
  clean_other: "clean",
  needReview_one: "needs review",
  needReview_other: "need review",
  duplicatesSkipped_one: "duplicate skipped",
  duplicatesSkipped_other: "duplicates skipped",
  alreadyImported_one: "already imported",
  alreadyImported_other: "already imported",
  viewHistory: "View full history",
  statTotal: "Total records",
  statClean: "Clean",
  statNeedsReview: "Needs review",
  statApproved: "Approved",
  allUploads: "All uploads",
  filterByUpload: "Filter by upload",
  uploads: "Uploads",
  seeAllUploads: "See every upload in Upload history →",
  searchRecords: "Search…",
  searchRecordsLabel: "Search records",
  noMatches: "No records match this filter/search.",
  selectAll: "Select all",
  selectRecord: "Select record {id}",
  status: "Status",
  deleteCount: "Delete ({count})",
  deleteRecordTitle: "Delete this record?",
  deleteRecordsTitle_one: "Delete {count} record?",
  deleteRecordsTitle_other: "Delete {count} records?",
  deleteRecordMessage: "This permanently deletes the record. This cannot be undone.",
  deleteRecordMessageWebhooks:
    "This permanently deletes the record and its webhook delivery history. This cannot be undone.",
  deleteRecordsMessage: "This permanently deletes the selected records. This cannot be undone.",
  deleteRecordsMessageWebhooks:
    "This permanently deletes the selected records and their webhook delivery history. This cannot be undone.",
  loadRecordsFailed: "Couldn't load records.",
  uploadFailed: "Upload failed.",
  exportFailed: "Export failed.",
  deleteRecordFailed: "Couldn't delete this record.",
  deleteRecordsFailed: "Couldn't delete the selected records.",
  newShape: "New format - check the fields we detected?",
  reviewMapping: "Review mapping",
  uploadHistoryIntro: "Every file you've uploaded and what happened to each row.",
  noUploadsYet: "No uploads yet.",
  uploadAFile: "Upload a file",
  toStart: "to start.",
  colFile: "File",
  colUploaded: "Uploaded",
  colTotalRows: "Total rows",
  colClean: "Clean",
  colNeedReview: "Need review",
  colDuplicates: "Duplicates",
  colAlreadyImported: "Already imported",
  viewRecords: "View records",
  loadUploadsFailed: "Couldn't load upload history.",
  exportUploadFailed: "Couldn't export this upload's records.",
  backToRecords: "← Back to records",
  unnamedRecord: "Unnamed record",
  edit: "Edit",
  saveChanges: "Save changes",
  saving: "Saving…",
  sourceFile: "Source file",
  imported: "Imported",
  issues: "Issues",
  heldForReview: "Not sent anywhere until you fix these or approve the record as is.",
  approve: "Approve",
  approving: "Approving…",
  approvedOn: "Approved on {date}",
  recordNotFound: "Record not found.",
  loadRecordFailed: "Couldn't load this record.",
  saveFailed: "Couldn't save these changes.",
  approveFailed: "Couldn't approve this record.",
  webhookDeliveries: "Webhook deliveries",
  resendWebhook: "Resend webhook",
  resending: "Resending…",
  resendFailed: "Couldn't resend the webhook.",
  noWebhookYet: "No webhook was configured, or none has been attempted for this record.",
  copyWebhookUrl: "Copy webhook URL",
  colAttempt: "Attempt",
  colAttempted: "Attempted",
  colStatus: "Status",
  colResult: "Result",
  delivered: "Delivered",
  failed: "Failed",
  provisioning: "Provisioning",
  retryProvisioning: "Retry provisioning",
  retrying: "Retrying…",
  retryProvisioningFailed: "Couldn't retry provisioning.",
  provisionedAs: "Provisioned as {id} on the target system.",
  noProvisioningYet: "No provisioning target was configured, or none has been attempted for this record.",
  provisioned: "Provisioned",
  alreadyExisted: "Already existed",
  retryingAttempt: "Retrying (attempt {n})",
  deliveryPending: "Delivery pending",
  provisioningPending: "Provisioning pending",
  awaitingReview: "Awaiting review",
  deliveryFailedPermanently: "Delivery failed permanently",
  provisioningFailedPermanently: "Provisioning failed permanently",
  field_supplier_name: "Supplier",
  field_supplier_tax_id: "Supplier tax ID",
  field_customer_name: "Customer",
  field_customer_tax_id: "Customer tax ID",
  field_invoice_number: "Invoice no.",
  field_invoice_date: "Date",
  field_currency: "Currency",
  field_net_amount: "Net",
  field_vat_amount: "VAT",
  field_withholding_amount: "Withholding",
  field_total_amount: "Total",
  field_full_name: "Name",
  field_email: "Email",
  field_signup_date: "Signup date",
  field_amount: "Amount",
  field_phone: "Phone",
};

export type Lang = "es" | "en";
const LANG_KEY = "tidybridge_lang";
const dictionaries: Record<Lang, Record<Key, string>> = { es, en };

function stored(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

let current: Lang = stored();

export function getLang(): Lang {
  return current;
}

/** Remembers the choice in this browser. Callers reload to re-render. */
export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // private mode / blocked storage: the choice just lasts this page load
  }
}

/** For toLocaleString() and friends: dates and numbers follow the UI language. */
export function locale(): string {
  return current === "es" ? "es-ES" : "en-GB";
}

type PluralBase<K> = K extends `${infer B}_one` ? B : never;
export type TKey = Key | PluralBase<Key>;

export function t(key: TKey, vars: Record<string, string | number> = {}): string {
  const dict = dictionaries[current];
  const plural = "count" in vars ? (`${key}_${vars.count === 1 ? "one" : "other"}` as Key) : null;
  const text = (plural && dict[plural]) ?? dict[key as Key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

/** The label for a schema field, or null for a custom column. */
export function fieldLabel(name: string): string | null {
  return dictionaries[current][`field_${name}` as Key] ?? null;
}
