; Instalador del agente de impresión de NexoMesa (Inno Setup 6: https://jrsoftware.org/isinfo.php).
; Lo compila GitHub Actions (.github/workflows/publicar.yml). A mano en Windows:  ISCC.exe /DVersion=X.Y.Z agente.iss   (ver LEEME.md)
;
; Instalacion normal:   doble clic, escribir el codigo de Configuracion POS -> Agente de impresion y listo.
; Desatendida:          NexoMesa-Agente-Setup.exe /VERYSILENT /CODIGO=ABCD-2345
; Actualizar a mano:    volver a ejecutar el instalador; con el campo del codigo vacio conserva la configuracion actual.

#ifndef Version
  #define Version "0.0.0"
#endif
; Las imágenes PNG, los colores de fondo y el modo oscuro automático piden Inno Setup 6.5.2 o posterior.
#if Ver < EncodeVer(6, 5, 2)
  #error Hace falta Inno Setup 6.5.2 o posterior (imágenes PNG y colores de marca)
#endif
#define Marca "marca\"

[Setup]
AppId={{6C1E0B7A-7D0B-4B8E-9D55-5C0B6F2A4E11}
AppName=NexoMesa · Agente de impresión
AppVersion={#Version}
AppPublisher=NexoMesa
AppPublisherURL=https://app.nexomesa.app
AppSupportURL=https://github.com/Locoyoccim/print-agent
VersionInfoCompany=NexoMesa
VersionInfoProductName=NexoMesa
VersionInfoDescription=Instalador del agente de impresión de NexoMesa
DefaultDirName={commonpf}\NexoMesa\Agente
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=NexoMesa-Agente-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayName=NexoMesa · Agente de impresión
UninstallDisplayIcon={app}\icono.ico
; Marca (GastronyHub/PRODUCT.md): fondo Arena en modo claro y verde muy oscuro en modo oscuro (sigue el tema de Windows); panel
; lateral en Verde Nexo con el logo. Las imágenes van a 100/150/200/250 % y Inno elige la que mejor queda con la escala de la pantalla.
; Se regeneran con instalador/marca/generar.mjs.
WizardStyle=modern dynamic windows11
WizardBackColor=#F7F2EC
WizardBackColorDynamicDark=#102321
WizardImageFile={#Marca}lateral-100.png,{#Marca}lateral-150.png,{#Marca}lateral-200.png,{#Marca}lateral-250.png
WizardSmallImageFile={#Marca}pequena-100.png,{#Marca}pequena-150.png,{#Marca}pequena-200.png,{#Marca}pequena-250.png
SetupIconFile={#Marca}icono.ico
; Descomentar y ajustar para firmar el instalador (certificado de firma de codigo; ver LEEME.md):
; SignTool=firma $f

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
; Textos de marca (español). Los nombres de pantallas del sistema van tal como aparecen en NexoMesa.
es.BeveledLabel=NexoMesa · Tu negocio. Todo conectado.
es.WelcomeLabel1=Instala el agente de impresión de NexoMesa
es.WelcomeLabel2=Este programa conecta las impresoras de este local con NexoMesa: las comandas y los tickets salen solos, sin abrir puertos ni configurar el router.%n%nTen a la mano el código de instalación (formato XXXX-XXXX) que aparece en NexoMesa, en Configuracion POS > Agente de impresion.
es.FinishedHeadingLabel=El agente quedó instalado
es.FinishedLabelNoIcons=El agente ya está funcionando y arranca solo cada vez que se enciende este equipo.%n%nEn NexoMesa, en Configuracion POS > Agente de impresion, debe aparecer como Conectado. Desde ahí das de alta las impresoras e imprimes una página de prueba.%n%nJunto al reloj de Windows aparece el ícono de NexoMesa: verde si todo está bien, amarillo o rojo si algo falla. Si no lo ves, búscalo en la flecha ^ y arrástralo a la barra.
es.FinishedLabel=El agente ya está funcionando y arranca solo cada vez que se enciende este equipo.%n%nEn NexoMesa, en Configuracion POS > Agente de impresion, debe aparecer como Conectado. Desde ahí das de alta las impresoras e imprimes una página de prueba.%n%nJunto al reloj de Windows aparece el ícono de NexoMesa: verde si todo está bien, amarillo o rojo si algo falla. Si no lo ves, búscalo en la flecha ^ y arrástralo a la barra.

[Files]
Source: "{#Marca}icono.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\agente.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "gh-agente-servicio.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "gh-agente-servicio.xml"; DestDir: "{app}"; Flags: ignoreversion
; Ícono de estado junto al reloj (bandeja/, C# .NET Framework 4.8): solo lee estado.json.
Source: "..\dist\bandeja\NexoMesa-Bandeja.exe"; DestDir: "{app}"; Flags: ignoreversion
; El emparejamiento se hace ANTES de instalar, con una copia temporal: si el codigo es incorrecto no se instala nada.
Source: "..\dist\agente.exe"; Flags: dontcopy

[Dirs]
Name: "{commonappdata}\NexoMesa\agente"
Name: "{commonappdata}\NexoMesa\agente\logs"
Name: "{commonappdata}\NexoMesa\estado"

[Registry]
; El ícono arranca al iniciar sesión cualquier usuario del equipo.
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "NexoMesaBandeja"; ValueData: """{app}\NexoMesa-Bandeja.exe"""; Flags: uninsdeletevalue

[Run]
; config.json trae el token: solo SYSTEM y Administradores (SIDs, valen en cualquier idioma de Windows).
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\NexoMesa\agente"" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F"; Flags: runhidden; StatusMsg: "Protegiendo la configuración..."
; estado.json (para el ícono, sin token): lo escribe solo el servicio (SYSTEM) y lo leen los usuarios (S-1-5-32-545), sin poder cambiarlo.
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\NexoMesa\estado"" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-32-545:(OI)(CI)RX"; Flags: runhidden
Filename: "{app}\gh-agente-servicio.exe"; Parameters: "install"; Flags: runhidden; StatusMsg: "Registrando el servicio..."
; Reinicio automatico si el agente se cae o se reinicia al actualizarse (cualquier salida distinta de 0 cuenta como falla).
Filename: "{sys}\sc.exe"; Parameters: "failure NexoMesaAgente reset= 3600 actions= restart/5000/restart/30000/restart/60000"; Flags: runhidden
Filename: "{sys}\sc.exe"; Parameters: "failureflag NexoMesaAgente 1"; Flags: runhidden
Filename: "{app}\gh-agente-servicio.exe"; Parameters: "start"; Flags: runhidden; StatusMsg: "Iniciando el agente..."
; Abre el ícono ya, con el usuario que instaló (sin permisos de administrador). Instalado a distancia como SYSTEM no hay escritorio:
; aparece en el siguiente inicio de sesión.
Filename: "{app}\NexoMesa-Bandeja.exe"; Flags: nowait runasoriginaluser; Check: HayUsuarioConEscritorio

[UninstallRun]
; Cierra el ícono en todas las sesiones para poder borrar su .exe.
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM NexoMesa-Bandeja.exe"; Flags: runhidden; RunOnceId: "CierraIcono"
Filename: "{app}\gh-agente-servicio.exe"; Parameters: "stop"; Flags: runhidden; RunOnceId: "ParaServicio"
Filename: "{app}\gh-agente-servicio.exe"; Parameters: "uninstall"; Flags: runhidden; RunOnceId: "QuitaServicio"

[UninstallDelete]
; Al desinstalar se borra tambien la configuracion (trae el token del agente): para volver a usarlo se genera un codigo nuevo.
Type: filesandordirs; Name: "{commonappdata}\NexoMesa\agente"
Type: filesandordirs; Name: "{commonappdata}\NexoMesa\estado"

[Code]
var
  PaginaCodigo: TInputQueryWizardPage;
  // Para no dejar el token en disco si se cancela una instalación nueva después de emparejar.
  ConfigPrevia, EmparejadoAhora, InstalacionTerminada: Boolean;

function ParametroCodigo: String;
begin
  Result := ExpandConstant('{param:CODIGO|}');
end;

// Instalado a distancia como SYSTEM (sin sesión de usuario) no se abre el ícono: no habría dónde mostrarlo.
function HayUsuarioConEscritorio: Boolean;
begin
  Result := Pos('systemprofile', Lowercase(GetEnv('USERPROFILE'))) = 0;
end;

function ConfigExistente: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonappdata}\NexoMesa\agente\config.json'));
end;

function InitializeSetup: Boolean;
begin
  ConfigPrevia := ConfigExistente;
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then InstalacionTerminada := True;
end;

// Instalación nueva cancelada (o fallida) después de emparejar: se borra config.json, que trae el token del agente. Si ya había
// una configuración antes (reinstalación), se deja: el servicio instalado la usa.
procedure DeinitializeSetup;
begin
  if EmparejadoAhora and not ConfigPrevia and not InstalacionTerminada then
    DeleteFile(ExpandConstant('{commonappdata}\NexoMesa\agente\config.json'));
end;

procedure InitializeWizard;
begin
  PaginaCodigo := CreateInputQueryPage(wpWelcome, 'Código de instalación',
    'Conecta este equipo con NexoMesa',
    'En NexoMesa entra a Configuracion POS > Agente de impresion, crea un agente (o usa Codigo de instalacion en uno que ya existe) y escribe aquí el código que aparece.' + #13#10#13#10 +
    'Tiene el formato XXXX-XXXX, vale 15 minutos y se usa una sola vez.');
  PaginaCodigo.Add('Código:', False);
  if ParametroCodigo <> '' then PaginaCodigo.Values[0] := ParametroCodigo;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  // Desatendido con /CODIGO=...: no se muestra la pagina (el codigo se valida igual al avanzar).
  Result := (PageID = PaginaCodigo.ID) and (ParametroCodigo <> '');
end;

// Corre icacls sobre una ruta; devuelve True si termino bien.
function Icacls(Ruta, Parametros: String): Boolean;
var
  Codigo2: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\icacls.exe'), '"' + Ruta + '" ' + Parametros, '', SW_HIDE, ewWaitUntilTerminated, Codigo2) and (Codigo2 = 0);
end;

// Deja C:\ProgramData\NexoMesa con dueño Administradores y sin permisos ajenos ANTES de escribir config.json. En ProgramData cualquier
// usuario puede crear carpetas y queda como su dueño: si un usuario sin privilegios las hubiera creado antes, conservaría el control
// y podría leer el token o cambiar el servidor del agente (que corre como SYSTEM y se actualiza desde ese servidor). Por eso se toma
// la posesión, se borran los permisos explícitos y se aplican solo los nuestros. Devuelve '' si salio bien o el mensaje de error.
function ProtegerCarpetas: String;
var
  Raiz: String;
begin
  Result := '';
  Raiz := ExpandConstant('{commonappdata}\NexoMesa');
  ForceDirectories(Raiz + '\agente');
  ForceDirectories(Raiz + '\estado');
  // Dueño Administradores en todo el árbol y permisos de vuelta a los heredados (quita los explícitos de cualquier otro).
  // Raíz: SYSTEM y Administradores control total; Usuarios solo lectura (para llegar a estado). agente: sin Usuarios (lleva el token).
  // estado: Usuarios leen estado.json (el ícono) sin poder cambiarlo.
  if not (Icacls(Raiz, '/setowner *S-1-5-32-544 /T /Q')
      and Icacls(Raiz, '/reset /T /Q')
      and Icacls(Raiz, '/inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-32-545:(OI)(CI)RX /Q')
      and Icacls(Raiz + '\agente', '/inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F /Q')
      and Icacls(Raiz + '\estado', '/inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F *S-1-5-32-545:(OI)(CI)RX /Q')) then
    Result := 'No se pudieron proteger los permisos de ' + Raiz + '. Revisa que ejecutas el instalador como administrador e inténtalo de nuevo.';
end;

// Canjea el codigo con el propio agente.exe (copia temporal) y deja config.json. Devuelve '' si salio bien o el mensaje de error.
function Emparejar(Codigo: String): String;
var
  Salida, Cfg, Comando: String;
  Codigo2: Integer;
  Lineas: TArrayOfString;
begin
  Result := ProtegerCarpetas;
  if Result <> '' then Exit;
  ExtractTemporaryFile('agente.exe');
  Cfg := ExpandConstant('{commonappdata}\NexoMesa\agente\config.json');
  Salida := ExpandConstant('{tmp}\emparejar.txt');
  Comando := '/C ""' + ExpandConstant('{tmp}\agente.exe') + '" emparejar "' + Codigo + '" --config "' + Cfg + '" > "' + Salida + '" 2>&1"';
  if not Exec(ExpandConstant('{cmd}'), Comando, '', SW_HIDE, ewWaitUntilTerminated, Codigo2) then
  begin
    Result := 'No se pudo comprobar el código. Revisa la conexión a internet e inténtalo de nuevo.';
    Exit;
  end;
  if Codigo2 = 0 then
  begin
    Result := '';
    EmparejadoAhora := True;
  end
  else if LoadStringsFromFile(Salida, Lineas) and (GetArrayLength(Lineas) > 0) then Result := Lineas[0]
  else Result := 'No se pudo conectar este equipo con NexoMesa.';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Codigo, Error: String;
begin
  Result := True;
  if CurPageID <> PaginaCodigo.ID then Exit;
  Codigo := Trim(PaginaCodigo.Values[0]);
  if (Codigo = '') and ConfigExistente then Exit; // reinstalar / actualizar: conserva la configuracion
  if Codigo = '' then
  begin
    MsgBox('Escribe el código de instalación que aparece en NexoMesa (formato XXXX-XXXX).', mbError, MB_OK);
    Result := False;
    Exit;
  end;
  Error := Emparejar(Codigo);
  if Error <> '' then
  begin
    MsgBox(Error, mbError, MB_OK);
    Result := False;
  end;
end;

// Desatendido: si el codigo falla, se aborta antes de copiar nada.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo2: Integer;
begin
  // Tambien al reinstalar sin codigo: corrige carpetas que existieran con otro dueño o permisos ajenos.
  Result := ProtegerCarpetas;
  if Result <> '' then Exit;
  if ParametroCodigo <> '' then
  begin
    Result := Emparejar(ParametroCodigo);
    if Result <> '' then Exit;
  end;
  // Reinstalacion: se detiene el servicio para poder reemplazar agente.exe y se cierra el ícono para reemplazar el suyo.
  if FileExists(ExpandConstant('{app}\gh-agente-servicio.exe')) then
    Exec(ExpandConstant('{app}\gh-agente-servicio.exe'), 'stop', '', SW_HIDE, ewWaitUntilTerminated, Codigo2);
  if FileExists(ExpandConstant('{app}\NexoMesa-Bandeja.exe')) then
    Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM NexoMesa-Bandeja.exe', '', SW_HIDE, ewWaitUntilTerminated, Codigo2);
end;
