import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearAgente } from "../src/agent.js";
import { ApiError } from "../src/api.js";
import { crearEstado, escribirAtomico, FORMATO, limpiar, rutaEstado } from "../src/estado.js";

const TOKEN = "gh_agt_abc123.SECRETO-xyz";

// Reloj y disco falsos: cada escritura queda guardada como objeto.
function entorno({ previo = null, fallaEscribir = null } = {}) {
  const e = { t: Date.parse("2026-11-09T18:00:00.000Z"), escrituras: [], avisos: [] };
  e.estado = crearEstado({
    ruta: "C:\\ProgramData\\NexoMesa\\estado\\estado.json",
    version: "1.11.0",
    servidor: "https://app.nexomesa.app",
    ahora: () => new Date(e.t),
    leer: () => {
      if (previo === null) throw Object.assign(new Error("no existe"), { code: "ENOENT" });
      return typeof previo === "string" ? previo : JSON.stringify(previo);
    },
    escribir: (ruta, texto) => {
      if (fallaEscribir) throw new Error(fallaEscribir);
      e.escrituras.push(JSON.parse(texto));
    },
    alFallar: (error) => e.avisos.push(error.message),
  });
  e.ultimo = () => e.escrituras.at(-1);
  return e;
}

test("rutaEstado: AGENT_ESTADO, ProgramData\\NexoMesa\\estado instalado en Windows, o junto a config.json", () => {
  assert.equal(rutaEstado({ env: { AGENT_ESTADO: "X:\\e.json" }, rutaConfig: "C:\\a\\config.json" }), "X:\\e.json");
  const instalado = rutaEstado({ env: { ProgramData: "C:\\ProgramData" }, plataforma: "win32", instalado: true, rutaConfig: "C:\\ProgramData\\NexoMesa\\agente\\config.json" });
  assert.match(instalado, /NexoMesa[\\/]estado[\\/]estado\.json$/);
  assert.doesNotMatch(instalado, /agente/, "fuera de la carpeta de config.json (que solo leen SYSTEM y Administradores)");
  assert.equal(rutaEstado({ env: {}, plataforma: "darwin", instalado: false, rutaConfig: "/x/config.json" }), join("/x", "estado.json"));
});

test("limpiar: quita tokens y recorta a 300 caracteres", () => {
  assert.equal(limpiar(`token ${TOKEN} rechazado`), "token gh_agt_*** rechazado");
  assert.equal(limpiar("a".repeat(500)).length, 300);
  assert.equal(limpiar(undefined), "");
});

test("estado: arranca sin conexión conocida y guarda el formato que lee el ícono", () => {
  const e = entorno();
  e.estado.iniciar(60_000);
  e.estado.detener();
  const s = e.escrituras[0];
  assert.equal(s.formato, FORMATO);
  assert.equal(s.version, "1.11.0");
  assert.equal(s.servidor.url, "https://app.nexomesa.app");
  assert.equal(s.servidor.conectado, null);
  assert.equal(s.detenido, false);
  assert.deepEqual(s.impresoras, []);
  assert.equal(s.actualizado, "2026-11-09T18:00:00.000Z");
});

test("estado: guarda en el momento solo cuando la conexión cambia; el latido lleva la hora del último contacto", () => {
  const e = entorno();
  e.estado.contacto();
  assert.equal(e.escrituras.length, 1, "sin conexión conocida → conectado: se guarda");
  e.t += 2000;
  e.estado.contacto();
  assert.equal(e.escrituras.length, 1, "sigue conectado: espera al latido");
  e.estado.guardar();
  assert.equal(e.ultimo().servidor.ultimoContacto, "2026-11-09T18:00:02.000Z");

  e.t += 2000;
  e.estado.errorServidor("Sin conexion con el servidor (ENOTFOUND)", 0);
  assert.equal(e.escrituras.length, 3);
  assert.deepEqual(e.ultimo().servidor.error, { mensaje: "Sin conexion con el servidor (ENOTFOUND)", codigo: 0, desde: "2026-11-09T18:00:04.000Z" });
  assert.equal(e.ultimo().servidor.conectado, false);
  assert.equal(e.ultimo().servidor.ultimoContacto, "2026-11-09T18:00:02.000Z", "conserva el último contacto bueno");

  e.t += 4000;
  e.estado.errorServidor("Sin conexion con el servidor (ENOTFOUND)", 0);
  assert.equal(e.escrituras.length, 3, "el mismo error no vuelve a guardar");
  e.estado.errorServidor(`El servidor rechazo el token ${TOKEN}`, 401);
  assert.equal(e.escrituras.length, 4, "otro tipo de error sí");
  assert.equal(e.ultimo().servidor.error.codigo, 401);
  assert.doesNotMatch(JSON.stringify(e.ultimo()), /SECRETO/);

  e.estado.contacto();
  assert.equal(e.ultimo().servidor.conectado, true);
  assert.equal(e.ultimo().servidor.error, null);
});

