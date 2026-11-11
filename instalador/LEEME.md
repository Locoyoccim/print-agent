# Instalador del agente de impresión (Windows)

> **Estado:** el código del agente, el emparejamiento y la actualización automática están probados (pruebas automáticas y una prueba
> real en macOS con el ejecutable único). **Lo de esta carpeta (`agente.iss`, el servicio WinSW, la firma) no se ha podido compilar ni
> probar en Windows**: hay que hacerlo una vez en una PC o máquina virtual con Windows y una impresora real antes de entregarlo a un cliente.

## Qué hace

1. El cliente baja `NexoMesa-Agente-Setup.exe` (el enlace sale en **Impresoras → Agentes** cuando está publicado).
2. En el sistema crea un agente → aparece un **código `XXXX-XXXX`** (15 min, un solo uso).
3. Ejecuta el instalador, escribe el código y termina. El instalador **valida el código antes de copiar nada**; instala `agente.exe` en
   `C:\Program Files\NexoMesa\Agente`, guarda `config.json` en `C:\ProgramData\NexoMesa\agente` (solo SYSTEM y
   Administradores) y registra el servicio **NexoMesaAgente** (arranca con Windows y se reinicia solo si falla). Antes de escribir
   `config.json`, el instalador toma la posesión de `C:\ProgramData\NexoMesa` (dueño: Administradores) y reemplaza sus permisos: si
   un usuario sin privilegios hubiera creado antes esas carpetas, pierde todo acceso. Si no lo logra, no instala nada. Si una instalación nueva se cancela después de emparejar, borra `config.json` (trae el token); en una reinstalación lo conserva.
4. Todo es tráfico saliente (HTTPS): no se abren puertos.
5. **Varias PCs:** se ejecuta el instalador en cada una con un código distinto (un agente por PC). Después, en **Impresoras**, cada impresora se asigna a la PC que la alcanza (**PC que la imprime**); sin asignar la toma cualquier agente. Requiere la migración `055_impresora_agente.sql` en el servidor.

Desatendido: `NexoMesa-Agente-Setup.exe /VERYSILENT /CODIGO=ABCD-2345`. Actualizar a mano: volver a ejecutarlo con el código vacío
(conserva la configuración). Normalmente no hace falta: el agente **se actualiza solo** (ver abajo).

## Publicar una versión (automático, GitHub Actions)

El workflow [`.github/workflows/publicar.yml`](../.github/workflows/publicar.yml) construye todo en una máquina Windows de GitHub:
`npm test`, `agente.exe` (con `https://app.nexomesa.app` incluido), prueba `agente.exe --version`, baja WinSW verificando su sha256,
compila el instalador con Inno Setup y calcula los hashes.

1. Sube la versión en `package.json` y `src/api.js` (las dos deben coincidir; el CI de pruebas lo revisa) y fusiona el PR.
2. Crea el tag sobre `main` y súbelo:
   ```bash
   git tag v1.10.1 && git push origin v1.10.1
   ```
3. El workflow crea el Release **como pre-release** con `agente.exe`, `NexoMesa-Agente-Setup.exe` y `SHA256SUMS.txt`. Un pre-release
   no le llega a ningún agente: sirve para probar el instalador en una PC antes de soltarlo.
4. Para desplegarlo: en GitHub edita el Release y marca **Set as the latest release**. Mientras el servidor no lea los Releases solo,
   copia las variables que vienen en las notas del Release al servicio **api** de Railway (`AGENTE_ULTIMA_VERSION`,
   `AGENTE_URL_DESCARGA`, `AGENTE_SHA256`, `AGENTE_INSTALADOR_URL`).

En cada pull request que toca el código o el instalador el mismo workflow solo construye (sin publicar) y deja los archivos como
artefacto del run, para comprobar que compila. Sin firma de código todavía: SmartScreen avisa al ejecutar el instalador.

## Marca del instalador

Las ventanas del asistente usan la marca de NexoMesa:
- fondo Arena en modo claro y verde muy oscuro en modo oscuro (siguen el tema de Windows);
- panel lateral en Verde Nexo con el logo, «NexoMesa» en Fraunces y el lema;
- el ícono de la N en la esquina y en el instalador;
- textos propios en la bienvenida, el código y el final.

Las imágenes están en [`marca/`](marca/) (PNG a 100/150/200/250 % e `icono.ico`) y salen de `marca/plantilla.html` e `icono.svg`
con `marca/generar.mjs` (ver el encabezado del script). En cada PR el workflow deja en el artefacto `capturas-instalador` capturas
reales del asistente en Windows, en modo claro y oscuro.

## Ícono junto al reloj

El instalador también deja `NexoMesa-Bandeja.exe` (código en [`bandeja/`](../bandeja/), C# con .NET Framework 4.8, que ya viene en
Windows 10 y 11). Arranca al iniciar sesión cualquier usuario (`HKLM\...\Run`, valor `NexoMesaBandeja`) y se abre al terminar de instalar.

- **Color:** verde si está conectado y las impresoras responden; amarillo si una impresora falla, o mientras conecta, reconecta
  (primer minuto) o se actualiza; rojo si el agente está detenido o no responde, si lleva más de un minuto sin internet o si NexoMesa
  rechazó su token.
