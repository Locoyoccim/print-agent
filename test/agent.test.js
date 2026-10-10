import test from "node:test";
import assert from "node:assert/strict";
import { crearAgente } from "../src/agent.js";
import { ApiError, crearApi } from "../src/api.js";
import { validarConfig } from "../src/config.js";

const job = (id, extra = {}) => ({
  id, tipo: "COMANDA", impresora: { id: 1, nombre: "Barra", conexion: "RED", ip: "1.1.1.1", puerto: 9100, ancho: 80 },
  payload: { tipo: "COMANDA", area: "Barra", folio: 1, comanda: 1, mesa: "Mesa 1", personas: 1, fecha: "2026-10-03T20:00:00.000Z", items: [{ cantidad: 1, nombre: "Latte", notas: null }] },
  ...extra,
});

function entorno({ trabajos = [], falloResultado = 0, falloImpresion = null } = {}) {
  const e = { resultados: [], impresiones: [], logs: [], pendientesLlamadas: 0, restoFalloResultado: falloResultado };
  e.api = {
    pendientes: async () => {
      e.pendientesLlamadas++;
      return trabajos.splice(0);
    },
    resultado: async (id, ok, error) => {
      if (e.restoFalloResultado > 0) {
        e.restoFalloResultado--;
        throw new ApiError("sin red", 0);
      }
      e.resultados.push({ id, ok, error });
    },
  };
  e.transporte = async (impresora, bytes) => {
    if (falloImpresion) throw new Error(falloImpresion);
    e.impresiones.push({ impresora: impresora.nombre, bytes });
  };
  e.log = (nivel, msg) => e.logs.push([nivel, msg]);
  e.agente = crearAgente({ api: e.api, transporte: e.transporte, log: e.log, esperaResultadoMs: 1 });
  return e;
}

test("agente: imprime cada trabajo en su impresora y confirma OK", async () => {
  const e = entorno({ trabajos: [job(1), job(2, { impresora: { ...job(2).impresora, nombre: "Cocina" } })] });
  assert.equal(await e.agente.vuelta(), 2);
  assert.deepEqual(e.impresiones.map((i) => i.impresora), ["Barra", "Cocina"]);
  assert.ok(e.impresiones.every((i) => i.bytes.length > 20 && i.bytes[0] === 0x1b));
  assert.deepEqual(e.resultados, [{ id: 1, ok: true, error: undefined }, { id: 2, ok: true, error: undefined }]);
});

test("agente: si la impresora falla, reporta el error al servidor y sigue con el siguiente", async () => {
  const e = entorno({ trabajos: [job(1)], falloImpresion: "No se pudo conectar con 1.1.1.1:9100 (ECONNREFUSED)" });
  await e.agente.vuelta();
  assert.deepEqual(e.resultados, [{ id: 1, ok: false, error: "No se pudo conectar con 1.1.1.1:9100 (ECONNREFUSED)" }]);
  assert.ok(e.logs.some(([n]) => n === "error"));
});

test("agente: un trabajo con tipo desconocido se reporta como error y no detiene al agente", async () => {
  const e = entorno({ trabajos: [job(1, { tipo: "RARO" }), job(2)] });
  await e.agente.vuelta();
  assert.equal(e.resultados[0].ok, false);
  assert.match(e.resultados[0].error, /no soportado/);
  assert.equal(e.resultados[1].ok, true);
});

test("agente: si no logra confirmar y el servidor re-entrega el trabajo, NO lo imprime dos veces", async () => {
  const trabajos = [job(7)];
  const e = entorno({ trabajos, falloResultado: 3 });
  await e.agente.vuelta();
  assert.equal(e.impresiones.length, 1, "se imprimio");
  assert.equal(e.resultados.length, 0, "pero no se pudo confirmar (3 intentos fallidos)");
  trabajos.push(job(7)); // el servidor lo vuelve a entregar tras 30 s
  await e.agente.vuelta();
  assert.equal(e.impresiones.length, 1, "no se imprime otra vez");
  assert.deepEqual(e.resultados, [{ id: 7, ok: true, error: undefined }], "solo se confirma");
});

test("agente: una reimpresion manual (mismo id, contador mayor) SI se imprime", async () => {
  const trabajos = [job(9)];
  const e = entorno({ trabajos });
  await e.agente.vuelta();
  assert.equal(e.impresiones.length, 1);
  trabajos.push(job(9, { reimpresiones: 1 }));
  await e.agente.vuelta();
  assert.equal(e.impresiones.length, 2, "la reimpresion salio");
  trabajos.push(job(9, { reimpresiones: 1 }));
  await e.agente.vuelta();
  assert.equal(e.impresiones.length, 2, "pero una re-entrega de esa misma reimpresion no se repite");
});

test("agente: un 404 al confirmar (el servidor ya no lo tiene en impresion) no se reintenta", async () => {
  const e = entorno({ trabajos: [job(3)] });
  let llamadas = 0;
  e.api.resultado = async () => {
    llamadas++;
    throw new ApiError("ya no esta", 404);
  };
  await e.agente.vuelta();
  assert.equal(llamadas, 1);
});

test("agente: correr se recupera si el servidor cae y se detiene con la señal de aborto", async () => {
  const e = entorno();
  let n = 0;
  e.api.pendientes = async () => {
    n++;
    if (n <= 2) throw new ApiError("Sin conexion con el servidor", 0);
    return n === 3 ? [job(1)] : [];
  };
  const control = new AbortController();
  const fin = e.agente.correr({ intervaloMs: 5, signal: control.signal });
  const espera = Date.now();
  while (e.impresiones.length === 0 && Date.now() - espera < 3000) await new Promise((r) => setTimeout(r, 10));
  control.abort();
  await fin;
  assert.equal(e.impresiones.length, 1, "imprimio tras recuperarse");
  assert.ok(e.logs.some(([, m]) => /restablecida/.test(m)));
});

