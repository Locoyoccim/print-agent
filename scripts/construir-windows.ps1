# Construye TODO en una PC con Windows: agente.exe + instalador (NexoMesa-Agente-Setup.exe) y muestra las variables para publicar.
#
#   .\scripts\construir-windows.ps1                       (sin firmar: SmartScreen avisara; sirve para probar)
#   .\scripts\construir-windows.ps1 -Huella <huella>      (firma agente.exe e instalador con tu certificado)
#
# Requisitos: Node.js 22+ (el mismo Node que corre este script se empaqueta en agente.exe) e Inno Setup 6.
# WinSW se descarga solo si no esta en instalador\gh-agente-servicio.exe.
param(
  [string]$Servidor = "https://web-production-3f7840.up.railway.app",
  [string]$Huella,
  [string]$Pfx
)
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$paso = 0
function Paso($texto) { $script:paso++; Write-Host ""; Write-Host "[$script:paso] $texto" -ForegroundColor Cyan }

Paso "Comprobando Node.js"
$nodeVersion = (node --version).TrimStart("v")
if ([int]($nodeVersion.Split(".")[0]) -lt 22) { throw "Hace falta Node.js 22 o superior (tienes $nodeVersion). Instalalo desde https://nodejs.org" }
Write-Host "Node $nodeVersion"

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Version del agente: $version"

Paso "Instalando dependencias de construccion"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install fallo" }

Paso "Construyendo agente.exe (servidor: $Servidor)"
node scripts/construir.mjs --servidor $Servidor --salida dist
if ($LASTEXITCODE -ne 0) { throw "La construccion de agente.exe fallo" }
$exe = Join-Path $raiz "dist\agente.exe"
if (-not (Test-Path $exe)) { throw "No se genero $exe (se construyo con el node.exe de esta PC: debe ser Windows)" }
& $exe --version

$firmar = [bool]($Huella -or $Pfx)
function Firmar($archivo) {
  if (-not $firmar) { return }
  if ($Huella) { & "$PSScriptRoot\firmar.ps1" -Archivo $archivo -Huella $Huella } else { & "$PSScriptRoot\firmar.ps1" -Archivo $archivo -Pfx $Pfx }
}
if ($firmar) { Paso "Firmando agente.exe"; Firmar $exe } else { Write-Host "Sin firma: SmartScreen avisara al ejecutar el instalador (solo para pruebas)." -ForegroundColor Yellow }

Paso "Preparando el servicio de Windows (WinSW)"
$winsw = Join-Path $raiz "instalador\gh-agente-servicio.exe"
if (-not (Test-Path $winsw)) {
  $url = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"
  Write-Host "Descargando WinSW v2.12.0 desde GitHub..."
  try { Invoke-WebRequest -Uri $url -OutFile $winsw -UseBasicParsing }
  catch { throw "No se pudo bajar WinSW. Descarga WinSW-x64.exe de https://github.com/winsw/winsw/releases y copialo como $winsw" }
}
Write-Host "WinSW listo: $winsw"

Paso "Compilando el instalador con Inno Setup"
$iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "No se encontro Inno Setup 6. Instalalo con:  winget install --id JRSoftware.InnoSetup -e   (o desde https://jrsoftware.org/isinfo.php)" }
& $iscc "/DVersion=$version" "instalador\agente.iss"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup fallo ($LASTEXITCODE)" }
$instalador = Join-Path $raiz "dist\NexoMesa-Agente-Setup.exe"
if (-not (Test-Path $instalador)) { throw "No se genero $instalador" }
if ($firmar) { Paso "Firmando el instalador"; Firmar $instalador }

$sha = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
Write-Host ""
Write-Host "LISTO" -ForegroundColor Green
Write-Host "  Agente:     $exe"
Write-Host "  Instalador: $instalador"
Write-Host ""
Write-Host "Para publicar la actualizacion automatica: sube agente.exe y el instalador a URLs https publicas y define en Railway (servicio api):"
Write-Host "  AGENTE_ULTIMA_VERSION=$version"
Write-Host "  AGENTE_URL_DESCARGA=<url https de agente.exe>"
Write-Host "  AGENTE_SHA256=$sha"
Write-Host "  AGENTE_INSTALADOR_URL=<url https del instalador>"
