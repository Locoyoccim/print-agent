; Instalador del agente de impresion de NexoMesa (Inno Setup 6: https://jrsoftware.org/isinfo.php).
; Compilar en Windows con:  ISCC.exe /DVersion=1.8.0 agente.iss   (ver LEEME.md: antes hay que construir y firmar agente.exe)
;
; Instalacion normal:   doble clic, escribir el codigo de Impresoras -> Agentes y listo.
; Desatendida:          NexoMesa-Agente-Setup.exe /VERYSILENT /CODIGO=ABCD-2345
; Actualizar a mano:    volver a ejecutar el instalador; con el campo del codigo vacio conserva la configuracion actual.

#ifndef Version
  #define Version "0.0.0"
#endif

[Setup]
AppId={{6C1E0B7A-7D0B-4B8E-9D55-5C0B6F2A4E11}
AppName=NexoMesa - Agente de impresion
AppVersion={#Version}
AppPublisher=NexoMesa
DefaultDirName={commonpf}\NexoMesa\Agente
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=NexoMesa-Agente-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=NexoMesa - Agente de impresion
; Descomentar y ajustar para firmar el instalador (certificado de firma de codigo; ver LEEME.md):
; SignTool=firma $f

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
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
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\NexoMesa\agente"" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F"; Flags: runhidden; StatusMsg: "Protegiendo la configuracion..."
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
  PaginaCodigo := CreateInputQueryPage(wpWelcome, 'Codigo de emparejamiento',
    'Conecta este equipo con tu sistema',
    'En el sistema entra a Punto de venta > Impresoras > Agentes, crea un agente y escribe aqui el codigo que aparece (formato XXXX-XXXX).' + #13#10 +
    'Vale 15 minutos y se usa una sola vez.');
  PaginaCodigo.Add('Codigo:', False);
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
    Result := 'No se pudo ejecutar el emparejamiento.';
    Exit;
  end;
  if Codigo2 = 0 then Result := ''
  else if LoadStringsFromFile(Salida, Lineas) and (GetArrayLength(Lineas) > 0) then Result := Lineas[0]
  else Result := 'No se pudo emparejar este equipo.';
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
    MsgBox('Escribe el codigo de emparejamiento que genera el sistema.', mbError, MB_OK);
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
