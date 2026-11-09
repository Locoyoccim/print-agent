// Generador de bytes ESC/POS para impresoras termicas. Sin dependencias.

const ESC = 0x1b;
const GS = 0x1d;

// Paginas de codigos: ESC t n. 19 = CP858 (latin con euro, la habitual en Epson/Xprinter para espanol).
export const PAGINAS = { cp850: 2, cp858: 19 };

// CP858 posiciones 0x80..0xFF (CP850 con euro en 0xD5).
const CP858 =
  "ÇüéâäàåçêëèïîìÄÅ" +
  "ÉæÆôöòûùÿÖÜø£Ø×ƒ" +
  "áíóúñÑªº¿®¬½¼¡«»" +
  "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐" +
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤" +
  "ðÐÊËÈ€ÍÎÏ┘┌█▄¦Ì▀" +
  "ÓßÔÒõÕµþÞÚÛÙýÝ¯´" +
  "­±‗¾¶§÷¸°¨·¹³²■ ";

const MAPA = new Map([...CP858].map((c, i) => [c, 0x80 + i]));
// Comillas y guiones tipograficos habituales en nombres copiados de otros sistemas.
const SUSTITUTOS = new Map([["‘", "'"], ["’", "'"], ["“", '"'], ["”", '"'], ["–", "-"], ["—", "-"], ["…", "..."]]);

export function codificar(texto) {
  const bytes = [];
  for (const original of String(texto)) {
    const c = SUSTITUTOS.get(original) ?? original;
    for (const ch of c) {
      const code = ch.codePointAt(0);
      if (ch === "\n") bytes.push(0x0a);
      else if (code >= 0x20 && code < 0x7f) bytes.push(code);
      else if (MAPA.has(ch)) bytes.push(MAPA.get(ch));
      else bytes.push(0x3f); // "?"
    }
  }
  return Buffer.from(bytes);
}

export class Ticket {
  #partes = [];

  constructor({ pagina = PAGINAS.cp858 } = {}) {
    this.#partes.push(Buffer.from([ESC, 0x40]), Buffer.from([ESC, 0x74, pagina]));
  }

  #raw(...bytes) {
    this.#partes.push(Buffer.from(bytes));
    return this;
  }

  alinear(a) {
    return this.#raw(ESC, 0x61, { izq: 0, centro: 1, der: 2 }[a] ?? 0);
  }

  negrita(on = true) {
    return this.#raw(ESC, 0x45, on ? 1 : 0);
  }

  // Multiplicadores de ancho y alto (1 a 8). 2x2 es el "doble" habitual.
  tamano(ancho = 1, alto = 1) {
    return this.#raw(GS, 0x21, ((ancho - 1) << 4) | (alto - 1));
  }

  // Interlineado en puntos (ESC 3 n). ESC @ al iniciar cada ticket lo regresa al de fabrica (1/6 de pulgada, ~4.2 mm).
  interlineado(puntos) {
    return this.#raw(ESC, 0x33, puntos);
  }

  texto(t) {
    this.#partes.push(codificar(t));
    return this;
  }

  linea(t = "") {
    return this.texto(t).#raw(0x0a);
  }

  avanzar(n = 1) {
    return this.#raw(ESC, 0x64, n);
  }

  // Corte parcial despues de avanzar el papel hasta la cuchilla.
  cortar() {
    return this.avanzar(3).#raw(GS, 0x56, 0x42, 0x00);
  }

  // Pulso al cajon de dinero conectado a la impresora.
  abrirCajon() {
    return this.#raw(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  bytes() {
    return Buffer.concat(this.#partes);
  }
}
