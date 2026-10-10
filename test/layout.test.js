import test from "node:test";
import assert from "node:assert/strict";
import { columnas, dinero, dosColumnas, envolver, fechaHora, render } from "../src/layout.js";

const texto = (bytes) => bytes.toString("latin1");

test("layout: 80 mm son 48 columnas y 58 mm son 32", () => {
  assert.equal(columnas(80), 48);
  assert.equal(columnas(58), 32);
  assert.equal(columnas(undefined), 48);
});

test("layout: envolver respeta el ancho, corta palabras largas y conserva saltos", () => {
  assert.deepEqual(envolver("sin cebolla y sin chile extra picante", 16), ["sin cebolla y", "sin chile extra", "picante"]);
  assert.deepEqual(envolver("Supercalifragilistico", 8), ["Supercal", "ifragili", "stico"]);
  assert.deepEqual(envolver("a\nb", 10), ["a", "b"]);
  assert.deepEqual(envolver("", 10), [""]);
});

test("layout: dosColumnas alinea a la derecha y recorta la izquierda si no cabe", () => {
  assert.equal(dosColumnas("Mesa 4", "Folio 12", 20), `Mesa 4${" ".repeat(6)}Folio 12`);
  assert.equal(dosColumnas("Una descripcion muy larga", "$ 99.00", 20).length, 20);
  assert.equal(dosColumnas("x", "y", 3), "x y");
});

test("layout: dinero con miles y dos decimales; fecha en la zona del negocio", () => {
  assert.equal(dinero(1234.5), "1,234.50");
  assert.equal(dinero(0), "0.00");
  // 03 oct 2026 20:35 UTC = 14:35 en Ciudad de Mexico (UTC-6 sin horario de verano)
  assert.equal(fechaHora("2026-10-03T20:35:00.000Z", "America/Mexico_City"), "03/10/2026 14:35");
  assert.equal(fechaHora("no es fecha"), "");
});

const comanda = {
  tipo: "COMANDA",
  payload: {
    tipo: "COMANDA", negocio: "Café Aroma", area: "Barra", folio: 12, comanda: 2, mesa: "Mesa 4", llevar: null, personas: 3, mesero: "Ana",
    fecha: "2026-10-03T20:35:00.000Z",
    items: [{ cantidad: 2, nombre: "Latte", notas: "sin azúcar" }, { cantidad: 1, nombre: "Matcha Latte con leche de almendra extra caliente", notas: null }],
  },
  impresora: { ancho: 80 },
};

test("layout: la comanda trae area, mesa, mesero, notas y ningun precio", () => {
  const t = texto(render(comanda, { zona: "America/Mexico_City" }));
  assert.match(t, /COMANDA 2/);
  assert.match(t, /BARRA/);
  assert.match(t, /Mesa 4\s+Folio 12/);
  assert.match(t, /Mesero: Ana\s+Pers: 3/);
  assert.match(t, /03\/10\/2026 14:35/);
  assert.match(t, /2  Latte/);
  assert.match(t, />> sin az\xa3car/, "la u con acento sale como 0xA3 en CP858");
  assert.doesNotMatch(t, /\$|\d+\.\d{2}/);
});

test("layout: la comanda imprime opciones, comensal y el encabezado del 2.o tiempo; sin ellos todo sale como antes", () => {
  const con = (extra, items) => ({ ...comanda, payload: { ...comanda.payload, ...extra, ...(items ? { items } : {}) } });
  const items = [{ cantidad: 1, nombre: "Baguette", notas: "sin cebolla", opciones: ["Medio", "Extra queso"], comensal: 2 }];
  const t = texto(render(con({ tiempo: 2 }, items), { zona: "America/Mexico_City" }));
  assert.match(t, /2\.o TIEMPO/);
  assert.match(t, /1  Baguette\n[^\n]*\+ Medio\n[^\n]*\+ Extra queso\n[^\n]*Comensal 2\n[^\n]*>> sin cebolla/, "opciones, comensal y notas, en ese orden");
  const primero = texto(render(con({ tiempo: 1 }, items), { zona: "America/Mexico_City" }));
  assert.doesNotMatch(primero, /TIEMPO/, "el primer tiempo no se anuncia");
  const viejo = texto(render(comanda, { zona: "America/Mexico_City" }));
  assert.doesNotMatch(viejo, /TIEMPO|Comensal|\+ /, "un payload anterior (sin esos datos) imprime igual que siempre");
  // En 58 mm una opcion larga se parte en lineas sin pasar del ancho.
  const angosto = texto(render({ ...con({ tiempo: 2 }, [{ cantidad: 1, nombre: "Baguette", opciones: ["Sin jitomate ni cebolla morada con aderezo aparte"] }]), impresora: { ancho: 58 } }));
  assert.ok(angosto.split("\n").every((l) => l.replace(/[\x00-\x1f]/g, "").length <= 32 + 4));
});

