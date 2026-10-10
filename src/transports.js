import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Impresora de red: los bytes ESC/POS van directo por TCP (normalmente puerto 9100).
// El timeout de un socket no lo cierra por si solo: se destruye a mano.
export function enviarPorRed({ ip, puerto = 9100 }, bytes, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: puerto });
    let terminado = false;
    const fin = (error) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(timeoutMs, () => fin(new Error(`La impresora ${ip}:${puerto} no respondio en ${timeoutMs / 1000} s`)));
    socket.once("error", (e) => fin(new Error(`No se pudo conectar con ${ip}:${puerto} (${e.code ?? e.message})`)));
    socket.once("connect", () => socket.end(bytes, () => fin()));
  });
}

// Impresora USB en Windows: se escribe RAW en la cola del spooler con winspool.drv (sin driver grafico).
const POWERSHELL_RAW = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFO { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)] public static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, IntPtr bytes, int count, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("No se encontro la impresora '" + printer + "' en Windows (error " + Marshal.GetLastWin32Error() + ")");
    try {
      var di = new DOCINFO { pDocName = "NexoMesa", pDataType = "RAW" };
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter fallo (" + Marshal.GetLastWin32Error() + ")");
      try {
        StartPagePrinter(h);
        IntPtr p = Marshal.AllocCoTaskMem(data.Length);
        try { Marshal.Copy(data, 0, p, data.Length); int w; if (!WritePrinter(h, p, data.Length, out w) || w != data.Length) throw new Exception("WritePrinter fallo (" + Marshal.GetLastWin32Error() + ")"); }
        finally { Marshal.FreeCoTaskMem(p); }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
[RawPrinter]::Send($env:GH_PRINTER, [System.IO.File]::ReadAllBytes($env:GH_FILE))
`;

export async function enviarPorUsbWindows({ nombre_usb: nombre }, bytes, { timeoutMs = 20000, plataforma = process.platform, ejecutar = execFile } = {}) {
  if (plataforma !== "win32") throw new Error("La impresion USB solo esta disponible en Windows");
  const dir = await mkdtemp(join(tmpdir(), "gh-print-"));
  const archivo = join(dir, "job.bin");
  try {
    await writeFile(archivo, bytes);
    // Nombre de impresora y archivo viajan por variables de entorno: nunca se interpolan en el script.
    await new Promise((resolve, reject) => {
      ejecutar(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", POWERSHELL_RAW],
        { timeout: timeoutMs, windowsHide: true, env: { ...process.env, GH_PRINTER: nombre, GH_FILE: archivo } },
        (error, _stdout, stderr) => (error ? reject(new Error((stderr || error.message).toString().trim().split("\n")[0])) : resolve()),
      );
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function enviar(impresora, bytes, opciones) {
  if (impresora.conexion === "USB") return enviarPorUsbWindows(impresora, bytes, opciones);
  return enviarPorRed(impresora, bytes, opciones);
}
