import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { enviar, enviarPorRed, enviarPorUsbWindows } from "../src/transports.js";

// Impresora falsa: un servidor TCP que guarda los bytes que recibe.
function impresoraFalsa({ responder = true } = {}) {
  const recibidos = [];
  const server = net.createServer((socket) => {
    const trozos = [];
    socket.on("data", (d) => trozos.push(d));
    socket.on("end", () => recibidos.push(Buffer.concat(trozos)));
    socket.on("error", () => {});
    if (!responder) socket.pause();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, puerto: server.address().port, recibidos })));
}

test("red: los bytes llegan completos e intactos a la impresora", async () => {
  const { server, puerto, recibidos } = await impresoraFalsa();
  const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256));
  await enviarPorRed({ ip: "127.0.0.1", puerto }, bytes);
  await new Promise((r) => setTimeout(r, 50));
  server.close();
  assert.equal(recibidos.length, 1);
  assert.ok(recibidos[0].equals(bytes));
});

test("red: impresora apagada (conexion rechazada) falla con un mensaje claro", async () => {
  const { server, puerto } = await impresoraFalsa();
  await new Promise((r) => server.close(r));
  await assert.rejects(enviarPorRed({ ip: "127.0.0.1", puerto }, Buffer.from("x")), /No se pudo conectar con 127\.0\.0\.1:\d+ \(ECONNREFUSED\)/);
});

test("red: una IP que no existe se corta por tiempo y no se cuelga", async () => {
  const inicio = Date.now();
  await assert.rejects(enviarPorRed({ ip: "10.255.255.1", puerto: 9100 }, Buffer.from("x"), { timeoutMs: 300 }), /no respondio en 0\.3 s|No se pudo conectar/);
  assert.ok(Date.now() - inicio < 3000);
});

test("usb: fuera de Windows se rechaza con un mensaje claro", async () => {
  await assert.rejects(enviarPorUsbWindows({ nombre_usb: "EPSON" }, Buffer.from("x"), { plataforma: "darwin" }), /solo esta disponible en Windows/);
});

test("usb: en Windows el nombre y el archivo viajan por variables de entorno, no en el script", async () => {
  let llamada;
  const ejecutar = (cmd, args, opts, cb) => {
    llamada = { cmd, args, opts };
    cb(null, "", "");
  };
  const nombre = `EPSON TM-T20"; Remove-Item C:\\ -Recurse #`;
  await enviarPorUsbWindows({ nombre_usb: nombre }, Buffer.from("x"), { plataforma: "win32", ejecutar });
  assert.equal(llamada.cmd, "powershell.exe");
  assert.equal(llamada.opts.env.GH_PRINTER, nombre);
  assert.ok(llamada.opts.env.GH_FILE.endsWith("job.bin"));
  assert.ok(!llamada.args.join(" ").includes("Remove-Item"), "el nombre de la impresora nunca se mezcla con el script");
  assert.ok(llamada.args.includes("-NoProfile"));
});

test("usb: si PowerShell falla, el mensaje del error llega al agente", async () => {
  const ejecutar = (_c, _a, _o, cb) => cb(new Error("fallo"), "", "No se encontro la impresora 'X' en Windows (error 1801)\nlinea 2");
  await assert.rejects(enviarPorUsbWindows({ nombre_usb: "X" }, Buffer.from("x"), { plataforma: "win32", ejecutar }), /No se encontro la impresora 'X'/);
});

test("enviar: elige el transporte segun la conexion", async () => {
  await assert.rejects(enviar({ conexion: "USB", nombre_usb: "X" }, Buffer.from("x"), { plataforma: "linux" }), /solo esta disponible en Windows/);
  const { server, puerto, recibidos } = await impresoraFalsa();
  await enviar({ conexion: "RED", ip: "127.0.0.1", puerto }, Buffer.from("hola"));
  await new Promise((r) => setTimeout(r, 50));
  server.close();
  assert.equal(recibidos[0].toString(), "hola");
});
