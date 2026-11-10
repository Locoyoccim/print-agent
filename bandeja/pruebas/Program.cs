// Pruebas de bandeja/Estado.cs: qué color, textos y avisos muestra el ícono para cada estado.json posible.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace NexoMesa.Bandeja.Pruebas
{
    static class Program
    {
        static int fallas;
        static int total;
        static readonly DateTime Ahora = new DateTime(2026, 11, 9, 18, 0, 0, DateTimeKind.Utc);
        static string Hora(DateTime f) => f.ToString("HH:mm", CultureInfo.InvariantCulture);

        static void Prueba(string nombre, Action cuerpo)
        {
            total++;
            try { cuerpo(); Console.WriteLine("ok    " + nombre); }
            catch (Exception e) { fallas++; Console.WriteLine("FALLA " + nombre + "\n      " + e.Message); }
        }

        static void Igual<T>(T esperado, T real, string que = "")
        {
            if (!EqualityComparer<T>.Default.Equals(esperado, real))
                throw new Exception(que + " esperaba «" + esperado + "» y fue «" + real + "»");
        }

        static void Contiene(string texto, string parte)
        {
            if (texto == null || texto.IndexOf(parte, StringComparison.Ordinal) < 0) throw new Exception("«" + texto + "» no contiene «" + parte + "»");
        }

        static string Iso(DateTime f) => f.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        static string Hace(int segundos) => Iso(Ahora.AddSeconds(-segundos));

        // estado.json como lo escribe el agente (src/estado.js), con lo que cada prueba cambie.
        static string Json(string servidor = null, string impresoras = "[]", bool detenido = false, string motivo = null, int edad = 2, int formato = 1)
        {
            servidor = servidor ?? "{\"url\":\"https://app.nexomesa.app\",\"conectado\":true,\"ultimoContacto\":\"" + Hace(2) + "\",\"error\":null}";
            return "{\"formato\":" + formato + ",\"version\":\"1.11.0\",\"pid\":4321,\"iniciado\":\"" + Hace(600) + "\",\"actualizado\":\"" + Hace(edad) + "\","
                + "\"detenido\":" + (detenido ? "true" : "false") + ",\"motivo\":" + (motivo == null ? "null" : "\"" + motivo + "\"") + ","
                + "\"servidor\":" + servidor + ",\"impresoras\":" + impresoras + ","
                + "\"eventos\":[{\"hora\":\"" + Hace(5) + "\",\"nivel\":\"info\",\"mensaje\":\"Impreso COMANDA #12 en Cocina\"}],\"campoNuevo\":{\"x\":1}}";
        }

        static Resumen Evaluar(string json) => Evaluador.Evaluar(LectorEstado.DesdeTexto(json), Ahora, Hora);

        static int Main()
        {
            Prueba("sin archivo: rojo", () =>
            {
                var r = Evaluador.Evaluar(null, Ahora, Hora);
                Igual(Nivel.Rojo, r.Nivel);
                Contiene(r.Titulo, "no está corriendo");
            });

            Prueba("lee el JSON del agente (campos nulos y campos desconocidos)", () =>
            {
                var e = LectorEstado.DesdeTexto(Json());
                Igual("1.11.0", e.Version);
                Igual(true, e.Servidor.Conectado);
                Igual(null, e.Servidor.Error);
                Igual(1, e.Eventos.Count);
                Igual("Impreso COMANDA #12 en Cocina", e.Eventos[0].Mensaje);
            });

            Prueba("conectado y sin problemas: verde con la hora del último contacto", () =>
            {
                var r = Evaluar(Json());
                Igual(Nivel.Verde, r.Nivel);
                Igual("Conectado y listo", r.Titulo);
                Igual("Último contacto: 17:59", r.Detalle);
                Igual("1.11.0", r.Version);
                Igual("https://app.nexomesa.app", r.Url);
                Igual("NexoMesa · Conectado y listo", r.Tooltip);
            });

            Prueba("sin latido en más de 30 s: rojo «no responde»", () =>
            {
                Igual(Nivel.Verde, Evaluar(Json(edad: 29)).Nivel);
                var r = Evaluar(Json(edad: 31));
                Igual(Nivel.Rojo, r.Nivel);
                Contiene(r.Titulo, "no responde");
                Contiene(r.Detalle, "17:59");
            });

            Prueba("detenido: cada motivo con su texto; actualizando es amarillo y sin aviso, y rojo si tarda", () =>
            {
                var a = Evaluar(Json(detenido: true, motivo: "actualizando", edad: 20));
                Igual(Nivel.Amarillo, a.Nivel);
                Igual(false, a.Avisable);
                Igual(Nivel.Rojo, Evaluar(Json(detenido: true, motivo: "actualizando", edad: 180)).Nivel);
                Contiene(Evaluar(Json(detenido: true, motivo: "configuracion")).Titulo, "Falta configurar");
                Contiene(Evaluar(Json(detenido: true, motivo: "error")).Titulo, "por un error");
                var d = Evaluar(Json(detenido: true, motivo: "detenido"));
                Igual(Nivel.Rojo, d.Nivel);
                Contiene(d.Detalle, "Servicios de Windows");
            });

            Prueba("token rechazado (401): rojo con cómo arreglarlo", () =>
            {
                var r = Evaluar(Json(servidor: "{\"url\":\"https://app.nexomesa.app\",\"conectado\":false,\"ultimoContacto\":null,\"error\":{\"mensaje\":\"Token invalido\",\"codigo\":401,\"desde\":\"" + Hace(5) + "\"}}"));
                Igual(Nivel.Rojo, r.Nivel);
                Contiene(r.Titulo, "no reconoce");
                Contiene(r.Detalle, "Codigo de instalacion");
            });

            Prueba("sin conexión: amarillo sin aviso el primer minuto, luego rojo con la hora", () =>
            {
                Func<int, string> sinRed = s => "{\"url\":\"https://app.nexomesa.app\",\"conectado\":false,\"ultimoContacto\":\"" + Hace(s + 2) + "\",\"error\":{\"mensaje\":\"Sin conexion con el servidor (ENOTFOUND)\",\"codigo\":0,\"desde\":\"" + Hace(s) + "\"}}";
                var breve = Evaluar(Json(servidor: sinRed(20)));
                Igual(Nivel.Amarillo, breve.Nivel);
                Igual(false, breve.Avisable);
                Contiene(breve.Detalle, "ENOTFOUND");
                var largo = Evaluar(Json(servidor: sinRed(90)));
                Igual(Nivel.Rojo, largo.Nivel);
                Contiene(largo.Titulo, "Sin conexión");
                Contiene(largo.Detalle, "17:58");
            });

            Prueba("recién arrancado (conexión desconocida): amarillo «Conectando» sin aviso", () =>
            {
                var r = Evaluar(Json(servidor: "{\"url\":\"https://app.nexomesa.app\",\"conectado\":null,\"ultimoContacto\":null,\"error\":null}"));
                Igual(Nivel.Amarillo, r.Nivel);
                Contiene(r.Titulo, "Conectando");
                Igual(false, r.Avisable);
            });

            Prueba("impresoras: una con falla da amarillo con su nombre; dos, el conteo; las líneas del menú", () =>
            {
                var cocina = "{\"clave\":\"id:7\",\"nombre\":\"Cocina\",\"conexion\":\"RED\",\"ok\":false,\"ultimoOk\":null,\"ultimoError\":{\"mensaje\":\"La impresora 192.168.1.50:9100 no respondio en 8 s\",\"hora\":\"" + Hace(30) + "\"}}";
                var caja = "{\"clave\":\"id:3\",\"nombre\":\"Caja\",\"conexion\":\"USB\",\"ok\":true,\"ultimoOk\":\"" + Hace(60) + "\",\"ultimoError\":null}";
                var barra = "{\"clave\":\"id:9\",\"nombre\":\"Barra\",\"conexion\":\"RED\",\"ok\":false,\"ultimoOk\":null,\"ultimoError\":{\"mensaje\":\"apagada\",\"hora\":\"" + Hace(10) + "\"}}";
                var una = Evaluar(Json(impresoras: "[" + caja + "," + cocina + "]"));
                Igual(Nivel.Amarillo, una.Nivel);
                Igual("La impresora Cocina tiene problemas", una.Titulo);
                Contiene(una.Detalle, "no respondio");
                Igual(true, una.Avisable);
                Igual("✓ Caja (USB)", una.Impresoras[0]);
                Igual("✗ Cocina: La impresora 192.168.1.50:9100 no respondio en 8 s (17:59)", una.Impresoras[1]);
                var dos = Evaluar(Json(impresoras: "[" + cocina + "," + barra + "]"));
                Igual("2 impresoras tienen problemas", dos.Titulo);
                Igual("Cocina, Barra", dos.Detalle);
            });

            Prueba("otro formato de archivo: amarillo pidiendo actualizar", () =>
            {
                var r = Evaluar(Json(formato: 2));
                Igual(Nivel.Amarillo, r.Nivel);
                Contiene(r.Titulo, "no reconocida");
            });

            Prueba("el texto al pasar el mouse nunca pasa de 63 caracteres", () =>
            {
                var largo = "{\"clave\":\"id:1\",\"nombre\":\"" + new string('X', 80) + "\",\"conexion\":\"RED\",\"ok\":false,\"ultimoOk\":null,\"ultimoError\":{\"mensaje\":\"m\",\"hora\":\"" + Hace(1) + "\"}}";
                var r = Evaluar(Json(impresoras: "[" + largo + "]"));
                Igual(63, r.Tooltip.Length);
                Contiene(r.Tooltip, "…");
            });

            Prueba("solo abre direcciones web: https o http, y siempre la pantalla de agentes", () =>
            {
                Igual("https://app.nexomesa.app/pos/configuracion?seccion=agentes", Evaluador.UrlAgentes("https://app.nexomesa.app/"));
                Igual("https://app.nexomesa.app/pos/configuracion?seccion=agentes", Evaluador.UrlAgentes("https://app.nexomesa.app/otra/ruta?x=1"));
                Igual(null, Evaluador.UrlAgentes("file:///C:/Windows/System32/calc.exe"));
                Igual(null, Evaluador.UrlAgentes("C:\\Windows\\System32\\calc.exe"));
                Igual(null, Evaluador.UrlAgentes("javascript:alert(1)"));
                Igual(null, Evaluador.UrlAgentes(null));
                Igual(null, Evaluar(Json(servidor: "{\"url\":\"cmd.exe\",\"conectado\":true,\"ultimoContacto\":\"" + Hace(1) + "\",\"error\":null}")).Url);
            });

            Prueba("avisos: no al arrancar ni en estados de paso; sí al aparecer o cambiar un problema y al resolverse", () =>
            {
                var avisado = false;
                var conectando = new Resumen { Nivel = Nivel.Amarillo, Titulo = "Conectando con NexoMesa…", Avisable = false };
                var verde = new Resumen { Nivel = Nivel.Verde, Titulo = "Conectado y listo" };
                var cocina = new Resumen { Nivel = Nivel.Amarillo, Titulo = "La impresora Cocina tiene problemas", Detalle = "apagada" };
                var sinRed = new Resumen { Nivel = Nivel.Rojo, Titulo = "Sin conexión con NexoMesa", Detalle = "Desde las 17:58." };
                var reconectando = new Resumen { Nivel = Nivel.Amarillo, Titulo = "Reconectando con NexoMesa…", Avisable = false };

                Igual(null, Evaluador.DecidirAviso(null, conectando, ref avisado), "al arrancar");
                Igual(null, Evaluador.DecidirAviso(conectando, verde, ref avisado), "conectó");
                var a = Evaluador.DecidirAviso(verde, cocina, ref avisado);
                Igual(true, a.EsProblema);
                Igual("NexoMesa: La impresora Cocina tiene problemas", a.Titulo);
                Igual("apagada", a.Texto);
                Igual(null, Evaluador.DecidirAviso(cocina, cocina, ref avisado), "mismo problema");
                Igual(true, Evaluador.DecidirAviso(cocina, sinRed, ref avisado) != null, "otro problema");
                Igual(null, Evaluador.DecidirAviso(sinRed, reconectando, ref avisado), "de paso");
                var resuelto = Evaluador.DecidirAviso(reconectando, verde, ref avisado);
                Igual(false, resuelto.EsProblema);
                Contiene(resuelto.Titulo, "todo en orden");
                Igual(null, Evaluador.DecidirAviso(verde, verde, ref avisado), "sigue bien");
                Igual(true, Evaluador.DecidirAviso(null, sinRed, ref avisado) != null, "arrancar con un problema sí avisa");
            });

            Prueba("lee el archivo aunque el agente lo tenga abierto, y null si no existe", () =>
            {
                var ruta = Path.Combine(Path.GetTempPath(), "nexomesa-estado-" + Guid.NewGuid().ToString("N") + ".json");
                Igual(null, LectorEstado.Leer(ruta));
                File.WriteAllText(ruta, Json());
                try
                {
                    using (new FileStream(ruta, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite | FileShare.Delete))
                        Igual("1.11.0", LectorEstado.Leer(ruta).Version);
                }
                finally { File.Delete(ruta); }
            });

            Console.WriteLine();
            Console.WriteLine((total - fallas) + " de " + total + " pruebas del ícono pasaron");
            return fallas == 0 ? 0 : 1;
        }
    }
}
