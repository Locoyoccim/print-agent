// Estado del agente en un archivo (estado.json) para el ícono de NexoMesa junto al reloj de Windows.
//
// El ícono es otro programa que corre en la sesión del usuario: solo lee este archivo, no tiene el token ni habla con el servidor,
// y el agente no abre ningún puerto (ni local). Si el archivo deja de actualizarse, el ícono sabe que el agente está detenido.
//
// Qué guarda: versión, si hay conexión con el sistema y el último error, el último trabajo bueno y el último fallo de cada
// impresora, y los últimos 20 mensajes del agente. Nunca el token (los mensajes se limpian por si acaso).
//
// Instalado en Windows vive en C:\ProgramData\NexoMesa\estado\estado.json: carpeta aparte de la de config.json (que solo leen
// SYSTEM y Administradores); el instalador le da permiso de lectura a los usuarios y de escritura solo al servicio.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const FORMATO = 1;
export const INTERVALO_MS = 5000;
const MAX_EVENTOS = 20;
const MAX_TEXTO = 300;

/** Ruta de estado.json: AGENT_ESTADO, la carpeta de estado de ProgramData (instalado en Windows) o junto a config.json. */
export function rutaEstado({ env = process.env, plataforma = process.platform, instalado = false, rutaConfig }) {
  if (env.AGENT_ESTADO) return env.AGENT_ESTADO;
  if (instalado && plataforma === "win32") return join(env.ProgramData ?? "C:\\ProgramData", "NexoMesa", "estado", "estado.json");
  return join(dirname(rutaConfig), "estado.json");
}

/** Quita cualquier token de agente de un texto y lo recorta. */
export const limpiar = (texto) =>
  String(texto ?? "")
    .replace(/gh_agt_[\w.-]+/g, "gh_agt_***")
    .slice(0, MAX_TEXTO);

/** Escribe el archivo completo de una vez (temporal + renombrar): quien lo lee nunca ve uno a medias. */
export function escribirAtomico(ruta, texto) {
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.${process.pid}.tmp`;
  writeFileSync(temporal, texto);
  try {
    renameSync(temporal, ruta);
  } catch (e) {
    rmSync(temporal, { force: true });
    throw e;
  }
}

function leerAnterior(ruta, leer) {
  try {
    const previo = JSON.parse(leer(ruta, "utf8"));
    if (previo?.formato !== FORMATO) return null;
    return previo;
  } catch {
    return null;
  }
}

/**
 * Lleva el estado en memoria y lo guarda en `ruta`: cada `INTERVALO_MS` (latido) y en cuanto algo cambia de bien a mal o al revés.
 * De la ejecución anterior conserva las impresoras y los últimos mensajes, para que el ícono no arranque en blanco.
 */
export function crearEstado({
  ruta,
  version,
  servidor = null,
  ahora = () => new Date(),
  escribir = escribirAtomico,
  leer = readFileSync,
  alFallar = () => {},
}) {
  const hora = () => ahora().toISOString();
  const previo = leerAnterior(ruta, leer);
  const impresoras = new Map();
  for (const p of Array.isArray(previo?.impresoras) ? previo.impresoras : []) {
    if (p && typeof p.clave === "string") impresoras.set(p.clave, { ...p });
  }
  const eventos = Array.isArray(previo?.eventos) ? previo.eventos.slice(-MAX_EVENTOS) : [];
  const conexion = { url: servidor, conectado: null, ultimoContacto: null, error: null };
  const general = { iniciado: hora(), detenido: false, motivo: null };
  let ultimoFallo = null;
  let latido = null;

  function instantanea() {
    return {
      formato: FORMATO,
      version,
      pid: process.pid,
      iniciado: general.iniciado,
      actualizado: hora(),
      detenido: general.detenido,
      motivo: general.motivo,
      servidor: { ...conexion, error: conexion.error && { ...conexion.error } },
      impresoras: [...impresoras.values()]
        .map((p) => ({ ...p, ultimoError: p.ultimoError && { ...p.ultimoError } }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      eventos: eventos.map((e) => ({ ...e })),
    };
  }

  function guardar() {
    try {
      escribir(ruta, `${JSON.stringify(instantanea(), null, 2)}\n`);
      ultimoFallo = null;
    } catch (e) {
      // Se avisa una vez por cada error distinto (p. ej. el ícono tenía el archivo abierto justo al renombrar) y se reintenta en el
      // siguiente latido: el estado nunca detiene la impresión.
      if (e.message !== ultimoFallo) alFallar(e);
      ultimoFallo = e.message;
    }
  }

  function impresora(datos) {
    if (!datos) return null;
    const clave = datos.id != null ? `id:${datos.id}` : `nombre:${datos.nombre ?? "?"}`;
    const p = impresoras.get(clave) ?? { clave, ok: null, ultimoOk: null, ultimoError: null };
    p.nombre = limpiar(datos.nombre ?? "Impresora");
    p.conexion = datos.conexion === "USB" ? "USB" : "RED";
    impresoras.set(clave, p);
    return p;
  }

  return {
    ruta,
    instantanea,
    guardar,

    /** El servidor respondió. */
    contacto() {
      const cambio = conexion.conectado !== true;
      conexion.conectado = true;
      conexion.ultimoContacto = hora();
      conexion.error = null;
      if (cambio) guardar();
    },

    /** No se pudo consultar al servidor (`codigo` 0 = sin red, 401 = token rechazado). */
    errorServidor(mensaje, codigo = null) {
      const cambio = conexion.conectado !== false || conexion.error?.codigo !== codigo;
      conexion.conectado = false;
      conexion.error = { mensaje: limpiar(mensaje), codigo, desde: cambio ? hora() : conexion.error.desde };
      if (cambio) guardar();
    },

    /** Un trabajo salió bien en esta impresora. */
    impreso(datos) {
      const p = impresora(datos);
      if (!p) return;
      const cambio = p.ok !== true;
      p.ok = true;
      p.ultimoOk = hora();
      if (cambio) guardar();
    },

    /** Un trabajo falló en esta impresora. */
    fallo(datos, mensaje) {
      const p = impresora(datos);
      if (!p) return;
      const cambio = p.ok !== false;
      p.ok = false;
      p.ultimoError = { mensaje: limpiar(mensaje), hora: hora() };
      if (cambio) guardar();
    },

    /** Un mensaje del registro del agente (se guarda en el siguiente latido). */
    evento(nivel, mensaje) {
      eventos.push({ hora: hora(), nivel, mensaje: limpiar(mensaje) });
      if (eventos.length > MAX_EVENTOS) eventos.splice(0, eventos.length - MAX_EVENTOS);
    },

    /** Empieza el latido: guarda ya y luego cada `intervaloMs`. */
    iniciar(intervaloMs = INTERVALO_MS) {
      guardar();
      latido ??= setInterval(guardar, intervaloMs);
      latido.unref?.();
    },

    /** El agente se detiene (`motivo`: detenido, actualizando, configuracion, error). Guarda en el momento. */
    detener(motivo = "detenido") {
      if (latido) clearInterval(latido);
      latido = null;
      general.detenido = true;
      general.motivo = motivo;
      guardar();
    },
  };
}
