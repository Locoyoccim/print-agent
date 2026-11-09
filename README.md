# Agente de impresión — NexoMesa

Programa pequeño que se instala **una vez en la PC de caja (Windows)**. Consulta cada ~2 segundos al sistema si hay comandas o tickets por imprimir y los manda a la impresora correcta, por **red (IP)** o **USB**. Así las tablets de los meseros no necesitan estar conectadas a ninguna impresora.

El agente siempre inicia la conexión hacia el sistema (HTTPS saliente): **no hay que abrir puertos ni tocar el router**.

## Requisitos

- PC con Windows 10/11 que esté encendida durante el servicio.
- Impresoras térmicas compatibles con **ESC/POS** (Epson, Star en modo ESC/POS, Xprinter y similares).
- Para impresoras de red: **IP fija** (reservada en el router) y puerto 9100 (el habitual).
- Para impresoras USB: la impresora instalada en Windows (con su driver o "Generic / Text Only").

## Instalación (instalador de un paso)

1. En el sistema: **Punto de venta → Impresoras → Agentes → Nuevo agente**. Aparece un **código `XXXX-XXXX`** (vale 15 minutos y se usa una sola vez) y el enlace para bajar el instalador.
2. En la PC de caja ejecuta `NexoMesa-Agente-Setup.exe`, escribe el código y termina. No necesitas instalar Node ni tocar archivos: el instalador deja el agente como **servicio de Windows** (arranca con la PC y se reinicia si falla).
3. En el sistema, el agente debe aparecer como **conectado**. Da de alta cada impresora y usa **Imprimir página de prueba**.

El agente **se actualiza solo** (descarga la versión nueva, verifica su hash y se reinicia; si la nueva no arranca, vuelve a la anterior). Cómo construir y publicar el instalador, y la lista de comprobación en Windows: [`instalador/LEEME.md`](instalador/LEEME.md). Por línea de comandos: `agente.exe emparejar CODIGO` guarda `config.json` en `C:\ProgramData\NexoMesa\agente`, y `agente.exe --version` muestra la versión.

> El instalador de Windows aún no se ha compilado ni probado en una PC con Windows (ver el LEEME). El emparejamiento y la actualización sí tienen pruebas automáticas y una prueba real con el ejecutable en macOS.

## Instalación manual (desarrollo o sin instalador)