test("layout: la precuenta y el ticket listan las opciones de cada renglon", () => {
  for (const def of [precuenta, ticket]) {
    const items = def.payload.items.map((i, k) => (k === 0 ? { ...i, opciones: ["Medio", "Extra queso"] } : i));
    const t = texto(render({ ...def, payload: { ...def.payload, items } }, { zona: "America/Mexico_City" }));
    assert.match(t, /\+ Medio\n[^\n]*\+ Extra queso/, def.tipo);
    assert.doesNotMatch(texto(render(def, { zona: "America/Mexico_City" })), /\+ Medio/);
  }
});

test("layout: el nombre de la cuenta sale en negrita en comanda, precuenta y ticket; sin nombre no hay linea", () => {
  const con = (def, extra) => ({ ...def, payload: { ...def.payload, ...extra } });
  const cliente = "Fam. Hernández";
  for (const def of [comanda, precuenta, ticket]) {
    const t = texto(render(con(def, { cliente }), { zona: "America/Mexico_City" }));
    assert.match(t, /Fam\. Hern\xa0ndez/, `${def.tipo}: la a con acento sale como 0xA0 en CP858`);
    assert.match(t, /Fam\. Hern\xa0ndez[\s\S]*Mesero: Ana/, `${def.tipo}: va antes de mesero y personas`);
    const sin = texto(render(def, { zona: "America/Mexico_City" }));
    assert.doesNotMatch(sin, /Hern/);
  }
  // Un nombre largo se parte en lineas en vez de cortarse en el papel de 58 mm.
  const largo = texto(render(con({ ...comanda, impresora: { ancho: 58 } }, { cliente: "Familia Hernandez Gutierrez de la Fuente y amigos" })));
  assert.match(largo, /Familia Hernandez Gutierrez de\n[^\n]*la Fuente y amigos/);
  assert.ok(largo.split("\n").every((l) => l.replace(/[\x00-\x1f]/g, "").length <= 32 + 4), "ninguna linea pasa del ancho");
});

test("layout: la comanda termina con avance y corte; no abre el cajon", () => {
  const b = render(comanda);
  assert.deepEqual([...b.subarray(b.length - 7)], [0x1b, 0x64, 3, 0x1d, 0x56, 0x42, 0x00]);
  assert.equal(b.includes(Buffer.from([0x1b, 0x70])), false);
});

test("layout: en 58 mm ninguna linea de texto pasa de 32 columnas", () => {
  const b = render({ ...comanda, impresora: { ancho: 58 } });
  for (const linea of texto(b).split("\n")) {
    const visible = linea.replace(/[\x00-\x1f]\S?\S?\S?/g, "");
    assert.ok(visible.length <= 40, `linea demasiado larga: ${JSON.stringify(visible)}`);
  }
  assert.match(texto(b), /-{32}/);
  assert.doesNotMatch(texto(b), /-{33}/);
});

const precuenta = {
  tipo: "PRECUENTA",
  payload: {
    tipo: "PRECUENTA", negocio: "Café Aroma", folio: 7, mesa: "Mesa 2", llevar: null, personas: 2, mesero: "Ana", fecha: "2026-10-03T20:35:00.000Z",
    items: [
      { cantidad: 2, nombre: "Latte", notas: null, precio: 55, importe: 110, cortesia: false },
      { cantidad: 1, nombre: "Baguette", notas: "sin jitomate", precio: 120, importe: 120, cortesia: false },
      { cantidad: 1, nombre: "Postre", notas: null, precio: 80, importe: 0, cortesia: true },
    ],
    totales: { subtotal: 310, descuento: 80, iva: 31.72, total: 230 },
  },
  impresora: { ancho: 80 },
};

test("layout: la precuenta muestra importes, cortesia, descuento, total e IVA incluido", () => {
  const t = texto(render(precuenta));
  assert.match(t, /PRECUENTA/);
  assert.match(t, /2 Latte\s+110\.00/);
  assert.match(t, /1 Baguette\s+120\.00/);
  assert.match(t, /1 Postre\s+CORTESIA/);
  assert.match(t, /Subtotal\s+310\.00/);
  assert.match(t, /Descuento\s+-80\.00/);
  assert.match(t, /TOTAL\s+230\.00/);
  assert.match(t, /IVA incluido en el total\s+31\.72/);
  assert.match(t, /no es un comprobante de pago/);
});

