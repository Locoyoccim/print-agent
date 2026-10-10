import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Dónde vive config.json cuando el agente corre instalado (Windows): C:\ProgramData\NexoMesa\agente. */
export function carpetaDatos(env = process.env, plataforma = process.platform) {
  if (plataforma === "win32") return join(env.ProgramData ?? "C:\\ProgramData", "NexoMesa", "agente");
  return join(env.HOME ?? ".", ".nexomesa", "agente");
}

/**
 * Canjea el código de emparejamiento (lo genera un Admin en Impresoras → Agentes) por la configuración del agente.
 * Un solo uso: el servidor devuelve un token nuevo y el anterior deja de servir.
 */
export async function emparejar({ servidor, codigo, equipo, fetchFn = fetch, timeoutMs = 15000 }) {
  const base = servidor.replace(/\/+$/, "");
  let res;
  try {
    res = await fetchFn(`${base}/api/agente/emparejar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, equipo }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(e.name === "TimeoutError" ? "El servidor no respondio a tiempo" : `Sin conexion con el servidor (${e.cause?.code ?? e.message})`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error ?? `El servidor respondio ${res.status}`);
  const { token, zona_horaria: zona, servidor: url, agente } = json.data;
  if (typeof token !== "string" || !token.startsWith("gh_agt_")) throw new Error("Respuesta invalida del servidor");
  return { servidor: url ?? base, token, zonaHoraria: zona, agente };
}

/** Guarda config.json solo legible por quien lo creo (en Windows los permisos los fija el instalador con icacls). */
export function guardarConfig(ruta, { servidor, token, zonaHoraria }) {
  mkdirSync(dirname(ruta), { recursive: true });
  const config = { servidor, token, intervaloMs: 2000, zonaHoraria: zonaHoraria ?? "America/Mexico_City", paginaCodigos: 19 };
  writeFileSync(ruta, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(ruta, 0o600);
  } catch {
    // Windows: chmod no aplica
  }
  return config;
}
