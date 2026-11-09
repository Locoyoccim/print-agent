// Diseno de lo que se imprime. Recibe el payload que arma el sistema y devuelve bytes ESC/POS.
import { Ticket } from "./escpos.js";

// Columnas en fuente normal: 80 mm = 48, 58 mm = 32.
export const columnas = (ancho) => (Number(ancho) === 58 ? 32 : 48);

export function envolver(texto, ancho) {
  const lineas = [];
  for (const parrafo of String(texto ?? "").split("\n")) {
    let actual = "";
    for (let palabra of parrafo.split(/\s+/).filter(Boolean)) {
      while (palabra.length > ancho) {
        if (actual) {
          lineas.push(actual);
          actual = "";
        }
        lineas.push(palabra.slice(0, ancho));
        palabra = palabra.slice(ancho);
      }
      if (!actual) actual = palabra;
      else if (actual.length + 1 + palabra.length <= ancho) actual += ` ${palabra}`;
      else {
        lineas.push(actual);
        actual = palabra;
      }
    }
    if (actual || !parrafo) lineas.push(actual);
  }
  return lineas;
}

// Izquierda y derecha en la misma linea; si no caben, la izquierda se recorta.
export function dosColumnas(izq, der, ancho) {
  const d = String(der ?? "");
  const i = String(izq ?? "").slice(0, Math.max(0, ancho - d.length - 1));
  return i + " ".repeat(Math.max(1, ancho - i.length - d.length)) + d;
}

