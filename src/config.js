import { readFileSync } from "node:fs";

export function validarConfig(c) {
  const errores = [];
  if (!c || typeof c !== "object") return { errores: ["config.json debe ser un objeto JSON"] };
  if (typeof c.servidor !== "string" || !/^https?:\/\/\S+$/.test(c.servidor)) errores.push('"servidor" debe ser la direccion del sistema, por ejemplo "https://tu-sistema.up.railway.app"');
  if (typeof c.token !== "string" || !c.token.startsWith("gh_agt_")) errores.push('"token" debe ser el token del agente (empieza con gh_agt_), generado en Impresoras');
  // Los textos de config.ejemplo.json cumplen el formato pero no sirven: se avisa en vez de intentar conectar.
  if (typeof c.servidor === "string" && /^https?:\/\/\S+$/.test(c.servidor) && /PON-AQUI|tu-sistema|TU-DOMINIO/i.test(c.servidor)) errores.push('"servidor" todavia tiene el texto de ejemplo: pon la direccion real del sistema');
  if (typeof c.token === "string" && c.token.startsWith("gh_agt_") && /PEGA_AQUI/i.test(c.token)) errores.push('"token" todavia tiene el texto de ejemplo: pega el token real del agente');
  const intervaloMs = c.intervaloMs ?? 2000;
  if (!Number.isFinite(intervaloMs) || intervaloMs < 500 || intervaloMs > 30000) errores.push('"intervaloMs" debe estar entre 500 y 30000');
  const pagina = c.paginaCodigos ?? 19;
  if (!Number.isInteger(pagina) || pagina < 0 || pagina > 255) errores.push('"paginaCodigos" debe ser un numero de pagina ESC/POS (19 = CP858, 2 = CP850)');
  return { errores, config: { servidor: c.servidor, token: c.token, intervaloMs, zona: c.zonaHoraria ?? "America/Mexico_City", pagina } };
}

export function cargarConfig(ruta) {
  let crudo;
  try {
    crudo = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (e) {
    return { errores: [e.code === "ENOENT" ? `No existe ${ruta}. Copia config.ejemplo.json a config.json y llenalo.` : `No se pudo leer ${ruta}: ${e.message}`] };
  }
  return validarConfig(crudo);
}
