/** Línea de comandos del agente: `agente` (corre), `agente emparejar CODIGO [--servidor URL] [--config RUTA] [--equipo NOMBRE]`, `agente --version`. */
export function analizarArgs(args) {
  const r = { orden: "correr", codigo: null, servidor: null, config: null, equipo: null, error: null };
  const lista = [...args];
  const valor = (nombre) => {
    const v = lista.shift();
    if (!v || v.startsWith("--")) r.error = `Falta el valor de ${nombre}`;
    return v ?? null;
  };
  while (lista.length) {
    const a = lista.shift();
    if (a === "--version" || a === "-v") r.orden = "version";
    else if (a === "--help" || a === "-h") r.orden = "ayuda";
    else if (a === "emparejar") r.orden = "emparejar";
    else if (a === "--servidor") r.servidor = valor("--servidor");
    else if (a === "--config") r.config = valor("--config");
    else if (a === "--equipo") r.equipo = valor("--equipo");
    else if (a.startsWith("--")) r.error = `Opcion desconocida: ${a}`;
    else if (r.orden === "emparejar" && !r.codigo) r.codigo = a;
    else r.error = `Argumento inesperado: ${a}`;
  }
  if (!r.error && r.orden === "emparejar" && !r.codigo) r.error = "Falta el codigo de emparejamiento (se genera en Impresoras → Agentes)";
  return r;
}

export const AYUDA = `Agente de impresion de NexoMesa

Uso:
  agente                      Corre el agente (lee config.json)
  agente emparejar CODIGO     Canjea el codigo de Impresoras → Agentes y guarda config.json
        --servidor URL        Direccion del sistema (si el instalador no la trae incluida)
        --config RUTA         Donde guardar config.json
        --equipo NOMBRE       Nombre de esta PC (por defecto, el de la maquina)
  agente --version            Muestra la version
`;