export const dinero = (n) => Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fechaHora(iso, zona = "America/Mexico_City") {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("es-MX", { timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(f)
      .map((p) => [p.type, p.value]),
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

const regla = (t, n, c = "-") => t.linea(c.repeat(n));

// Encabezado del ticket: nombre del negocio en grande y, si el negocio los capturo, direccion y telefono. Sin RFC: el ticket no es
// comprobante fiscal. El nombre se parte a media fila porque en doble ancho solo caben n/2 columnas (si no, la impresora lo corta).
function encabezadoNegocio(t, p, n) {
  t.alinear("centro").negrita(true).tamano(2, 2);
  for (const l of envolver(p.negocio ?? "", Math.floor(n / 2))) t.linea(l);
  t.tamano(1, 1).negrita(false);
  if (p.direccion) for (const l of envolver(p.direccion, n)) t.linea(l);
  if (p.telefono) t.linea(`Tel. ${p.telefono}`);
}

// Renglon de precuenta y ticket: cantidad y nombre a la izquierda, importe a la derecha. Si son varias piezas se aclara el precio de una
// (calculado del importe, que ya trae descuentos y opciones, para que siempre cuadre con lo que se cobra).
function renglonImporte(t, item, n) {
  const importe = item.cortesia ? "CORTESIA" : dinero(item.importe);
  const [primera, ...resto] = envolver(`${item.cantidad} ${item.nombre}`, n - importe.length - 1);
  t.linea(dosColumnas(primera ?? "", importe, n));
  for (const l of resto) t.linea(`  ${l}`);
  if (!item.cortesia && Number(item.cantidad) > 1) t.linea(`  ${item.cantidad} x ${dinero(Number(item.importe) / Number(item.cantidad))}`);
  for (const o of item.opciones ?? []) for (const l of envolver(o, n - 4)) t.linea(`   + ${l}`);
}

function cabeceraCuenta(t, p, n, zona) {
  const destino = p.mesa ?? `Llevar: ${p.llevar ?? ""}`;
  t.negrita(true).linea(dosColumnas(destino, `Folio ${p.folio}`, n)).negrita(false);
  // Nombre o referencia de la cuenta ("Fam. Hernandez"): en negrita para ubicar la mesa de un vistazo.
  if (p.cliente) for (const l of envolver(String(p.cliente), n)) t.negrita(true).linea(l).negrita(false);
  t.linea(dosColumnas(p.mesero ? `Mesero: ${p.mesero}` : "", p.personas ? `Pers: ${p.personas}` : "", n));
  t.linea(fechaHora(p.fecha, zona));
}

// Interlineado de la comanda: 26 puntos (~3.3 mm) contra ~4.2 mm de fabrica. Es lo mas junto que permite la fuente A (24 puntos de
// alto) sin que los renglones se toquen; los renglones de doble alto ocupan su propia altura.
export const INTERLINEADO_COMANDA = 26;

export function renderComanda(p, { ancho = 80, zona, pagina } = {}) {
  const n = columnas(ancho);
  const t = new Ticket({ pagina });
  t.interlineado(INTERLINEADO_COMANDA);
  t.alinear("centro").negrita(true).tamano(2, 2).linea(`COMANDA ${p.comanda}`).tamano(1, 1).linea(String(p.area ?? "").toUpperCase()).negrita(false);
  // Del 2.o tiempo en adelante se anuncia en grande: la cocina sabe que es lo que sigue de una mesa que ya empezo.
  if (p.tiempo > 1) t.negrita(true).tamano(2, 2).linea(`${p.tiempo}.o TIEMPO`).tamano(1, 1).negrita(false);
  t.alinear("izq");
  regla(t, n);
  // A la cocina le importa, antes que nada, a QUE mesa va: en grande. Folio, personas y mesero quedan en letra normal.
  t.alinear("centro").negrita(true).tamano(2, 2);
  for (const l of envolver(p.mesa ?? `Llevar: ${p.llevar ?? ""}`, Math.floor(n / 2))) t.linea(l);
  t.tamano(1, 1);
  if (p.cliente) for (const l of envolver(String(p.cliente), n)) t.linea(l);
  t.negrita(false).alinear("izq");
  t.linea(dosColumnas(`Folio ${p.folio}`, p.personas ? `Pers: ${p.personas}` : "", n));
  if (p.mesero) t.linea(`Mesero: ${p.mesero}`);
  t.linea(fechaHora(p.fecha, zona));
  regla(t, n);
  for (const item of p.items) {
    // Cantidad y nombre en doble ancho y alto para leerlos desde lejos: caben n/2 columnas, asi que el nombre se parte a esa medida.
    const cab = `${item.cantidad}  `;
    const lineas = envolver(item.nombre, Math.floor(n / 2) - cab.length);
    t.negrita(true).tamano(2, 2);
    lineas.forEach((l, i) => t.linea(i === 0 ? cab + l : " ".repeat(cab.length) + l));
    // Opciones, comensal y notas en doble alto (ancho normal, se parten al ancho del papel). Cada opcion en su linea ("+ Medio"):
    // es lo que la cocina mas necesita leer sin equivocarse.
    t.tamano(1, 2);
    for (const o of item.opciones ?? []) for (const l of envolver(o, n - 5)) t.linea(`  + ${l}`);
    if (item.comensal) t.linea(`  Comensal ${item.comensal}`);
    if (item.notas) for (const l of envolver(item.notas, n - 5)) t.linea(`  >> ${l}`);
    t.tamano(1, 1).negrita(false);
  }
  regla(t, n);
  return t.cortar().bytes();
}

export function renderPrecuenta(p, { ancho = 80, zona, pagina } = {}) {
  const n = columnas(ancho);
  const t = new Ticket({ pagina });
  encabezadoNegocio(t, p, n);
  // Todo el cuerpo (de "PRECUENTA" al total) va en doble alto para leerlo en la mesa; el doble alto no ensancha las letras, asi que
  // se conservan las n columnas. Direccion, telefono y la leyenda final quedan en tamano normal.
  t.tamano(1, 2).negrita(true).linea("PRECUENTA").negrita(false);
  t.alinear("izq");
  regla(t, n);
  cabeceraCuenta(t, p, n, zona);
  regla(t, n);
  for (const item of p.items) {
    renglonImporte(t, item, n);
    if (item.notas) for (const l of envolver(item.notas, n - 4)) t.linea(`   ${l}`);
  }
  regla(t, n);
  const { subtotal, descuento, total } = p.totales;
  t.linea(dosColumnas("Subtotal", dinero(subtotal), n));
  if (descuento > 0) t.linea(dosColumnas("Descuento", `-${dinero(descuento)}`, n));
  t.negrita(true).linea(dosColumnas("TOTAL", dinero(total), n)).tamano(1, 1).negrita(false);
  t.linea("");
  t.alinear("centro");
  for (const l of envolver("Precuenta: no es un comprobante de pago.", n)) t.linea(l);
  return t.cortar().bytes();
}

const METODO = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia" };

// Ticket de venta. El cajon se abre solo en la impresion original con efectivo; una copia lo evita.
export function renderTicket(p, { ancho = 80, zona, pagina, esCopia = false } = {}) {
  const n = columnas(ancho);
  const t = new Ticket({ pagina });
  if (p.abrir_cajon && !esCopia) t.abrirCajon();
  encabezadoNegocio(t, p, n);
  t.negrita(true).linea("TICKET DE VENTA");
  if (esCopia) t.linea("*** COPIA ***");
  t.negrita(false).alinear("izq");
  regla(t, n);
  cabeceraCuenta(t, p, n, zona);
  if (p.cajero) t.linea(`Cajero: ${p.cajero}`);
  regla(t, n);
  for (const item of p.items) renglonImporte(t, item, n);
  regla(t, n);
  const { subtotal, descuento, total } = p.totales;
  if (descuento > 0) {
    t.linea(dosColumnas("Subtotal", dinero(subtotal), n));
    t.linea(dosColumnas("Descuento", `-${dinero(descuento)}`, n));
  }
  t.negrita(true).tamano(1, 2).linea(dosColumnas("TOTAL", dinero(total), n)).tamano(1, 1).negrita(false);
  regla(t, n);
  for (const pago of p.pagos ?? []) {
    // Un pago sin monto (la tarjeta solo pago la propina) no lleva linea propia; su referencia sale junto a la propina, no bajo otro metodo.
    if (!(Number(pago.monto) > 0)) continue;
    t.linea(dosColumnas(METODO[pago.metodo] ?? pago.metodo, dinero(pago.monto), n));
    if (pago.recibido != null) t.linea(dosColumnas("  Recibido", dinero(pago.recibido), n));
    if (pago.referencia) t.linea(`  Ref: ${pago.referencia}`);
  }
  if (Number(p.propina) > 0) {
    const medios = [...new Set((p.pagos ?? []).filter((x) => Number(x.propina) > 0).map((x) => METODO[x.metodo] ?? x.metodo))].join(", ");
    t.linea(dosColumnas(`Propina (${medios})`, dinero(p.propina), n));
    for (const pago of p.pagos ?? []) if (!(Number(pago.monto) > 0) && pago.referencia) t.linea(`  Ref: ${pago.referencia}`);
  }
  if (Number(p.cambio) > 0) t.negrita(true).linea(dosColumnas("CAMBIO", dinero(p.cambio), n)).negrita(false);
  t.linea("");
  t.alinear("centro");
  t.negrita(true).linea("Gracias por su visita").negrita(false);
  for (const l of envolver("Este ticket no es un comprobante fiscal.", n)) t.linea(l);
  return t.cortar().bytes();
}

const signo = (n) => `${n < 0 ? "-" : n > 0 ? "+" : ""}${dinero(Math.abs(n))}`;

// Corte de caja. Abierto es un corte parcial (sin conteo); cerrado trae contado y diferencia.
export function renderCorte(p, { ancho = 80, zona, pagina } = {}) {
  const n = columnas(ancho);
  const t = new Ticket({ pagina });
  const cerrado = p.contado !== null && p.contado !== undefined;
  encabezadoNegocio(t, p, n);
  t.negrita(true).linea(cerrado ? "CORTE DE CAJA" : "CORTE PARCIAL (caja abierta)").negrita(false);
  t.alinear("izq");
  regla(t, n);
  t.linea(dosColumnas(`Turno ${p.turno}`, `Dia ${String(p.fecha_negocio ?? "").slice(0, 10)}`, n));
  t.linea(`Cajero: ${p.cajero ?? ""}`);
  t.linea(`Abrio:  ${fechaHora(p.abierto_at, zona)}`);
  if (p.cerrado_at) t.linea(`Cerro:  ${fechaHora(p.cerrado_at, zona)}`);
  regla(t, n);
  t.negrita(true).linea("VENTAS (sin propina)").negrita(false);
  for (const m of p.por_metodo ?? []) {
    const etiqueta = METODO[m.metodo] ?? m.metodo;
    t.linea(dosColumnas(`${etiqueta}${m.cuentas ? ` (${m.cuentas})` : ""}`, dinero(m.monto), n));
  }
  t.negrita(true).linea(dosColumnas("TOTAL VENTAS", dinero(p.ventas), n)).negrita(false);
  regla(t, n);
  t.negrita(true).linea("PROPINAS").negrita(false);
  for (const m of (p.por_metodo ?? []).filter((x) => Number(x.propina) > 0)) t.linea(dosColumnas(METODO[m.metodo] ?? m.metodo, dinero(m.propina), n));
  t.linea(dosColumnas("Total propinas", dinero(p.propinas), n));
  if (Number(p.propinas_entregadas) > 0) t.linea(dosColumnas("Entregadas en efectivo", dinero(p.propinas_entregadas), n));
  regla(t, n);
  t.negrita(true).linea("EFECTIVO EN CAJA").negrita(false);
  t.linea(dosColumnas("Fondo inicial", dinero(p.fondo), n));
  if (Number(p.devoluciones_efectivo) > 0) t.linea(dosColumnas("Devoluciones (anulaciones)", `-${dinero(p.devoluciones_efectivo)}`, n));
  t.linea(dosColumnas("Esperado", dinero(p.efectivo_esperado), n));
  if (cerrado) {
    t.linea(dosColumnas("Contado", dinero(p.contado), n));
    const d = Number(p.diferencia);
    t.negrita(true).linea(dosColumnas(d === 0 ? "DIFERENCIA" : d > 0 ? "SOBRANTE" : "FALTANTE", signo(d), n)).negrita(false);
    // Corte cerrado reimpreso con correcciones de pago posteriores: las cifras ya van ajustadas y se aclara el cierre original.
    if (p.ajuste) {
      const o = Number(p.ajuste.diferencia_original);
      const original = o === 0 ? "cuadraba" : `${o > 0 ? "sobrante" : "faltante"} ${dinero(Math.abs(o))}`;
      const n_ = Number(p.ajuste.correcciones);
      for (const l of envolver(`Cifras con ${n_} correccion${n_ === 1 ? "" : "es"} de pago posterior${n_ === 1 ? "" : "es"} al cierre. Al cerrar: esperado ${dinero(p.ajuste.esperado_original)}, ${original}.`, n)) t.linea(l);
    }
  }
  if (p.nota) for (const l of envolver(`Nota: ${p.nota}`, n)) t.linea(l);
  regla(t, n);
  t.linea(`Impreso: ${fechaHora(p.impreso_at, zona)}`);
  if (cerrado) {
    t.linea("").linea("").linea("Firma cajero: " + "_".repeat(Math.max(8, n - 15)));
  }
  return t.cortar().bytes();
}

export function renderPrueba(p, { ancho = 80, zona, pagina } = {}) {
  const n = columnas(ancho);
  const t = new Ticket({ pagina });
  t.alinear("centro").negrita(true).tamano(2, 2).linea("PRUEBA").tamano(1, 1).negrita(false);
  encabezadoNegocio(t, p, n);
  t.linea(`Impresora: ${p.impresora ?? ""}`).linea(fechaHora(p.fecha, zona));
  regla(t, n);
  t.linea("Acentos: á é í ó ú ñ Ñ ü ¿ ¡").linea("Moneda: $ 1,234.50 €");
  regla(t, n, "=");
  for (const l of envolver("Si lees esto con acentos correctos, la impresora esta lista.", n)) t.linea(l);
  return t.cortar().bytes();
}

const RENDERS = { COMANDA: renderComanda, PRECUENTA: renderPrecuenta, TICKET: renderTicket, CORTE: renderCorte, PRUEBA: renderPrueba };

export function render(job, opciones = {}) {
  const fn = RENDERS[job.tipo];
  if (!fn) throw new Error(`Tipo de impresion no soportado: ${job.tipo}`);
  // Una reimpresion manual (reimpresiones > 0) sale marcada como copia y sin pulso al cajon.
  return fn(job.payload, { ancho: job.impresora?.ancho ?? 80, esCopia: (job.reimpresiones ?? 0) > 0, ...opciones });
}