- **Clic (izquierdo o derecho):** el estado, cada impresora con su último fallo, «Abrir NexoMesa» (pantalla de agentes), «Ver últimos
  mensajes» y ocultar el ícono hasta el siguiente inicio de sesión.
- **Avisos emergentes:** solo cuando aparece o cambia un problema, y cuando se resuelve.

Solo **lee** `C:\ProgramData\NexoMesa\estado\estado.json`, que escribe el agente: no tiene el token, no habla con el servidor y el
agente no abre puertos. La carpeta `estado` la escribe solo el servicio; los usuarios solo la leen. Las actualizaciones automáticas
cambian únicamente `agente.exe`: el ícono se actualiza al volver a ejecutar el instalador. Instalado a distancia como SYSTEM, el ícono
aparece en el siguiente inicio de sesión.

En cada PR el workflow corre sus pruebas (`bandeja/pruebas`), lo compila y deja en el artefacto `capturas-instalador` los íconos de
cada color y la ventana de mensajes.

## Construir a mano (en una PC con Windows, o el .exe desde otro sistema)

Requisitos: Node 22+ (la **misma versión** que el `node.exe` que se empaqueta), [Inno Setup 6](https://jrsoftware.org/isinfo.php),
[WinSW](https://github.com/winsw/winsw/releases) (`WinSW-x64.exe`) y, para firmar, `signtool` (Windows SDK) y un certificado de firma de código.

```powershell
cd print-agent
npm install
# 1) agente.exe: usa el node.exe de ESTA PC, o descarga node-v<misma-version>-win-x64.zip y pasa su ruta con --node
node scripts/construir.mjs --servidor https://app.nexomesa.app --salida dist
# 2) firmar agente.exe (ver scripts/firmar.ps1) y anotar el sha256 del archivo FIRMADO
.\scripts\firmar.ps1 -Archivo .\dist\agente.exe -Huella <huella>
# 3) WinSW: copiar WinSW-x64.exe como instalador\gh-agente-servicio.exe (el .xml ya está junto)
# 4) instalador
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DVersion=1.10.0 instalador\agente.iss
.\scripts\firmar.ps1 -Archivo .\dist\NexoMesa-Agente-Setup.exe -Huella <huella>
```

`--servidor` queda **dentro** del ejecutable: quien instala solo escribe el código. Es una sola dirección para todos los clientes (el
sistema es el mismo; cada código ya trae su empresa). Para otro entorno (pruebas) se construye con otra dirección o se usa
`agente.exe emparejar CODIGO --servidor URL`.

## Cómo se actualizan los agentes (y publicar a mano)

1. Sube `agente.exe` **firmado** a una URL **https** estable (GitHub Releases, almacenamiento propio…) y el instalador a otra.
2. En el servidor (variables de entorno): `AGENTE_ULTIMA_VERSION=1.10.0`, `AGENTE_URL_DESCARGA=<url del agente.exe>`,
   `AGENTE_SHA256=<sha256 del agente.exe firmado>`, opcional `AGENTE_VERSION_MINIMA` y `AGENTE_INSTALADOR_URL=<url del instalador>`.
3. Cada agente consulta `GET /api/agente/version` a los 2 min de arrancar y cada 6 h. Si hay versión nueva: descarga, **verifica el
   hash** (si no coincide la descarta), renombra su propio `.exe` a `.anterior`, pone el nuevo y sale con código 3; el servicio lo
   levanta de nuevo. Si la versión nueva no logra mantenerse viva (3 arranques sin llegar a «sana»: primer contacto con el servidor o
   60 s en marcha) **regresa sola a la anterior** y no vuelve a intentar esa versión. En **Impresoras → Agentes** se ve la versión de
   cada agente y avisa cuál está desactualizado.

## Lista de comprobación en Windows (primera vez)

- [ ] El instalador compila y, con un código malo, se queda en la página del código sin copiar nada.
- [ ] Con un código bueno: servicio `NexoMesaAgente` en *Servicios*, en ejecución y en inicio automático; `config.json` solo
      legible por Administradores/SYSTEM (`icacls`); el agente aparece **conectado** en el sistema.
- [ ] Con dos PCs instaladas y cada impresora asignada a la suya, cada PC imprime solo lo suyo (la otra no reclama sus trabajos).
- [ ] Con una impresora de red apagada, las demás siguen imprimiendo sin demora y los trabajos de la apagada quedan con error claro (no duplicados al volver).
- [ ] Imprime una página de prueba en una impresora **de red** y en una **USB** (la ruta USB usa PowerShell: probar con el driver real).
- [ ] Matar `agente.exe` desde el Administrador de tareas: Windows lo levanta solo (comprueba que la recuperación del servicio por
      código de salida ≠ 0 funciona; si no, revisar `sc qfailure NexoMesaAgente`).
- [ ] Actualización: publicar una versión de prueba y comprobar que se instala sola, que el servicio se reinicia (código 3) y que una
      versión rota regresa a la anterior. **Es lo más delicado**: renombrar el `.exe` en uso y el reinicio por código 3 dependen de Windows.
- [ ] SmartScreen no bloquea el instalador firmado.
- [ ] Desinstalar quita el servicio y la carpeta de configuración.
