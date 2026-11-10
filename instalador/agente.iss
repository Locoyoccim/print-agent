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
es.FinishedLabelNoIcons=El agente ya está funcionando y arranca solo cada vez que se enciende este equipo.%n%nEn NexoMesa, en Configuracion POS > Agente de impresion, debe aparecer como Conectado. Desde ahí das de alta las impresoras e imprimes una página de prueba.
es.FinishedLabel=El agente ya está funcionando y arranca solo cada vez que se enciende este equipo.%n%nEn NexoMesa, en Configuracion POS > Agente de impresion, debe aparecer como Conectado. Desde ahí das de alta las impresoras e imprimes una página de prueba.

[Files]
Source: "{#Marca}icono.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\agente.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "gh-agente-servicio.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "gh-agente-servicio.xml"; DestDir: "{app}"; Flags: ignoreversion
; El emparejamiento se hace ANTES de instalar, con una copia temporal: si el codigo es incorrecto no se instala nada.
Source: "..\dist\agente.exe"; Flags: dontcopy

[Dirs]
Name: "{commonappdata}\NexoMesa\agente"
Name: "{commonappdata}\NexoMesa\agente\logs"

[Run]
; config.json trae el token: solo SYSTEM y Administradores (SIDs, valen en cualquier idioma de Windows).
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\NexoMesa\agente"" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F"; Flags: runhidden; StatusMsg: "Protegiendo la configuración..."
Filename: "{app}\gh-agente-servicio.exe"; Parameters: "install"; Flags: runhidden; StatusMsg: "Registrando el servicio..."
; Reinicio automatico si el agente se cae o se reinicia al actualizarse (cualquier salida distinta de 0 cuenta como falla).
Filename: "{sys}\sc.exe"; Parameters: "failure NexoMesaAgente reset= 3600 actions= restart/5000/restart/30000/restart/60000"; Flags: runhidden
Filename: "{sys}\sc.exe"; Parameters: "failureflag NexoMesaAgente 1"; Flags: runhidden
Filename: "{app}\gh-agente-servicio.exe"; Parameters: "start"; Flags: runhidden; StatusMsg: "Iniciando el agente..."

[UninstallRun]
Filename: "{app}\gh-agente-servicio.exe"; Parameters: "stop"; Flags: runhidden; RunOnceId: "ParaServicio"
Filename: "{app}\gh-agente-servicio.exe"; Parameters: "uninstall"; Flags: runhidden; RunOnceId: "QuitaServicio"

[UninstallDelete]
; Al desinstalar se borra tambien la configuracion (trae el token del agente): para volver a usarlo se genera un codigo nuevo.
Type: filesandordirs; Name: "{commonappdata}\NexoMesa\agente"

[Code]
var
  PaginaCodigo: TInputQueryWizardPage;

function ParametroCodigo: String;
begin
  Result := ExpandConstant('{param:CODIGO|}');
end;

function ConfigExistente: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonappdata}\NexoMesa\agente\config.json'));
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

// Canjea el codigo con el propio agente.exe (copia temporal) y deja config.json. Devuelve '' si salio bien o el mensaje de error.
function Emparejar(Codigo: String): String;
var
  Salida, Cfg, Comando: String;
  Codigo2: Integer;
  Lineas: TArrayOfString;
begin
  ExtractTemporaryFile('agente.exe');
  ForceDirectories(ExpandConstant('{commonappdata}\NexoMesa\agente'));
  Cfg := ExpandConstant('{commonappdata}\NexoMesa\agente\config.json');
  Salida := ExpandConstant('{tmp}\emparejar.txt');
  Comando := '/C ""' + ExpandConstant('{tmp}\agente.exe') + '" emparejar "' + Codigo + '" --config "' + Cfg + '" > "' + Salida + '" 2>&1"';
  if not Exec(ExpandConstant('{cmd}'), Comando, '', SW_HIDE, ewWaitUntilTerminated, Codigo2) then
  begin
    Result := 'No se pudo comprobar el código. Revisa la conexión a internet e inténtalo de nuevo.';
    Exit;
  end;
  if Codigo2 = 0 then Result := ''
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
  Result := '';
  if ParametroCodigo <> '' then
  begin
    Result := Emparejar(ParametroCodigo);
    if Result <> '' then Exit;
  end;
  // Reinstalacion: se detiene el servicio para poder reemplazar agente.exe.
  if FileExists(ExpandConstant('{app}\gh-agente-servicio.exe')) then
    Exec(ExpandConstant('{app}\gh-agente-servicio.exe'), 'stop', '', SW_HIDE, ewWaitUntilTerminated, Codigo2);
end;
