import test from "node:test";
import assert from "node:assert/strict";
import { Ticket, codificar } from "../src/escpos.js";

test("escpos: ASCII pasa tal cual y el salto de linea es 0x0A", () => {
  assert.deepEqual([...codificar("Ab 1\n")], [0x41, 0x62, 0x20, 0x31, 0x0a]);
});

test("escpos: acentos y eñes del español en CP858", () => {
  assert.deepEqual([...codificar("áéíóú")], [0xa0, 0x82, 0xa1, 0xa2, 0xa3]);
  assert.deepEqual([...codificar("ñÑ¿¡ü")], [0xa4, 0xa5, 0xa8, 0xad, 0x81]);
  assert.deepEqual([...codificar("ÁÉÍÓÚ")], [0xb5, 0x90, 0xd6, 0xe0, 0xe9]);
  assert.deepEqual([...codificar("€")], [0xd5]);
});

test("escpos: lo que no existe en la pagina sale como '?', y las comillas tipograficas se normalizan", () => {
  assert.deepEqual([...codificar("日")], [0x3f]);
  assert.equal(codificar("“hola” — ‘x’").toString("latin1"), '"hola" - \'x\'');
});

test("escpos: un texto nunca puede inyectar comandos: los caracteres de control salen como '?'", () => {
  assert.deepEqual([...codificar("a\u0007b\u001bc")], [0x61, 0x3f, 0x62, 0x3f, 0x63]);
});

test("escpos: inicia con ESC @ y selecciona la pagina de codigos", () => {
  assert.deepEqual([...new Ticket().bytes()], [0x1b, 0x40, 0x1b, 0x74, 19]);
  assert.deepEqual([...new Ticket({ pagina: 2 }).bytes().subarray(2)], [0x1b, 0x74, 2]);
});

test("escpos: alineacion, negrita, tamano, corte y cajon", () => {
  const t = new Ticket().alinear("centro").negrita(true).tamano(2, 2).negrita(false).cortar().abrirCajon();
  assert.deepEqual([...t.bytes().subarray(5)], [
    0x1b, 0x61, 1,
    0x1b, 0x45, 1,
    0x1d, 0x21, 0x11,
    0x1b, 0x45, 0,
    0x1b, 0x64, 3, 0x1d, 0x56, 0x42, 0x00,
    0x1b, 0x70, 0x00, 0x19, 0xfa,
  ]);
});

test("escpos: tamano solo alto (1x2) = 0x01", () => {
  assert.deepEqual([...new Ticket().tamano(1, 2).bytes().subarray(5)], [0x1d, 0x21, 0x01]);
});
