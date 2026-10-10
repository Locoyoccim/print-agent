import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analizarArgs } from "../src/cli.js";
import { cargarConfig } from "../src/config.js";
import { carpetaDatos, emparejar, guardarConfig } from "../src/emparejar.js";

const respuesta = (status, cuerpo) => async () => ({ ok: status < 400, status, json: async () => cuerpo });

test("analizarArgs: correr, emparejar con opciones, version y errores", () => {
  assert.equal(analizarArgs([]).orden, "correr");
  assert.equal(analizarArgs(["--version"]).orden, "version");
  const e = analizarArgs(["emparejar", "ABCD-2345", "--servidor", "https://x.test", "--equipo", "CAJA 1", "--config", "C:\\gh\\config.json"]);
  assert.deepEqual({ ...e }, { orden: "emparejar", codigo: "ABCD-2345", servidor: "https://x.test", config: "C:\\gh\\config.json", equipo: "CAJA 1", error: null });
  assert.match(analizarArgs(["emparejar"]).error, /Falta el codigo/);
  assert.match(analizarArgs(["emparejar", "AB", "--servidor"]).error, /Falta el valor/);
  assert.match(analizarArgs(["--raro"]).error, /Opcion desconocida/);
  assert.match(analizarArgs(["hola"]).error, /inesperado/);
});

test("carpetaDatos: ProgramData en Windows", () => {
  assert.equal(carpetaDatos({ ProgramData: "D:\\PD" }, "win32"), join("D:\\PD", "GastronomyHub", "agente"));
  assert.equal(carpetaDatos({ HOME: "/home/x" }, "linux"), join("/home/x", ".gastronomyhub", "agente"));
});

test("emparejar: manda el codigo y devuelve servidor, token y zona de la empresa", async () => {
  let llamada;
  const fetchFn = async (url, init) => {
    llamada = { url, cuerpo: JSON.parse(init.body), metodo: init.method };
    return respuesta(200, { success: true, data: { servidor: "https://api.test", token: "gh_agt_" + "a".repeat(48), zona_horaria: "America/Monterrey", agente: { id: 3, nombre: "Caja" } } })();
  };
  const r = await emparejar({ servidor: "https://api.test/", codigo: "ABCD-2345", equipo: "PC1", fetchFn });
  assert.equal(llamada.url, "https://api.test/api/agente/emparejar");
  assert.equal(llamada.metodo, "POST");
  assert.deepEqual(llamada.cuerpo, { codigo: "ABCD-2345", equipo: "PC1" });
  assert.equal(r.zonaHoraria, "America/Monterrey");
  assert.equal(r.agente.nombre, "Caja");
});

test("emparejar: errores del servidor, de red y respuestas raras", async () => {
  await assert.rejects(emparejar({ servidor: "https://x.test", codigo: "X", fetchFn: respuesta(400, { success: false, error: "El código no es válido o ya venció." }) }), /ya venció/);
  await assert.rejects(emparejar({ servidor: "https://x.test", codigo: "X", fetchFn: async () => { throw Object.assign(new Error("fallo"), { cause: { code: "ENOTFOUND" } }); } }), /Sin conexion.*ENOTFOUND/);
  await assert.rejects(emparejar({ servidor: "https://x.test", codigo: "X", fetchFn: respuesta(200, { success: true, data: { token: "otro" } }) }), /Respuesta invalida/);
});

test("guardarConfig: escribe un config.json que el agente acepta, solo legible por su dueño", () => {
  const dir = mkdtempSync(join(tmpdir(), "agente-"));
  const ruta = join(dir, "sub", "config.json");
  guardarConfig(ruta, { servidor: "https://api.test", token: "gh_agt_" + "b".repeat(48), zonaHoraria: "America/Tijuana" });
  const { errores, config } = cargarConfig(ruta);
  assert.deepEqual(errores, []);
  assert.equal(config.zona, "America/Tijuana");
  assert.equal(JSON.parse(readFileSync(ruta, "utf8")).paginaCodigos, 19);
  if (process.platform !== "win32") assert.equal(statSync(ruta).mode & 0o777, 0o600);
});
