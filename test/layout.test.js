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
  assert.match(t, /Mesa 4/);
  assert.match(t, /Folio 12\s+Pers: 3/);
  assert.match(t, /Mesero: Ana/);
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

test("layout: la precuenta muestra importes, cortesia, descuento y total, sin desglose de IVA", () => {
  const t = texto(render(precuenta));
  assert.match(t, /PRECUENTA/);
  assert.match(t, /2 Latte\s+110\.00/);
  assert.match(t, /1 Baguette\s+120\.00/);
  assert.match(t, /1 Postre\s+CORTESIA/);
  assert.match(t, /Subtotal\s+310\.00/);
  assert.match(t, /Descuento\s+-80\.00/);
  assert.match(t, /TOTAL\s+230\.00/);
  assert.doesNotMatch(t, /IVA/, "el IVA no se desglosa en el ticket");
  assert.match(t, /no es un comprobante de pago/);
});

test("layout: la precuenta sin descuento no imprime la linea de descuento", () => {
  const p = { ...precuenta, payload: { ...precuenta.payload, totales: { subtotal: 230, descuento: 0, iva: 0, total: 230 } } };
  const t = texto(render(p));
  assert.doesNotMatch(t, /Descuento/);
  assert.doesNotMatch(t, /IVA/);
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

test("layout: tarjeta de credito y de debito; usa la etiqueta del servidor y, sin ella, su propia lista", () => {
  const conPagos = (pagos, por_metodo) => ({ ...ticket, payload: { ...ticket.payload, pagos, abrir_cajon: false, cambio: 0, propina: 0, por_metodo } });
  // CP858: los acentos van en un byte que latin1 no lee como «é»; basta con ver el resto de la palabra.
  const t = texto(render(conPagos([
    { metodo: "TARJETA_CREDITO", etiqueta: "Tarjeta de crédito", monto: 130, propina: 0, referencia: null },
    { metodo: "TARJETA_DEBITO", monto: 100, propina: 0, referencia: null },
  ])));
  assert.match(t, /Tarjeta de cr.dito\s+130\.00/);
  assert.match(t, /Tarjeta de d.bito\s+100\.00/, "un servidor anterior no manda etiqueta: sale de la lista del agente");
  assert.doesNotMatch(t, /TARJETA_/);
  const textoCorte = texto(render({
    ...corte,
    payload: { ...corte.payload, por_metodo: [{ metodo: "TARJETA", etiqueta: "Tarjeta (sin especificar)", cuentas: 1, monto: 80, propina: 0 }] },
  }));
  assert.match(textoCorte, /Tarjeta \(sin especificar\) \(1\)\s+80\.00/);
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


// ---- encabezado del negocio, sin IVA, precio por pieza, comanda con la mesa en grande, referencia de la propina ----
const GRANDE = Buffer.from([0x1d, 0x21, 0x11]); // GS ! 0x11 = doble ancho y doble alto
const conNegocio = (def, extra) => ({ ...def, payload: { ...def.payload, ...extra } });
const DATOS = { negocio: "Café Aroma", direccion: "Av. Juárez 123, Col. Centro, Guadalajara", telefono: "33 1234 5678" };

test("layout: precuenta, ticket y corte llevan nombre, direccion y telefono; sin ellos solo el nombre", () => {
  const corte = {
    tipo: "CORTE", impresora: { ancho: 80 },
    payload: { tipo: "CORTE", negocio: "Café Aroma", turno: 3, cajero: "Luis", fecha_negocio: "2026-10-03", abierto_at: "2026-10-03T14:00:00.000Z", cerrado_at: null, impreso_at: "2026-10-03T20:35:00.000Z", fondo: 500, por_metodo: [], ventas: 0, propinas: 0, propinas_entregadas: 0, efectivo_esperado: 500, contado: null, diferencia: null },
  };
  for (const def of [precuenta, ticket, corte]) {
    const t = texto(render(conNegocio(def, DATOS)));
    assert.match(t, /Caf\x82 Aroma/, `${def.tipo}: nombre`);
    assert.match(t, /Av\. Ju\xa0rez 123, Col\. Centro, Guadalajara/, `${def.tipo}: direccion`);
    assert.match(t, /Tel\. 33 1234 5678/, `${def.tipo}: telefono`);
    assert.doesNotMatch(t, /RFC/i, `${def.tipo}: el RFC no se imprime`);
    const sin = texto(render(def));
    assert.doesNotMatch(sin, /Tel\.|Av\./, `${def.tipo}: sin datos solo el nombre`);
  }
});

test("layout: solo el telefono o solo la direccion tambien se imprimen (cada dato es opcional)", () => {
  assert.match(texto(render(conNegocio(ticket, { telefono: "555 000" }))), /Tel\. 555 000/);
  const soloDir = texto(render(conNegocio(ticket, { direccion: "Calle 5 #10" })));
  assert.match(soloDir, /Calle 5 #10/);
  assert.doesNotMatch(soloDir, /Tel\./);
});

test("layout: en 58 mm el nombre se parte a 16 columnas (doble ancho) y la direccion a 32", () => {
  const def = { ...conNegocio(ticket, { negocio: "Cafetería y Restaurante Aroma del Centro", direccion: "Avenida Benito Juárez 1234 interior 5, Colonia Americana, Guadalajara" }), impresora: { ancho: 58 } };
  const t = texto(render(def));
  // Cada linea exacta (CP858: i con acento = 0xA1, u con acento = 0xA3 no aplica aqui; a con acento = 0xA0).
  for (const linea of ["Cafeter\xa1a y", "Restaurante", "Aroma del Centro"]) {
    assert.ok(t.includes(`${linea}\n`), `nombre: ${JSON.stringify(linea)}`);
    assert.ok(linea.length <= 16, "cabe en 16 columnas de doble ancho");
  }
  for (const linea of ["Avenida Benito Ju\xa0rez 1234", "interior 5, Colonia Americana,", "Guadalajara"]) {
    assert.ok(t.includes(`${linea}\n`), `direccion: ${JSON.stringify(linea)}`);
    assert.ok(linea.length <= 32, "cabe en 32 columnas");
  }
});

test("layout: el nombre del negocio sale en doble tamano", () => {
  const b = render(ticket);
  const i = b.indexOf(Buffer.from("Caf"));
  assert.ok(i > 0 && b.subarray(Math.max(0, i - 12), i).includes(GRANDE), "doble ancho y alto antes del nombre");
});

test("layout: el ticket y la precuenta no desglosan el IVA aunque el payload lo traiga", () => {
  for (const def of [precuenta, ticket]) {
    const t = texto(render(conNegocio(def, { totales: { subtotal: 230, descuento: 0, iva: 31.72, total: 230 } })));
    assert.doesNotMatch(t, /IVA/, def.tipo);
    assert.doesNotMatch(t, /31\.72/, def.tipo);
  }
});

test("layout: varias piezas aclaran el precio de una; una pieza o cortesia no", () => {
  for (const def of [precuenta, ticket]) {
    const t = texto(render(def));
    assert.match(t, /2 Latte\s+110\.00\n\s+2 x 55\.00/, `${def.tipo}: 2 x 55.00 bajo el renglon`);
    assert.doesNotMatch(t, /1 x /, `${def.tipo}: una pieza no lleva la aclaracion`);
  }
  const cortesia = texto(render(conNegocio(precuenta, { items: [{ cantidad: 3, nombre: "Postre", notas: null, precio: 80, importe: 0, cortesia: true }] })));
  assert.doesNotMatch(cortesia, / x /);
});

test("layout: la referencia de una tarjeta que solo pago la propina sale junto a la propina, no bajo el efectivo", () => {
  const pagos = [
    { metodo: "EFECTIVO", monto: 230, propina: 0, recibido: 300, cambio: 70, referencia: null },
    { metodo: "TARJETA", monto: 0, propina: 40, recibido: null, cambio: null, referencia: "4821" },
  ];
  const t = texto(render(conNegocio(ticket, { pagos, propina: 40, cambio: 70 })));
  assert.match(t, /Efectivo\s+230\.00\n\s+Recibido\s+300\.00\nPropina \(Tarjeta\)\s+40\.00\n\s+Ref: 4821/);
  assert.doesNotMatch(t, /Efectivo[^\n]*\n[^\n]*Ref: 4821/, "la referencia no queda bajo el efectivo");
});

test("layout: la comanda pone la mesa y los platillos en grande; el nombre se parte a media fila", () => {
  const b = render(comanda);
  const i = b.indexOf(Buffer.from("Mesa 4"));
  assert.ok(i > 0 && b.subarray(Math.max(0, i - 12), i).includes(GRANDE), "la mesa va en doble ancho y alto");
  const j = b.indexOf(Buffer.from("1  Matcha"));
  assert.ok(j > 0 && b.subarray(Math.max(0, j - 12), j).includes(GRANDE), "el platillo va en doble ancho y alto");
  // En doble ancho caben 24 columnas en 80 mm: cantidad + nombre se parten a esa medida, con sangria bajo la cantidad.
  assert.match(texto(b), /1  Matcha Latte con\n {3}leche de almendra\n {3}extra caliente\n/);
  const llevar = texto(render({ ...comanda, payload: { ...comanda.payload, mesa: null, llevar: "Luis" } }));
  assert.match(llevar, /Llevar: Luis/);
});

test("layout: la hoja de prueba lleva el encabezado completo del negocio", () => {
  const t = texto(render({ tipo: "PRUEBA", payload: { tipo: "PRUEBA", ...DATOS, impresora: "Barra", fecha: "2026-10-03T20:35:00.000Z" }, impresora: {} }));
  assert.match(t, /Tel\. 33 1234 5678/);
  assert.match(t, /Impresora: Barra/);
});

// ---- comanda con interlineado compacto y detalle en grande; precuenta en doble alto ----
const ALTO = Buffer.from([0x1d, 0x21, 0x01]); // GS ! 0x01 = doble alto, ancho normal
const antes = (b, txt, cmd) => {
  const i = b.indexOf(Buffer.from(txt, "latin1"));
  return i > 0 && b.subarray(Math.max(0, i - 12), i).includes(cmd);
};

test("layout: la comanda fija el interlineado en 26 puntos justo despues de iniciar", () => {
  const b = render(comanda);
  assert.deepEqual([...b.subarray(5, 8)], [0x1b, 0x33, 26], "ESC 3 26 tras ESC @ y la pagina de codigos");
  for (const def of [precuenta, ticket]) assert.equal(render(def).includes(Buffer.from([0x1b, 0x33])), false, `${def.tipo}: interlineado de fabrica`);
});

test("layout: opciones, comensal y notas de la comanda van en doble alto y negrita", () => {
  const items = [{ cantidad: 1, nombre: "Baguette", notas: "sin cebolla", opciones: ["Medio"], comensal: 2 }];
  const b = render({ ...comanda, payload: { ...comanda.payload, items } });
  assert.ok(antes(b, "  + Medio", ALTO), "opcion en doble alto");
  const t = texto(b);
  assert.match(t, /\+ Medio\n {2}Comensal 2\n {2}>> sin cebolla\n/, "comensal y notas siguen en doble alto");
  // Al cerrar el platillo regresa a tamano normal y sin negrita, para que la regla final salga como siempre.
  assert.match(t, /\x1d!\x00\x1bE\x00-{48}\n\x1bd/);
});

test("layout: la precuenta va en doble alto de PRECUENTA al total; el encabezado y la leyenda no", () => {
  const b = render(conNegocio(precuenta, DATOS));
  assert.ok(antes(b, "PRECUENTA", ALTO), "titulo en doble alto");
  const t = texto(b);
  const cuerpo = t.slice(t.indexOf("PRECUENTA"), t.indexOf("Precuenta: no es"));
  assert.equal(cuerpo.slice(0, cuerpo.indexOf("TOTAL")).includes("\x1d!\x00"), false, "nada regresa a tamano normal antes del total");
  assert.match(cuerpo, /2 Latte\s+110\.00\n\s+2 x 55\.00/, "las columnas se conservan (doble alto no ensancha)");
  assert.match(cuerpo, /TOTAL\s+230\.00\n\x1d!\x00/, "tras el total vuelve a tamano normal");
  assert.equal(antes(b, "Tel. 33", ALTO), false, "el telefono sigue en tamano normal");
  assert.ok(t.split("\n").every((l) => l.replace(/[\x00-\x1f][^\x00-\x1f\n]{0,2}/g, "").length <= 48 + 3));
});

// ---- textos largos: nada se recorta y las opciones partidas no parecen varias ----
test("layout: dosColumnasCompleto no recorta; si no cabe, la derecha baja a su propia linea", async () => {
  const { dosColumnasCompleto } = await import("../src/layout.js");
  assert.deepEqual(dosColumnasCompleto("Mesa 4", "Folio 12", 20), [`Mesa 4${" ".repeat(6)}Folio 12`]);
  assert.deepEqual(dosColumnasCompleto("Terraza exterior mesa 12", "Folio 99", 20), ["Terraza exterior", "mesa 12", `${" ".repeat(12)}Folio 99`]);
  assert.deepEqual(dosColumnasCompleto("Mesero: Ana", "", 20), [`Mesero: Ana${" ".repeat(9)}`], "sin derecha queda como dosColumnas");
});

test("layout: una mesa o un mesero largos salen completos en precuenta y ticket (58 mm)", () => {
  for (const def of [precuenta, ticket]) {
    const largo = { ...def, impresora: { ancho: 58 }, payload: { ...def.payload, mesa: "Terraza exterior mesa 12 junto a la fuente", mesero: "María Fernanda de los Ángeles" } };
    const t = texto(render(largo));
    assert.match(t, /Terraza exterior mesa 12 junto a\nla fuente\n {20,25}Folio \d+\n/, `${def.tipo}: mesa completa y folio abajo`);
    assert.equal(t.match(/\n( +Folio \d+)\n/)[1].length, 32, `${def.tipo}: el folio queda alineado a la derecha`);
    assert.match(t, /Mesero: Mar\xa1a Fernanda de los\n\xb5ngeles\n {25}Pers: 2\n/, `${def.tipo}: mesero completo`);
  }
});

test("layout: una opcion o nota larga se parte con sangria, sin repetir el + ni el >>, y no pasa del papel", () => {
  const opcion = "Sin cebolla, sin cilantro y con la salsa verde aparte";
  const pre = texto(render({ ...precuenta, impresora: { ancho: 58 }, payload: { ...precuenta.payload, items: [{ ...precuenta.payload.items[0], opciones: [opcion] }] } }));
  assert.match(pre, / {3}\+ Sin cebolla, sin cilantro y\n {5}con la salsa verde aparte\n/);
  const com = texto(render({ ...comanda, payload: { ...comanda.payload, items: [{ cantidad: 1, nombre: "Taco", opciones: [opcion], notas: "Bien dorado y con tortillas de maiz hechas a mano" }] } }));
  assert.match(com, / {2}\+ Sin cebolla, sin cilantro y con la salsa\n {4}verde aparte\n/);
  assert.match(com, / {2}>> Bien dorado y con tortillas de maiz hechas\n {5}a mano\n/);
  assert.equal((pre + com).split("+").length - 1, 2, "un solo + por opcion");
  // Una palabra mas ancha que el papel se corta sin pasar del ancho.
  const enorme = texto(render({ ...precuenta, payload: { ...precuenta.payload, items: [{ ...precuenta.payload.items[0], opciones: ["x".repeat(60)] }] } }));
  for (const l of enorme.split("\n").filter((x) => x.includes("xxx"))) assert.ok(l.replace(/[\x00-\x1f]../g, "").length <= 48, l);
});
