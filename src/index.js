import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSea } from "node:sea";
import { alArrancar, buscarActualizacion, CODIGO_REINICIO, marcarSana } from "./actualizar.js";
import { crearAgente } from "./agent.js";
import { crearApi, VERSION } from "./api.js";
import { analizarArgs, AYUDA } from "./cli.js";
import { cargarConfig } from "./config.js";
import { carpetaDatos, emparejar, guardarConfig } from "./emparejar.js";

const log = (nivel, mensaje) => {
  const linea = `${new Date().toISOString()} [${nivel}] ${mensaje}`;
  (nivel === "error" ? console.error : console.log)(linea);
};

// Direccion del sistema que el instalador trae incluida (se fija al construir el ejecutable; ver scripts/construir.mjs).
const SERVIDOR_INCLUIDO = typeof __SERVIDOR_POR_DEFECTO__ === "string" ? __SERVIDOR_POR_DEFECTO__ : null; // eslint-disable-line no-undef

const instalado = isSea();
const args = analizarArgs(process.argv.slice(2));

// config.json: --config, AGENT_CONFIG, el de la carpeta del agente (modo desarrollo) o C:\ProgramData\GastronomyHub\agente (instalado).
function rutaConfig() {
  if (args.config) return args.config;
  if (process.env.AGENT_CONFIG) return process.env.AGENT_CONFIG;
  if (!instalado) {
    const local = join(dirname(fileURLToPath(import.meta.url)), "..", "config.json");
    if (existsSync(local)) return local;
  }
  return join(carpetaDatos(), "config.json");
}

// Sin await de nivel superior: el ejecutable (SEA) se construye como CommonJS.
async function principal() {
  if (args.error) {
    console.error(`${args.error}\n\n${AYUDA}`);
    process.exit(2);
  }
  if (args.orden === "version") {
    console.log(VERSION);
    process.exit(0);
  }
  if (args.orden === "ayuda") {
    console.log(AYUDA);
    process.exit(0);
  }

  if (args.orden === "emparejar") {
    const servidor = args.servidor ?? process.env.GH_SERVIDOR ?? SERVIDOR_INCLUIDO;
    if (!servidor) {
      console.error("No se sabe a que sistema conectarse: usa --servidor https://tu-sistema.up.railway.app");
      process.exit(2);
    }
    try {
      const r = await emparejar({ servidor, codigo: args.codigo, equipo: args.equipo ?? hostname() });
      const ruta = rutaConfig();
      guardarConfig(ruta, r);
      console.log(`Equipo emparejado como «${r.agente.nombre}». Configuracion guardada en ${ruta}`);
      process.exit(0);
    } catch (e) {
      console.error(`No se pudo emparejar: ${e.message}`);
      process.exit(1);
    }
  }

  const ruta = rutaConfig();
  const { errores, config } = cargarConfig(ruta);
  if (errores.length) {
    for (const e of errores) log("error", e);
    process.exit(1);
  }

  const dirDatos = dirname(ruta);
  const exe = process.execPath;
  // Solo el ejecutable instalado se actualiza solo; corriendo con `node src/index.js` (desarrollo) no se toca nada.
  if (instalado) {
    const inicio = alArrancar({ dir: dirDatos, exe, log });
    if (inicio.estado === "revertida") process.exit(CODIGO_REINICIO);
  }

  const control = new AbortController();
  let reiniciar = false;
  for (const senal of ["SIGINT", "SIGTERM"]) {
    process.on(senal, () => {
      log("info", "Deteniendo el agente...");
      control.abort();
      setTimeout(() => process.exit(0), 300);
    });
  }

  log("info", `Agente de impresion ${VERSION} conectado a ${config.servidor}`);
  const api = crearApi({ servidor: config.servidor, token: config.token });

  // Una version recien instalada es «sana» al primer contacto con el servidor o tras 60 s en marcha; antes de eso 3 arranques seguidos la revierten.
  const sana = () => instalado && marcarSana({ dir: dirDatos, exe });
  const apiConSalud = { ...api, pendientes: async () => { const trabajos = await api.pendientes(); sana(); return trabajos; } };
  if (instalado) setTimeout(sana, 60_000).unref();

  const revisar = async () => {
    const r = await buscarActualizacion({ api, version: VERSION, dir: dirDatos, exe, log });
    if (r.estado === "instalada") {
      reiniciar = true;
      control.abort(); // termina el trabajo en curso y sale: el servicio lo vuelve a levantar con la version nueva
    }
  };
  if (instalado) {
    setTimeout(() => void revisar(), 2 * 60_000).unref();
    setInterval(() => void revisar(), 6 * 3600_000).unref();
  }

  const agente = crearAgente({ api: apiConSalud, log, zona: config.zona, pagina: config.pagina });
  await agente.correr({ intervaloMs: config.intervaloMs, signal: control.signal });
  if (reiniciar) process.exit(CODIGO_REINICIO);
}

principal().catch((e) => {
  console.error(`Error inesperado: ${e.stack ?? e.message}`);
  process.exit(1);
});