test("estado: por impresora, último trabajo bueno y último fallo; guarda al pasar de bien a mal y al revés", () => {
  const e = entorno();
  const cocina = { id: 7, nombre: "Cocina", conexion: "RED", ip: "192.168.1.50" };
  const caja = { id: 3, nombre: "Caja", conexion: "USB", nombre_usb: "EPSON TM-T20" };
  e.estado.impreso(cocina);
  e.estado.impreso(caja);
  assert.equal(e.escrituras.length, 2);
  e.t += 1000;
  e.estado.impreso(cocina);
  assert.equal(e.escrituras.length, 2, "seguir bien no guarda en el momento");

  e.t += 1000;
  e.estado.fallo(cocina, "La impresora 192.168.1.50:9100 no respondio en 8 s");
  assert.equal(e.escrituras.length, 3);
  const [p1, p2] = e.ultimo().impresoras;
  assert.deepEqual(p1, { clave: "id:3", ok: true, ultimoOk: "2026-11-09T18:00:00.000Z", ultimoError: null, nombre: "Caja", conexion: "USB" });
  assert.equal(p2.nombre, "Cocina");
  assert.equal(p2.ok, false);
  assert.equal(p2.ultimoOk, "2026-11-09T18:00:01.000Z");
  assert.deepEqual(p2.ultimoError, { mensaje: "La impresora 192.168.1.50:9100 no respondio en 8 s", hora: "2026-11-09T18:00:02.000Z" });
  assert.equal(p2.ip, undefined, "solo nombre y tipo de conexión");

  e.estado.fallo(cocina, "otra vez");
  assert.equal(e.escrituras.length, 3);
  e.estado.impreso({ ...cocina, nombre: "Cocina caliente" });
  assert.equal(e.escrituras.length, 4);
  assert.equal(e.ultimo().impresoras[1].nombre, "Cocina caliente", "toma el nombre actual");
  assert.equal(e.ultimo().impresoras[1].ultimoError.mensaje, "otra vez", "conserva el último fallo");

  e.estado.impreso(null);
  e.estado.fallo(undefined, "x");
  assert.equal(e.ultimo().impresoras.length, 2, "un trabajo sin impresora no agrega nada");
});

test("estado: guarda solo los últimos 20 mensajes, limpios", () => {
  const e = entorno();
  for (let i = 1; i <= 25; i++) e.estado.evento("info", `mensaje ${i}`);
  e.estado.evento("error", `token ${TOKEN}`);
  e.estado.guardar();
  const eventos = e.ultimo().eventos;
  assert.equal(eventos.length, 20);
  assert.equal(eventos[0].mensaje, "mensaje 7");
  assert.deepEqual(eventos.at(-1), { hora: "2026-11-09T18:00:00.000Z", nivel: "error", mensaje: "token gh_agt_***" });
});

test("estado: conserva impresoras y mensajes de la ejecución anterior; ignora un archivo dañado o de otro formato", () => {
  const previo = {
    formato: FORMATO,
    impresoras: [{ clave: "id:7", nombre: "Cocina", conexion: "RED", ok: false, ultimoOk: null, ultimoError: { mensaje: "apagada", hora: "2026-11-08T22:00:00.000Z" } }],
    eventos: [{ hora: "2026-11-08T22:00:00.000Z", nivel: "info", mensaje: "Deteniendo el agente..." }],
    detenido: true,
    motivo: "detenido",
  };
  const e = entorno({ previo });
  e.estado.guardar();
  assert.equal(e.ultimo().impresoras[0].ultimoError.mensaje, "apagada");
  assert.equal(e.ultimo().eventos[0].mensaje, "Deteniendo el agente...");
  assert.equal(e.ultimo().detenido, false, "la ejecución nueva no hereda «detenido»");
  assert.equal(e.ultimo().servidor.conectado, null);

  for (const malo of ["{no es json", { formato: 99, impresoras: previo.impresoras }]) {
    const otro = entorno({ previo: malo });
    otro.estado.guardar();
    assert.deepEqual(otro.ultimo().impresoras, []);
  }
});