Sirve para probar desde el código fuente. Requiere [Node.js 20 o superior](https://nodejs.org).

1. En el sistema: **Punto de venta → Impresoras → Agentes → Nuevo agente**. Copia el token (`gh_agt_...`); solo se muestra una vez (o, en vez de pegarlo, canjea el código: `node src/index.js emparejar CODIGO --servidor https://tu-sistema`).
2. Copia esta carpeta a la PC de caja, por ejemplo `C:\NexoMesa\print-agent` (si el repo es privado, baja el ZIP desde GitHub: *Code → Download ZIP*, descomprímelo completo y renombra la carpeta a `print-agent`).
3. Copia `config.ejemplo.json` como `config.json` y llénalo:

```json
{
  "servidor": "https://tu-sistema.up.railway.app",
  "token": "gh_agt_...",
  "intervaloMs": 2000,
  "zonaHoraria": "America/Mexico_City",
  "paginaCodigos": 19
}
```

4. Prueba en una terminal: `node src\index.js`. Debe decir `Agente de impresion ... conectado`. En el sistema, la pantalla de Impresoras mostrará el agente como **conectado**.
5. En **Impresoras** da de alta cada impresora y usa **Imprimir página de prueba**.

### Que arranque solo con Windows (Programador de tareas)

Sin descargar nada. En PowerShell **como administrador** (cambia `$dir` si tu carpeta es otra):

```powershell
$dir = "C:\NexoMesa\print-agent"
$node = (Get-Command node).Source
$accion = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$node`" src\index.js >> agente.log 2>&1`"" -WorkingDirectory $dir
$disparador = New-ScheduledTaskTrigger -AtStartup
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName "NexoMesaAgente" -Action $accion -Trigger $disparador -Settings $ajustes -User "SYSTEM" -RunLevel Highest -Force
Start-ScheduledTask -TaskName "NexoMesaAgente"
```

**Laptop o PC con batería:** las dos opciones de batería son necesarias; sin ellas la tarea se queda en `Queued` y nunca arranca. Cierra antes cualquier agente que tengas corriendo a mano (dos agentes con el mismo token pueden imprimir doble). Debe quedar en `Running` (`Get-ScheduledTask -TaskName NexoMesaAgente`) y el log en `agente.log`. Detener: `Stop-ScheduledTask -TaskName NexoMesaAgente`; quitar: `Unregister-ScheduledTask -TaskName NexoMesaAgente -Confirm:$false`. Para actualizar: detén la tarea, reemplaza los archivos y vuelve a iniciarla. (Alternativa con servicio: [NSSM](https://nssm.cc).)

## Cómo se dan de alta las impresoras

| Tipo | Qué se captura |
|---|---|
| Red | La **IP** de la impresora y el puerto (9100). Imprime una hoja de configuración (normalmente manteniendo el botón FEED al encender) para ver la IP. |
| USB | El **nombre exacto** de la impresora en Windows (Configuración → Impresoras y escáneres). |

Si la empresa tiene **más de una PC con agente** (por ejemplo caja y barra, cada una con sus impresoras), crea un agente por PC y, al dar de alta cada impresora, elige en **PC que la imprime** la que la alcanza. Cada agente solo recibe los trabajos de sus impresoras (y los de las que no tienen PC asignada, que las toma cualquiera). Con una sola PC no hace falta: el campo ni aparece. Si una impresora está asignada a una PC apagada o desactivada, sus trabajos esperan en cola hasta que vuelva o la reasignes.

Cada impresora atiende **un área** (Cocina, Barra...) o es la **impresora de tickets** (precuentas y tickets de cobro). El **cajón de dinero** va conectado a esa impresora (puerto RJ11) y se abre solo al imprimir el ticket de una venta con efectivo; una reimpresión sale marcada como copia y no lo abre. El pulso usa el comando estándar ESC/POS, pero **no se ha probado con un cajón real**: verifícalo en el local (si no abre, revisa en el manual de la impresora el pin del cajón).

## Si algo falla

- **El sistema dice "agente desconectado"**: la PC está apagada, sin internet, o el servicio no corre (`Get-ScheduledTask -TaskName NexoMesaAgente`). Las comandas **no se pierden**: quedan en cola y salen al reconectar.
- **"El servidor rechazó el token"**: el token cambió o el agente se desactivó. Genera uno nuevo en Impresoras y actualiza `config.json`.
- **Las comandas salen con símbolos raros en lugar de acentos**: cambia `paginaCodigos` (19 = CP858; prueba 2 = CP850 o 16 = WPC1252) y reinicia el servicio. La hoja de prueba incluye `á é í ó ú ñ` para verificarlo.
- **Una impresora no recibe nada y otra sí**: con varias PCs, revisa que la impresora tenga elegida la **PC que la imprime** correcta y que esa PC esté conectada.
- **"No se pudo conectar con IP:9100"**: la impresora está apagada, sin papel o con otra IP. Un trabajo con error se reintenta 5 veces (si una impresora falla, el resto de sus trabajos de esa vuelta fallan al instante, sin esperar otro timeout) y luego queda en la cola con el motivo; puedes **reimprimir** desde el sistema.
- **"No se encontró la impresora ... en Windows"** (USB): el nombre no coincide exactamente con el de Windows.

## Qué está probado

Desde la 1.10.0 el ticket y el corte distinguen **tarjeta de crédito y de débito**: el agente imprime el nombre que manda el servidor en cada pago y en cada método del corte (`etiqueta`) y, con un servidor anterior, usa su propia lista. Un agente anterior imprimiría el código tal cual (`TARJETA_CREDITO`), por eso conviene actualizar todos los agentes antes o junto con el servidor. Desde la 1.9.0 la **comanda** sale con interlineado compacto (26 puntos, ~3.3 mm, contra ~4.2 mm de fábrica) y el detalle en grande: cantidad y platillo a doble ancho y alto (el nombre se parte a media fila: 24 columnas en 80 mm, 16 en 58 mm), y opciones, comensal y notas a doble alto. En la **precuenta** todo el cuerpo, de «PRECUENTA» al total, va a doble alto (mismas columnas); el nombre del negocio sigue grande y la dirección, el teléfono y la leyenda final en tamaño normal. En precuenta y ticket, una mesa o un mesero que no caben junto al folio o a las personas ya no se recortan: salen completos y el folio (o las personas) baja a su propia línea. Una opción o nota larga se parte con sangría, sin repetir el «+» ni el «>>» en cada renglón. El ticket de venta y el corte no cambian de tamaño. Desde la 1.8.0 el encabezado de la precuenta, el ticket y el corte lleva el **nombre del negocio, la dirección y el teléfono** (se capturan en Configuración; si no están, sale solo el nombre) y **ya no se desglosa el IVA**. Los renglones de varias piezas aclaran el precio de una (`2 x 55.00`), la comanda pone la **mesa en grande** y parte los nombres al ancho real del papel, y la referencia de una tarjeta que solo pagó la propina sale junto a la propina. Un servidor anterior no manda dirección ni teléfono: el agente nuevo imprime entonces solo el nombre. Desde la 1.7.1 el agente imprime **en paralelo una cola por impresora** (en orden dentro de cada una): una impresora apagada o lenta ya no retrasa a las demás ni hace que el servidor dé por perdidos trabajos que sí estaban por salir. Las impresoras pueden asignarse a un agente concreto (migración 055 del backend).

Desde la 1.7.0 el agente se empareja con un código (`emparejar`), corre como ejecutable único con instalador y se actualiza solo; sigue aceptando `config.json` con token como antes. Desde la 1.6.0 la comanda imprime las opciones elegidas de cada platillo ("+ Medio", "+ Extra queso"), el comensal al que se le sirve y, del segundo tiempo en adelante, un encabezado grande «2.o TIEMPO»; la precuenta y el ticket también listan las opciones. Un agente anterior ignora esos datos y sigue imprimiendo igual. Desde la 1.5.0 un corte cerrado que se reimprime después de corregir pagos sale con las cifras ya ajustadas y una nota de cómo se había cerrado. Desde la 1.4.0 la comanda, la precuenta y el ticket imprimen en negrita el nombre o referencia de la cuenta de mesa (ej. «Fam. Hernández») si la tiene; un agente anterior ignora ese dato y sigue imprimiendo igual.

Las pruebas (`npm test`) cubren la codificación ESC/POS (acentos y eñes), el diseño a 58 y 80 mm, el envío por red contra una impresora simulada, el manejo de fallos y reintentos, y que una comanda no se imprima dos veces si falló la confirmación.

**Todavía no se ha probado con una impresora física ni la ruta USB en Windows** (requieren el equipo real). La primera instalación debe cerrarse con la hoja de prueba de cada impresora.
