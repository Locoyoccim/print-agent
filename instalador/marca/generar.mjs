// Exporta las imágenes de marca del instalador a partir de plantilla.html e icono.svg:
//   lateral-*.png  panel izquierdo de las páginas de bienvenida y final (WizardImageFile), a 100/150/200/250 %
//   pequena-*.png  ícono de la esquina en las demás páginas (WizardSmallImageFile)
//   icono.ico      ícono de Setup, de la desinstalación y de «Aplicaciones» de Windows (SetupIconFile)
//
// No se corre en el CI: los archivos generados se versionan. Para regenerarlos hace falta Playwright con Chromium (no es dependencia
// del agente). Por ejemplo, con el Playwright del front:
//   PLAYWRIGHT=../GastronyHub/node_modules/playwright node instalador/marca/generar.mjs
// (opcional CHROMIUM=/ruta/al/ejecutable si el navegador de Playwright no está instalado).
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.PLAYWRIGHT ?? "playwright"));

// Tamaños a 100 % (Inno Setup 6.7: panel lateral 164×314, esquina 58×58) y sus escalas; Inno elige el que mejor quede.
const ESCALAS = [100, 150, 200, 250];
const LATERAL = { w: 164, h: 314 };
const PEQUENA = { w: 58, h: 58 };
const ICO = [16, 20, 24, 32, 40, 48, 64, 128, 256];

const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const pagina = await navegador.newPage({ deviceScaleFactor: 1 });

async function exportar(pieza, w, h, salida, { fondoTransparente = true } = {}) {
  await pagina.setViewportSize({ width: w, height: h });
  const url = `${pathToFileURL(join(dir, "plantilla.html")).href}?pieza=${pieza}&w=${w}&h=${h}`;
  await pagina.goto(url, { waitUntil: "networkidle" });
  await pagina.evaluate(() => document.fonts.ready);
  const png = await pagina.screenshot({ omitBackground: fondoTransparente, clip: { x: 0, y: 0, width: w, height: h } });
  if (salida) writeFileSync(join(dir, salida), png);
  return png;
}

for (const e of ESCALAS) {
  const f = e / 100;
  await exportar("lateral", Math.round(LATERAL.w * f), Math.round(LATERAL.h * f), `lateral-${e}.png`, { fondoTransparente: false });
  await exportar("pequena", Math.round(PEQUENA.w * f), Math.round(PEQUENA.h * f), `pequena-${e}.png`);
}

// ICO con imágenes PNG dentro (válido desde Windows Vista): cabecera de 6 bytes + 16 por imagen + los PNG.
const pngs = [];
for (const t of ICO) pngs.push({ t, datos: await exportar("pequena", t, t, null) });
await navegador.close();

const cabecera = Buffer.alloc(6);
cabecera.writeUInt16LE(0, 0);
cabecera.writeUInt16LE(1, 2); // 1 = icono
cabecera.writeUInt16LE(pngs.length, 4);
let desplazamiento = 6 + 16 * pngs.length;
const entradas = pngs.map(({ t, datos }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(t >= 256 ? 0 : t, 0); // 0 = 256
  e.writeUInt8(t >= 256 ? 0 : t, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); // planos
  e.writeUInt16LE(32, 6); // bits por pixel
  e.writeUInt32LE(datos.length, 8);
  e.writeUInt32LE(desplazamiento, 12);
  desplazamiento += datos.length;
  return e;
});
writeFileSync(join(dir, "icono.ico"), Buffer.concat([cabecera, ...entradas, ...pngs.map((p) => p.datos)]));

const tam = (f) => `${(readFileSync(join(dir, f)).length / 1024).toFixed(1)} KB`;
console.log(`Listo: lateral-{${ESCALAS}}.png, pequena-{${ESCALAS}}.png, icono.ico (${tam("icono.ico")})`);
