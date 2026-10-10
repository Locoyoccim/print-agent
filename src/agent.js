import { render } from "./layout.js";
import { enviar } from "./transports.js";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// El bucle del agente: pide trabajos, imprime cada uno en su impresora y confirma el resultado.
export function crearAgente({ api, transporte = enviar, renderizar = render, log = () => {}, zona, pagina, esperaResultadoMs = 500, reintentosResultado = 3 }) {
  // Entregas ya impresas en esta sesion. Si el servidor no recibio la confirmacion y vuelve a
  // entregar el mismo trabajo, se confirma sin imprimir otra vez (evita comandas duplicadas).
  // Un "Reimprimir" manual sube `reimpresiones`, asi que es otra entrega y si se imprime.
  const impresos = new Set();
  const llave = (job) => `${job.id}:${job.reimpresiones ?? 0}`;
  const recordar = (job) => {
    impresos.add(llave(job));
    if (impresos.size > 500) impresos.delete(impresos.values().next().value);
  };

  async function confirmar(id, ok, error) {
    for (let n = 1; n <= reintentosResultado; n++) {
      try {
        await api.resultado(id, ok, error);
        return true;
      } catch (e) {
        // 404: el servidor ya no lo tiene en impresion (otro agente o expiro). No hay nada que confirmar.
        if (e.status === 404) return true;
        log("warn", `No se pudo confirmar el trabajo ${id} (intento ${n}/${reintentosResultado}): ${e.message}`);
        if (n < reintentosResultado) await dormir(esperaResultadoMs * n);
      }
    }
    return false;
  }

  // `caidas`: impresoras que ya fallaron en esta vuelta (id -> mensaje). Sus demas trabajos fallan al instante en vez de
  // esperar otro timeout cada uno: con la impresora apagada, 20 trabajos x 8 s rebasarian el plazo de 30 s del servidor.
  async function imprimir(job, caidas = new Map()) {
    if (impresos.has(llave(job))) {
      log("info", `Trabajo ${job.id} ya impreso antes: solo se confirma`);
      return confirmar(job.id, true);
    }
    const idImpresora = job.impresora?.id;
    try {
      if (caidas.has(idImpresora)) throw new Error(caidas.get(idImpresora));
      const bytes = renderizar(job, { zona, pagina });
      try {
        await transporte(job.impresora, bytes);
      } catch (e) {
        if (idImpresora != null) caidas.set(idImpresora, e.message);
        throw e;
      }
    } catch (e) {
      log("error", `Fallo el trabajo ${job.id} (${job.tipo}) en ${job.impresora?.nombre ?? "?"}: ${e.message}`);
      return confirmar(job.id, false, e.message);
    }
    recordar(job);
    log("info", `Impreso ${job.tipo} #${job.id} en ${job.impresora.nombre}`);
    return confirmar(job.id, true);
  }

  // Una vuelta: devuelve cuantos trabajos proceso. Cada impresora tiene su propia cola (en orden, para que las comandas
  // salgan en secuencia); las colas corren en paralelo, asi una impresora caida o lenta no retrasa a las demas.
  async function vuelta() {
    const trabajos = await api.pendientes();
    const colas = new Map();
    for (const job of trabajos) {
      const clave = job.impresora?.id ?? `sin-${job.id}`;
      if (!colas.has(clave)) colas.set(clave, []);
      colas.get(clave).push(job);
    }
    const caidas = new Map();
    await Promise.all([...colas.values()].map(async (cola) => {
      for (const job of cola) await imprimir(job, caidas);
    }));
    return trabajos.length;
  }

  // Bucle continuo con espera creciente si el servidor no responde (maximo 30 s).
  async function correr({ intervaloMs = 2000, signal } = {}) {
    let fallos = 0;
    while (!signal?.aborted) {
      let espera = intervaloMs;
      try {
        const n = await vuelta();
        if (fallos > 0) log("info", "Conexion con el servidor restablecida");
        fallos = 0;
        if (n > 0) espera = 0;
      } catch (e) {
        if (e.status === 401) {
          log("error", `El servidor rechazo el token del agente (${e.message}). Revisa config.json o genera un token nuevo en Impresoras.`);
        } else if (fallos === 0 || fallos % 10 === 0) {
          log("warn", `No se pudo consultar el servidor: ${e.message}`);
        }
        fallos++;
        espera = Math.min(30000, intervaloMs * 2 ** Math.min(fallos, 4));
      }
      if (espera > 0) await dormir(espera);
    }
  }

  return { vuelta, correr, imprimir };
}
