// Construye el ejecutable único del agente (Node SEA): un solo .exe que no pide instalar Node.
//
//   node scripts/construir.mjs --servidor https://tu-sistema.up.railway.app [--node RUTA_node.exe] [--salida dist]
//
// - Sin --node usa el Node de esta maquina (sirve para probar aqui). Para Windows desde otro sistema operativo baja
//   node-v<MISMA VERSION>-win-x64.zip de nodejs.org y pasa la ruta de su node.exe: la version debe ser IGUAL a la que corre este script.
// - --servidor se incluye en el ejecutable: quien instala solo escribe el codigo de emparejamiento.
// Guia de uso en instalador/LEEME.md.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};

const servidor = opcion("--servidor") ?? process.env.GH_SERVIDOR;
const nodeBase = resolve(opcion("--node") ?? process.execPath);
const salida = resolve(opcion("--salida") ?? join(raiz, "dist"));
const paraWindows = nodeBase.toLowerCase().endsWith(".exe");
const nombre = paraWindows ? "agente.exe" : "agente";
const version = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).version;

if (servidor && !/^https?:\/\/\S+$/.test(servidor)) {
  console.error("--servidor debe ser una direccion http(s)");
  process.exit(2);
}

const ejecutar = (cmd, cmdArgs, opciones = {}) => {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: raiz, ...opciones });
  if (r.status !== 0) {
    console.error(`Fallo: ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(r.status ?? 1);
  }
};

rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

// 1) Un solo archivo CommonJS con todo el codigo (SEA en Node 24 exige CommonJS).
const bundle = join(salida, "agente.cjs");
await build({
  entryPoints: [join(raiz, "src", "index.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: bundle,
  logLevel: "warning",
  define: { __SERVIDOR_POR_DEFECTO__: JSON.stringify(servidor ?? null), "import.meta.url": "__importMetaUrl" },
  // `import.meta.url` solo se usa fuera del ejecutable (modo desarrollo).
  banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
});

// 2) Blob de SEA y copia del binario de Node.
const configSea = join(salida, "sea-config.json");
writeFileSync(configSea, JSON.stringify({ main: bundle, output: join(salida, "agente.blob"), disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }));
ejecutar(process.execPath, ["--experimental-sea-config", configSea]);
const destino = join(salida, nombre);
copyFileSync(nodeBase, destino);

// 3) Inyeccion. En macOS hay que quitar la firma antes (y volver a firmar para poder probarlo).
const macOS = !paraWindows && process.platform === "darwin";
if (macOS) ejecutar("codesign", ["--remove-signature", destino]);
ejecutar(process.execPath, [
  join(raiz, "node_modules", "postject", "dist", "cli.js"), destino, "NODE_SEA_BLOB", join(salida, "agente.blob"),
  "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", ...(macOS ? ["--macho-segment-name", "NODE_SEA"] : []),
]);
if (macOS) ejecutar("codesign", ["--sign", "-", destino]);

// 4) Hash para el manifiesto de actualizacion (el agente lo verifica antes de reemplazarse).
const sha256 = createHash("sha256").update(readFileSync(destino)).digest("hex");
writeFileSync(join(salida, `${nombre}.sha256`), `${sha256}  ${nombre}\n`);
console.log(`\nListo: ${destino}\nversion  ${version}\nsha256   ${sha256}\nservidor ${servidor ?? "(no incluido: el instalador pedira --servidor)"}\n`);
console.log("Para publicarla: sube el ejecutable a una URL https y define en el servidor:");
console.log(`  AGENTE_ULTIMA_VERSION=${version}\n  AGENTE_URL_DESCARGA=<url https del ${nombre}>\n  AGENTE_SHA256=${sha256}`);
if (paraWindows) console.log("\nFalta firmar el .exe (scripts/firmar.ps1) antes de publicarlo: sin firma Windows SmartScreen avisa.");
