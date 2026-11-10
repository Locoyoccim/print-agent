# Seguridad

Si encuentras una vulnerabilidad en el agente de impresión de NexoMesa, **no abras un issue público**. Repórtala en privado desde la
pestaña **Security → Report a vulnerability** de este repositorio, con:

- qué versión del agente (`agente.exe --version` o `node src/index.js --version`);
- cómo reproducirla y qué impacto tiene;
- si la probaste contra un sistema real, cuál (no hagas pruebas contra negocios de otras personas).

Respondemos en cuanto podamos y te avisamos cuando haya una versión corregida. Las versiones anteriores no reciben parches: el agente
se actualiza solo a la última.

## Qué protege el agente

- **Token del agente:** se obtiene canjeando un código de emparejamiento de un solo uso (15 minutos). Se guarda solo en `config.json`,
  que nunca se versiona; el servidor guarda únicamente su hash.
- **Actualizaciones:** solo por https y solo si el sha256 del archivo coincide con el que publica el servidor. Si la versión nueva no
  arranca, el agente vuelve solo a la anterior.
- **Red:** el agente solo hace conexiones salientes (https al sistema y TCP 9100 a las impresoras de la red local); no abre puertos.
