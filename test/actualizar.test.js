import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alArrancar, buscarActualizacion, comparar, descargarVerificado, marcarSana } from "../src/actualizar.js";

const sha = (texto) => createHash("sha256").update(texto).digest("hex");
const entorno = () => {
  const dir = mkdtempSync(join(tmpdir(), "agente-upd-"));
  const exe = join(dir, "agente.exe");
  writeFileSync(exe, "VIEJO");
  return { dir, exe };
};
const apiCon = (manifiesto) => ({ version: async () => ({ manifiesto }) });
const descargaFalsa = (contenido) => async ({ destino }) => writeFileSync(destino, contenido);

test("comparar versiones", () => {
  assert.equal(comparar("1.7.0", "1.10.0"), -1);
  assert.equal(comparar("1.7.0", "1.7.0"), 0);
});

test("descargarVerificado: acepta el hash correcto, rechaza y borra el incorrecto, exige https", async () => {
  const { dir } = entorno();
  const destino = join(dir, "bin");
  const fetchFn = async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from("CONTENIDO") });
  await descargarVerificado({ url: "https://x.test/a", sha256: sha("CONTENIDO").toUpperCase(), destino, fetchFn });
  assert.equal(readFileSync(destino, "utf8"), "CONTENIDO");
  await assert.rejects(descargarVerificado({ url: "https://x.test/a", sha256: sha("OTRO"), destino, fetchFn }), /no coincide/);
  assert.equal(existsSync(destino), false, "lo que no coincide se borra");
  await assert.rejects(descargarVerificado({ url: "http://x.test/a", sha256: sha("x"), destino, fetchFn }), /https/);
});

test("buscarActualizacion: sin manifiesto, al dia y sin respuesta no tocan nada", async () => {
  const { dir, exe } = entorno();
  const base = { version: "1.7.0", dir, exe };
  assert.equal((await buscarActualizacion({ ...base, api: apiCon(null) })).estado, "sin-manifiesto");
  assert.equal((await buscarActualizacion({ ...base, api: apiCon({ version: "1.8.0", url: null, sha256: null }) })).estado, "sin-manifiesto");
  assert.equal((await buscarActualizacion({ ...base, api: apiCon({ version: "1.7.0", url: "https://x/a", sha256: sha("N") }) })).estado, "al-dia");
  assert.equal((await buscarActualizacion({ ...base, api: { version: async () => { throw new Error("sin red"); } } })).estado, "sin-respuesta");
  assert.equal(readFileSync(exe, "utf8"), "VIEJO");
});

test("actualizacion completa: instala, deja respaldo y marca en prueba; al volverse sana se limpia", async () => {
  const { dir, exe } = entorno();
  const manifiesto = { version: "1.8.0", url: "https://x/a", sha256: sha("NUEVO") };
  const r = await buscarActualizacion({ version: "1.7.0", dir, exe, api: apiCon(manifiesto), descargar: descargaFalsa("NUEVO") });
  assert.deepEqual(r, { estado: "instalada", version: "1.8.0" });
  assert.equal(readFileSync(exe, "utf8"), "NUEVO");
  assert.equal(readFileSync(`${exe}.anterior`, "utf8"), "VIEJO");
  assert.equal((await buscarActualizacion({ version: "1.7.0", dir, exe, api: apiCon(manifiesto), descargar: descargaFalsa("NUEVO") })).estado, "en-prueba", "no apila otra mientras esta en prueba");

  assert.equal(alArrancar({ dir, exe }).estado, "en-prueba");
  assert.equal(marcarSana({ dir, exe }), true);
  assert.equal(existsSync(`${exe}.anterior`), false);
  assert.equal(alArrancar({ dir, exe }).estado, "normal");
});

test("una descarga que falla deja el ejecutable como estaba", async () => {
  const { dir, exe } = entorno();
  const r = await buscarActualizacion({
    version: "1.7.0", dir, exe, api: apiCon({ version: "1.8.0", url: "https://x/a", sha256: sha("NUEVO") }),
    descargar: async () => { throw new Error("hash incorrecto"); },
  });
  assert.equal(r.estado, "fallida");
  assert.equal(readFileSync(exe, "utf8"), "VIEJO");
  assert.equal(existsSync(`${exe}.nuevo`), false);
  assert.equal(existsSync(`${exe}.anterior`), false);
});

test("reversa: tras 3 arranques sin llegar a sana regresa a la anterior y no reintenta esa version", async () => {
  const { dir, exe } = entorno();
  const manifiesto = { version: "1.8.0", url: "https://x/a", sha256: sha("NUEVO") };
  await buscarActualizacion({ version: "1.7.0", dir, exe, api: apiCon(manifiesto), descargar: descargaFalsa("NUEVO") });
  assert.equal(alArrancar({ dir, exe }).estado, "en-prueba");
  assert.equal(alArrancar({ dir, exe }).estado, "en-prueba");
  assert.equal(alArrancar({ dir, exe }).estado, "en-prueba");
  const r = alArrancar({ dir, exe });
  assert.deepEqual(r, { estado: "revertida", version: "1.8.0" });
  assert.equal(readFileSync(exe, "utf8"), "VIEJO");
  assert.equal(alArrancar({ dir, exe }).estado, "normal");
  assert.equal((await buscarActualizacion({ version: "1.7.0", dir, exe, api: apiCon(manifiesto), descargar: descargaFalsa("NUEVO") })).estado, "rechazada");
  // una version posterior si se intenta
  const nueva = { version: "1.8.1", url: "https://x/b", sha256: sha("MAS NUEVO") };
  assert.equal((await buscarActualizacion({ version: "1.7.0", dir, exe, api: apiCon(nueva), descargar: descargaFalsa("MAS NUEVO") })).estado, "instalada");
});