test("layout: la precuenta sin descuento no imprime la linea de descuento", () => {
  const p = { ...precuenta, payload: { ...precuenta.payload, totales: { subtotal: 230, descuento: 0, iva: 0, total: 230 } } };
  const t = texto(render(p));
  assert.doesNotMatch(t, /Descuento/);
  assert.doesNotMatch(t, /IVA incluido/);
});

test("layout: precuenta de una cuenta para llevar muestra el nombre del cliente", () => {
  const p = { ...precuenta, payload: { ...precuenta.payload, mesa: null, llevar: "Luis" } };
  assert.match(texto(render(p)), /Llevar: Luis\s+Folio 7/);
});

test("layout: la hoja de prueba incluye acentos para validar la pagina de codigos", () => {
  const b = render({ tipo: "PRUEBA", payload: { tipo: "PRUEBA", negocio: "Café Aroma", impresora: "Barra", fecha: "2026-10-03T20:35:00.000Z" }, impresora: {} });
  assert.ok(b.includes(Buffer.from([0xa0, 0x20, 0x82, 0x20, 0xa1, 0x20, 0xa2, 0x20, 0xa3, 0x20, 0xa4])), "á é í ó ú ñ");
});

test("layout: un tipo desconocido falla con un mensaje claro", () => {
  assert.throws(() => render({ tipo: "OTRO", payload: {} }), /no soportado/);
});

const ticket = {
  tipo: "TICKET",
  payload: {
    tipo: "TICKET", negocio: "Café Aroma", folio: 12, mesa: "Mesa 4", personas: 2, mesero: "Ana", cajero: "Luis", fecha: "2026-10-03T20:35:00.000Z",
    items: [{ cantidad: 2, nombre: "Latte", notas: null, precio: 55, importe: 110, cortesia: false }, { cantidad: 1, nombre: "Baguette", notas: null, precio: 120, importe: 120, cortesia: false }],
    totales: { subtotal: 230, descuento: 0, iva: 31.72, total: 230 },
    pagos: [
      { metodo: "TARJETA", monto: 130, propina: 20, recibido: null, cambio: null, referencia: "AUT-9" },
      { metodo: "EFECTIVO", monto: 100, propina: 0, recibido: 200, cambio: 100, referencia: null },
    ],
    propina: 20, cambio: 100, abrir_cajon: true,
  },
  impresora: { ancho: 80 },
};
// ESC p 0 25 250: pulso al cajon de dinero.
const PULSO = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

test("layout: el ticket muestra total, pagos por metodo, propina y cambio", () => {
  const t = texto(render(ticket));
  assert.match(t, /TICKET DE VENTA/);
  assert.match(t, /Mesa 4\s+Folio 12/);
  assert.match(t, /Cajero: Luis/);
  assert.match(t, /2 Latte\s+110\.00/);
  assert.match(t, /TOTAL\s+230\.00/);
  assert.match(t, /Tarjeta\s+130\.00/);
  assert.match(t, /Ref: AUT-9/);
  assert.match(t, /Efectivo\s+100\.00/);
  assert.match(t, /Recibido\s+200\.00/);
  assert.match(t, /Propina \(Tarjeta\)\s+20\.00/);
  assert.match(t, /CAMBIO\s+100\.00/);
  assert.match(t, /no es un comprobante fiscal/);
  assert.doesNotMatch(t, /COPIA/);
});

test("layout: el ticket original con efectivo abre el cajon; la copia no", () => {
  assert.ok(render(ticket).includes(PULSO), "original con efectivo");
  const copia = render({ ...ticket, reimpresiones: 1 });
  assert.ok(!copia.includes(PULSO), "la copia no abre el cajon");
  assert.match(texto(copia), /\*\*\* COPIA \*\*\*/);
  const soloTarjeta = render({ ...ticket, payload: { ...ticket.payload, abrir_cajon: false, pagos: [ticket.payload.pagos[0]], cambio: 0 } });
  assert.ok(!soloTarjeta.includes(PULSO), "sin efectivo no hay pulso");
  assert.doesNotMatch(texto(soloTarjeta), /CAMBIO|Recibido/);
});

test("layout: el ticket de 58 mm se ajusta a 32 columnas", () => {
  const t = texto(render({ ...ticket, impresora: { ancho: 58 } }));
  assert.match(t, /-{32}/);
  assert.doesNotMatch(t, /-{33}/);
  // Los importes quedan alineados al borde derecho (32 columnas).
  assert.match(t, /TOTAL {17,}230\.00/);
  assert.match(t, /Tarjeta {10,}130\.00/);
});

