export const VERSION = "1.9.0";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Cliente del servidor de NexoMesa. Solo habla con /api/agente/*, autenticado con el token del agente.
export function crearApi({ servidor, token, timeoutMs = 10000, fetchFn = fetch }) {
  const base = servidor.replace(/\/+$/, "");

  async function llamar(metodo, ruta, cuerpo) {
    let res;
    try {
      res = await fetchFn(`${base}/api/agente${ruta}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Agent-Version": VERSION,
          ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new ApiError(e.name === "TimeoutError" ? "El servidor no respondio a tiempo" : `Sin conexion con el servidor (${e.cause?.code ?? e.message})`, 0);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(json?.error ?? `Error ${res.status}`, res.status);
    return json?.data;
  }

  return {
    pendientes: () => llamar("GET", "/impresiones/pendientes"),
    version: () => llamar("GET", "/version"),
    resultado: (id, ok, error) => llamar("POST", `/impresiones/${id}/resultado`, ok ? { ok: true } : { ok: false, error: String(error).slice(0, 300) }),
  };
}