test("estado: detener guarda en el momento con el motivo", () => {
  const e = entorno();
  e.estado.iniciar(60_000);
  e.estado.detener("actualizando");
  assert.equal(e.ultimo().detenido, true);
  assert.equal(e.ultimo().motivo, "actualizando");
});

test("estado: si no se puede escribir avisa una vez por error y no truena", () => {
  const e = entorno({ fallaEscribir: "EPERM: operation not permitted, rename" });
  e.estado.guardar();
  e.estado.guardar();
  e.estado.contacto();
  assert.deepEqual(e.avisos, ["EPERM: operation not permitted, rename"]);
});

test("escribirAtomico: crea la carpeta, reemplaza el archivo completo y no deja temporales", () => {
  const dir = mkdtempSync(join(tmpdir(), "estado-"));
  try {
    const ruta = join(dir, "estado", "estado.json");
    escribirAtomico(ruta, '{"a":1}\n');
    escribirAtomico(ruta, '{"a":2}\n');
    assert.equal(readFileSync(ruta, "utf8"), '{"a":2}\n');
    assert.deepEqual(readdirSync(join(dir, "estado")), ["estado.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("estado en disco: el archivo real nunca lleva el token", () => {
  const dir = mkdtempSync(join(tmpdir(), "estado-"));
  try {
    const ruta = join(dir, "estado.json");
    writeFileSync(join(dir, "config.json"), JSON.stringify({ token: TOKEN }));
    const estado = crearEstado({ ruta, version: "1.11.0", servidor: "https://app.nexomesa.app" });
    estado.errorServidor(`rechazado ${TOKEN}`, 401);
    estado.fallo({ id: 1, nombre: `Cocina ${TOKEN}` }, `fallo ${TOKEN}`);
    estado.evento("error", `El servidor rechazo el token del agente (${TOKEN})`);
    estado.detener();
    assert.ok(existsSync(ruta));
    assert.doesNotMatch(readFileSync(ruta, "utf8"), /SECRETO|abc123/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Integración con el bucle del agente.
const job = (id, impresora) => ({
  id, tipo: "COMANDA", impresora,
  payload: { tipo: "COMANDA", area: "Barra", folio: 1, comanda: 1, mesa: "Mesa 1", personas: 1, fecha: "2026-10-03T20:00:00.000Z", items: [{ cantidad: 1, nombre: "Latte", notas: null }] },
});

test("agente → estado: cada impresión buena o fallida llega a su impresora, y cada consulta a la conexión", async () => {
  const llamadas = [];
  const estado = {
    contacto: () => llamadas.push(["contacto"]),
    errorServidor: (m, c) => llamadas.push(["errorServidor", c]),
    impreso: (p) => llamadas.push(["impreso", p.nombre]),
    fallo: (p, m) => llamadas.push(["fallo", p.nombre, m]),
  };
  const barra = { id: 1, nombre: "Barra", conexion: "RED", ip: "1.1.1.1", puerto: 9100, ancho: 80 };
  const cocina = { id: 2, nombre: "Cocina", conexion: "RED", ip: "2.2.2.2", puerto: 9100, ancho: 80 };
  let lotes = [[job(1, barra), job(2, cocina)]];
  const api = {
    pendientes: async () => {
      if (!lotes.length) throw new ApiError("token invalido", 401);
      return lotes.shift();
    },
    resultado: async () => {},
  };
  const transporte = async (impresora) => {
    if (impresora.nombre === "Cocina") throw new Error("No se pudo conectar con 2.2.2.2:9100 (ECONNREFUSED)");
  };
  const agente = crearAgente({ api, transporte, estado, esperaResultadoMs: 1 });
  const control = new AbortController();
  const corriendo = agente.correr({ intervaloMs: 1, signal: control.signal });
  while (!llamadas.some(([n]) => n === "errorServidor")) await new Promise((r) => setTimeout(r, 1));
  control.abort();
  await corriendo;
  assert.deepEqual(llamadas.slice(0, 4), [
    ["impreso", "Barra"],
    ["fallo", "Cocina", "No se pudo conectar con 2.2.2.2:9100 (ECONNREFUSED)"],
    ["contacto"],
    ["errorServidor", 401],
  ]);
});

test("agente sin estado: sigue funcionando igual (desarrollo y pruebas)", async () => {
  const api = { pendientes: async () => [job(1, { id: 1, nombre: "Barra", conexion: "RED", ip: "1.1.1.1", puerto: 9100, ancho: 80 })], resultado: async () => {} };
  const agente = crearAgente({ api, transporte: async () => {}, esperaResultadoMs: 1 });
  assert.equal(await agente.vuelta(), 1);
});