const corte = {
  tipo: "CORTE",
  payload: {
    tipo: "CORTE", negocio: "Café Aroma", turno: 7, cajero: "Luis", fecha_negocio: "2026-10-03", abierto_at: "2026-10-03T15:00:00.000Z", cerrado_at: "2026-10-04T03:00:00.000Z", impreso_at: "2026-10-04T03:01:00.000Z",
    fondo: 500,
    por_metodo: [{ metodo: "EFECTIVO", cuentas: 2, monto: 300, propina: 20 }, { metodo: "TARJETA", cuentas: 1, monto: 250.5, propina: 40 }, { metodo: "TRANSFERENCIA", cuentas: 0, monto: 0, propina: 0 }],
    ventas: 550.5, propinas: 60, propinas_entregadas: 30, efectivo_esperado: 790, contado: 780, diferencia: -10, nota: "Faltaron 10",
  },
  impresora: { ancho: 80 },
};

test("layout: el corte cerrado muestra ventas, propinas aparte, esperado, contado y faltante", () => {
  const t = texto(render(corte));
  assert.match(t, /CORTE DE CAJA/);
  assert.match(t, /Turno 7\s+Dia 2026-10-03/);
  assert.match(t, /Efectivo \(2\)\s+300\.00/);
  assert.match(t, /Tarjeta \(1\)\s+250\.50/);
  assert.match(t, /TOTAL VENTAS\s+550\.50/);
  assert.match(t, /Total propinas\s+60\.00/);
  assert.match(t, /Entregadas en efectivo\s+30\.00/);
  assert.match(t, /Fondo inicial\s+500\.00/);
  assert.match(t, /Esperado\s+790\.00/);
  assert.match(t, /Contado\s+780\.00/);
  assert.match(t, /FALTANTE\s+-10\.00/);
  assert.match(t, /Nota: Faltaron 10/);
  assert.match(t, /Firma cajero/);
});

test("layout: el corte parcial (caja abierta) no trae contado ni firma; un sobrante se rotula", () => {
  const parcial = texto(render({ ...corte, payload: { ...corte.payload, contado: null, diferencia: null, cerrado_at: null, nota: null } }));
  assert.match(parcial, /CORTE PARCIAL/);
  assert.doesNotMatch(parcial, /Contado|FALTANTE|Firma/);
  const sobra = texto(render({ ...corte, payload: { ...corte.payload, contado: 800, diferencia: 10 } }));
  assert.match(sobra, /SOBRANTE\s+\+10\.00/);
});

test("layout: el corte de 58 mm se ajusta a 32 columnas", () => {
  const t = texto(render({ ...corte, impresora: { ancho: 58 } }));
  assert.match(t, /-{32}/);
  assert.doesNotMatch(t, /-{33}/);
  assert.match(t, /TOTAL VENTAS {10,}550\.50/);
});

test("layout: el corte muestra las devoluciones en efectivo por anulaciones solo si las hubo", () => {
  assert.doesNotMatch(texto(render(corte)), /Devoluciones/);
  const t = texto(render({ ...corte, payload: { ...corte.payload, devoluciones_efectivo: 80 } }));
  assert.match(t, /Devoluciones \(anulaciones\)\s+-80\.00/);
});

test("layout: un corte cerrado reimpreso con correcciones posteriores aclara como se habia cerrado", () => {
  const base = {
    tipo: "CORTE", negocio: "Café Aroma", turno: 6, cajero: "Luis", fecha_negocio: "2026-10-03", abierto_at: "2026-10-03T14:00:00.000Z", cerrado_at: "2026-10-04T02:00:00.000Z",
    impreso_at: "2026-10-04T15:00:00.000Z", fondo: 500, por_metodo: [{ metodo: "EFECTIVO", cuentas: 0, monto: 0, propina: 0 }, { metodo: "TARJETA", cuentas: 4, monto: 405, propina: 0 }, { metodo: "TRANSFERENCIA", cuentas: 0, monto: 0, propina: 0 }],
    ventas: 405, propinas: 0, propinas_entregadas: 0, devoluciones_efectivo: 0, efectivo_esperado: 500, contado: 500, diferencia: 0, nota: null
  };
  const con = texto(render({ tipo: "CORTE", payload: { ...base, ajuste: { correcciones: 2, esperado_original: 620, diferencia_original: -120 } }, impresora: { ancho: 80 } }));
  assert.match(con, /CUADRA|DIFERENCIA/);
  assert.match(con, /2 correcciones de pago posteriores al\s+cierre/);
  assert.match(con, /esperado 620\.00, faltante\s+120\.00/);
  const sin = texto(render({ tipo: "CORTE", payload: { ...base, ajuste: null }, impresora: { ancho: 80 } }));
  assert.doesNotMatch(sin, /correccion/);
});

