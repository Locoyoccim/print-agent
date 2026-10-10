# Firma un ejecutable (agente.exe o el instalador) con un certificado de firma de codigo, para que Windows SmartScreen no lo bloquee.
# Requiere signtool.exe (Windows SDK) y el certificado ya instalado en el equipo de construccion o un .pfx.
#
#   .\scripts\firmar.ps1 -Archivo .\dist\agente.exe -Huella <huella-del-certificado>
#   .\scripts\firmar.ps1 -Archivo .\dist\agente.exe -Pfx C:\ruta\cert.pfx   (pide la contraseña por consola)
#
# Hay que firmar agente.exe ANTES de compilar el instalador y despues firmar tambien el instalador. Despues de firmar agente.exe,
# su sha256 cambia: calculalo sobre el archivo FIRMADO (Get-FileHash) para AGENTE_SHA256.
param(
  [Parameter(Mandatory = $true)][string]$Archivo,
  [string]$Huella,
  [string]$Pfx,
  [string]$ServidorSello = "http://timestamp.digicert.com"
)
$ErrorActionPreference = "Stop"
$argumentos = @("sign", "/fd", "SHA256", "/tr", $ServidorSello, "/td", "SHA256")
if ($Huella) { $argumentos += @("/sha1", $Huella) }
elseif ($Pfx) {
  $clave = Read-Host "Contraseña del .pfx" -AsSecureString
  $texto = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave))
  $argumentos += @("/f", $Pfx, "/p", $texto)
}
else { throw "Indica -Huella o -Pfx" }
& signtool.exe @args $Archivo
if ($LASTEXITCODE -ne 0) { throw "signtool fallo ($LASTEXITCODE)" }
& signtool.exe verify /pa /v $Archivo | Select-Object -Last 3
Write-Host "sha256 del archivo firmado:" (Get-FileHash $Archivo -Algorithm SHA256).Hash.ToLower()