test("agente: token rechazado (401) se avisa con una pista accionable", async () => {
  const e = entorno();
  e.api.pendientes = async () => {
    throw new ApiError("Token de agente inválido o desactivado", 401);
  };
  const control = new AbortController();
  const fin = e.agente.correr({ intervaloMs: 5, signal: control.signal });
  await new Promise((r) => setTimeout(r, 40));
  control.abort();
  await fin;
  assert.ok(e.logs.some(([n, m]) => n === "error" && /config\.json|token/.test(m)));
});

test("api: manda el token y la version, y traduce errores del servidor", async () => {
  let pedido;
  const fetchFn = async (url, opts) => {
    pedido = { url, opts };
    return { ok: true, status: 200, json: async () => ({ success: true, data: [{ id: 1 }] }) };
  };
  const api = crearApi({ servidor: "https://x.test/", token: "gh_agt_abc", fetchFn });
  assert.deepEqual(await api.pendientes(), [{ id: 1 }]);
  assert.equal(pedido.url, "https://x.test/api/agente/impresiones/pendientes");
  assert.equal(pedido.opts.headers.Authorization, "Bearer gh_agt_abc");
  assert.ok(pedido.opts.headers["X-Agent-Version"]);

  const mala = crearApi({ servidor: "https://x.test", token: "t", fetchFn: async () => ({ ok: false, status: 401, json: async () => ({ error: "Token inválido" }) }) });
  await assert.rejects(mala.pendientes(), (e) => e.status === 401 && /Token inválido/.test(e.message));

  const caida = crearApi({ servidor: "https://x.test", token: "t", fetchFn: async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); } });
  await assert.rejects(caida.pendientes(), (e) => e.status === 0 && /ECONNREFUSED/.test(e.message));
});

test("api: el resultado de un fallo manda el motivo, truncado", async () => {
  let cuerpo;
  const api = crearApi({ servidor: "https://x.test", token: "t", fetchFn: async (_u, o) => { cuerpo = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ data: {} }) }; } });
  await api.resultado(5, false, "x".repeat(500));
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.error.length, 300);
  await api.resultado(5, true);
  assert.deepEqual(cuerpo, { ok: true });
});

test("config: valida servidor, token y rangos, con mensajes en español", () => {
  assert.deepEqual(validarConfig({ servidor: "https://s.test", token: "gh_agt_1" }).errores, []);
  assert.equal(validarConfig({ servidor: "https://s.test", token: "gh_agt_1" }).config.intervaloMs, 2000);
  const mal = validarConfig({ servidor: "tu-sistema", token: "abc", intervaloMs: 10, paginaCodigos: 999 }).errores;
  assert.equal(mal.length, 4);
  assert.ok(validarConfig(null).errores.length > 0);
  // Los textos de config.ejemplo.json no sirven: se avisa en vez de intentar conectar.
  const ejemplo = validarConfig({ servidor: "https://PON-AQUI-LA-DIRECCION-DE-TU-BACKEND", token: "gh_agt_PEGA_AQUI_EL_TOKEN" }).errores;
  assert.equal(ejemplo.length, 2);
  assert.match(ejemplo.join(" "), /texto de ejemplo/);
  assert.equal(validarConfig({ servidor: "https://tu-sistema.up.railway.app", token: "gh_agt_1" }).errores.length, 1);
});

const conImpresora = (id, impresoraId) => job(id, { impresora: { ...job(id).impresora, id: impresoraId, nombre: `Imp${impresoraId}` } });

test("agente: una impresora caida no retrasa a las demas y sus trabajos fallan sin esperar otro timeout", async () => {
  const e = entorno({ trabajos: [conImpresora(1, 1), conImpresora(2, 1), conImpresora(3, 1), conImpresora(4, 2)] });
  const intentos = [];
  const agente = crearAgente({
    api: e.api,
    log: e.log,
    esperaResultadoMs: 1,
    transporte: async (impresora) => {
      intentos.push(impresora.id);
      if (impresora.id === 1) {
        await new Promise((r) => setTimeout(r, 40));
        throw new Error("No se pudo conectar");
      }
    },
  });
  const t0 = Date.now();
  await agente.vuelta();
  // Solo se intenta UNA vez la impresora 1 (los otros dos trabajos fallan al instante) y la 2 imprime en paralelo.
  assert.deepEqual(intentos.sort(), [1, 2]);
  assert.ok(Date.now() - t0 < 120);
  assert.deepEqual(e.resultados.map((r) => [r.id, r.ok]).sort((a, b) => a[0] - b[0]), [[1, false], [2, false], [3, false], [4, true]]);
});

test("agente: los trabajos de una misma impresora salen en orden", async () => {
  const e = entorno({ trabajos: [conImpresora(1, 1), conImpresora(2, 1), conImpresora(3, 1)] });
  const orden = [];
  const agente = crearAgente({ api: e.api, log: e.log, esperaResultadoMs: 1, renderizar: (j) => Buffer.from([j.id]), transporte: async (_i, bytes) => { await new Promise((r) => setTimeout(r, 5 - bytes[0])); orden.push(bytes[0]); } });
  await agente.vuelta();
  assert.deepEqual(orden, [1, 2, 3]);
});
