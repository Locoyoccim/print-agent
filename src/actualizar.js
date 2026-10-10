import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Actualización automática del agente instalado (ejecutable único). Flujo: el servidor publica un manifiesto
// {version, url, sha256}; el agente descarga junto a su .exe, VERIFICA el hash, renombra el .exe en uso (Windows lo permite) y
// termina con código 3 para que el servicio lo reinicie con el nuevo. Si la versión nueva no logra mantenerse viva
// (3 arranques sin llegar a «sana»), se regresa sola a la anterior y no se vuelve a intentar esa versión.

export const CODIGO_REINICIO = 3;
const MAX_ARRANQUES_SIN_SALUD = 3;

export function comparar(a, b) {
  const [x, y] = [a, b].map((v) => String(v).split(".").map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

export function hashArchivo(ruta) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(ruta).on("data", (d) => h.update(d)).on("error", reject).on("end", () => resolve(h.digest("hex")));
  });
}

/** Descarga a `destino` y comprueba el sha256; si no coincide borra el archivo y falla (nunca se instala algo sin verificar). */
export async function descargarVerificado({ url, sha256, destino, fetchFn = fetch, timeoutMs = 120000 }) {
  if (!/^https:\/\//.test(url)) throw new Error("La descarga debe ser https");
  const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`La descarga respondio ${res.status}`);
  writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
  const real = await hashArchivo(destino);
  if (real !== sha256.toLowerCase()) {
    rmSync(destino, { force: true });
    throw new Error("El archivo descargado no coincide con el hash publicado: se descarta");
  }
}

const rutas = (dir, exe) => ({
  exe,
  nuevo: `${exe}.nuevo`,
  anterior: `${exe}.anterior`,
  fallida: `${exe}.fallida`,
  pendiente: join(dir, "actualizacion.json"),
  rechazada: join(dir, "version-rechazada.json"),
});

const leerJson = (ruta) => {
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
};

/**
 * Se llama al arrancar. Con una actualización recién aplicada cuenta el arranque; si ya van 3 sin llegar a «sana», regresa a la
 * versión anterior. Devuelve { estado: "normal" | "en-prueba" | "revertida" }; con "revertida" quien llama debe salir con el código de reinicio.
 */
export function alArrancar({ dir, exe, log = () => {} }) {
  const r = rutas(dir, exe);
  const p = leerJson(r.pendiente);
  if (!p) return { estado: "normal" };
  if (p.arranques >= MAX_ARRANQUES_SIN_SALUD && existsSync(r.anterior)) {
    log("error", `La version ${p.hacia} no logro mantenerse en marcha: se regresa a la ${p.desde}`);
    rmSync(r.fallida, { force: true });
    renameSync(r.exe, r.fallida);
    renameSync(r.anterior, r.exe);
    writeFileSync(r.rechazada, JSON.stringify({ version: p.hacia, at: new Date().toISOString() }));
    rmSync(r.pendiente, { force: true });
    return { estado: "revertida", version: p.hacia };
  }
  writeFileSync(r.pendiente, JSON.stringify({ ...p, arranques: (p.arranques ?? 0) + 1 }));
  return { estado: "en-prueba", hacia: p.hacia };
}

/** La versión nueva ya demostró que funciona: se borra la marca y el respaldo de la anterior. */
export function marcarSana({ dir, exe }) {
  const r = rutas(dir, exe);
  if (!existsSync(r.pendiente)) return false;
  rmSync(r.pendiente, { force: true });
  rmSync(r.anterior, { force: true });
  rmSync(r.fallida, { force: true });
  return true;
}

/** Consulta el manifiesto y, si hay una versión más nueva con descarga verificable, la deja instalada lista para reiniciar. */
export async function buscarActualizacion({ api, version, dir, exe, log = () => {}, descargar = descargarVerificado }) {
  const r = rutas(dir, exe);
  let manifiesto;
  try {
    manifiesto = (await api.version())?.manifiesto;
  } catch (e) {
    log("warn", `No se pudo consultar la version publicada: ${e.message}`);
    return { estado: "sin-respuesta" };
  }
  if (!manifiesto?.url || !manifiesto?.sha256) return { estado: "sin-manifiesto" };
  if (comparar(version, manifiesto.version) >= 0) return { estado: "al-dia" };
  if (leerJson(r.rechazada)?.version === manifiesto.version) return { estado: "rechazada" };
  if (existsSync(r.pendiente)) return { estado: "en-prueba" };

  log("info", `Hay una version nueva (${manifiesto.version}); descargando...`);
  try {
    rmSync(r.nuevo, { force: true });
    await descargar({ url: manifiesto.url, sha256: manifiesto.sha256, destino: r.nuevo });
    rmSync(r.anterior, { force: true });
    renameSync(r.exe, r.anterior);
    renameSync(r.nuevo, r.exe);
    writeFileSync(r.pendiente, JSON.stringify({ desde: version, hacia: manifiesto.version, arranques: 0, at: new Date().toISOString() }));
  } catch (e) {
    rmSync(r.nuevo, { force: true });
    if (existsSync(r.anterior) && !existsSync(r.exe)) renameSync(r.anterior, r.exe);
    log("error", `No se pudo actualizar: ${e.message}`);
    return { estado: "fallida", error: e.message };
  }
  log("info", `Version ${manifiesto.version} instalada: el servicio se reinicia para usarla`);
  return { estado: "instalada", version: manifiesto.version };
}
