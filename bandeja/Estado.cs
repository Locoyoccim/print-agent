// Lectura de estado.json (lo escribe el agente: src/estado.js) y la decisión de color, textos y avisos del ícono.
// No usa ventanas: lo prueban bandeja/pruebas en el CI.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace NexoMesa.Bandeja
{
    [DataContract]
    public sealed class EstadoAgente
    {
        [DataMember(Name = "formato")] public int Formato;
        [DataMember(Name = "version")] public string Version;
        [DataMember(Name = "iniciado")] public string Iniciado;
        [DataMember(Name = "actualizado")] public string Actualizado;
        [DataMember(Name = "detenido")] public bool Detenido;
        [DataMember(Name = "motivo")] public string Motivo;
        [DataMember(Name = "servidor")] public EstadoServidor Servidor;
        [DataMember(Name = "impresoras")] public List<EstadoImpresora> Impresoras;
        [DataMember(Name = "eventos")] public List<EventoAgente> Eventos;
    }

    [DataContract]
    public sealed class EstadoServidor
    {
        [DataMember(Name = "url")] public string Url;
        [DataMember(Name = "conectado")] public bool? Conectado;
        [DataMember(Name = "ultimoContacto")] public string UltimoContacto;
        [DataMember(Name = "error")] public ErrorServidor Error;
    }

    [DataContract]
    public sealed class ErrorServidor
    {
        [DataMember(Name = "mensaje")] public string Mensaje;
        [DataMember(Name = "codigo")] public int? Codigo;
        [DataMember(Name = "desde")] public string Desde;
    }

    [DataContract]
    public sealed class EstadoImpresora
    {
        [DataMember(Name = "clave")] public string Clave;
        [DataMember(Name = "nombre")] public string Nombre;
        [DataMember(Name = "conexion")] public string Conexion;
        [DataMember(Name = "ok")] public bool? Ok;
        [DataMember(Name = "ultimoOk")] public string UltimoOk;
        [DataMember(Name = "ultimoError")] public ErrorImpresora UltimoError;
    }

    [DataContract]
    public sealed class ErrorImpresora
    {
        [DataMember(Name = "mensaje")] public string Mensaje;
        [DataMember(Name = "hora")] public string Hora;
    }

    [DataContract]
    public sealed class EventoAgente
    {
        [DataMember(Name = "hora")] public string Hora;
        [DataMember(Name = "nivel")] public string Nivel;
        [DataMember(Name = "mensaje")] public string Mensaje;
    }

    public static class LectorEstado
    {
        public const int Formato = 1;

        /// <summary>null si el archivo no existe. Se abre sin bloquearlo: el agente lo reemplaza (renombrando) mientras tanto.</summary>
        public static EstadoAgente Leer(string ruta)
        {
            if (!File.Exists(ruta)) return null;
            using (var flujo = new FileStream(ruta, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                return Desde(flujo);
        }

        public static EstadoAgente DesdeTexto(string json)
        {
            using (var flujo = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                return Desde(flujo);
        }

        static EstadoAgente Desde(Stream flujo)
        {
            var serializador = new DataContractJsonSerializer(typeof(EstadoAgente));
            var estado = (EstadoAgente)serializador.ReadObject(flujo);
            if (estado == null) throw new InvalidDataException("estado.json vacío");
            return estado;
        }

        /// <summary>Fecha ISO del agente (UTC) o null.</summary>
        public static DateTime? Fecha(string iso)
        {
            DateTime fecha;
            if (string.IsNullOrEmpty(iso)) return null;
            return DateTime.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out fecha)
                ? fecha
                : (DateTime?)null;
        }
    }

    public enum Nivel { Verde, Amarillo, Rojo }

    public sealed class Resumen
    {
        public Nivel Nivel;
        public string Titulo;
        public string Detalle = "";
        /// <summary>false en estados de paso (conectando, reconectando, actualizando): no merecen un aviso emergente.</summary>
        public bool Avisable = true;
        public string Version;
        /// <summary>Dirección de NexoMesa (solo http/https) o null.</summary>
        public string Url;
        public List<string> Impresoras = new List<string>();

        /// <summary>Texto al pasar el mouse. Windows lo corta a 63 caracteres.</summary>
        public string Tooltip => Recortar("NexoMesa · " + Titulo, 63);

        internal static string Recortar(string texto, int maximo)
        {
            texto = texto ?? "";
            return texto.Length <= maximo ? texto : texto.Substring(0, maximo - 1) + "…";
        }
    }

    public sealed class Aviso
    {
        public string Titulo;
        public string Texto;
        public bool EsProblema;
    }

    public static class Evaluador
    {
        /// <summary>El agente escribe cada 5 s: sin cambios en 30 s está detenido o colgado.</summary>
        public static readonly TimeSpan SinLatido = TimeSpan.FromSeconds(30);
        /// <summary>Un corte de conexión breve se muestra en amarillo; pasado un minuto, en rojo.</summary>
        public static readonly TimeSpan SinConexion = TimeSpan.FromSeconds(60);
        /// <summary>Lo que puede tardar en volver tras actualizarse.</summary>
        public static readonly TimeSpan Actualizacion = TimeSpan.FromMinutes(2);

        const string Servicio = "Revisa el servicio «NexoMesa - Agente de impresion» en Servicios de Windows o reinicia el equipo.";

        /// <param name="hora">Cómo mostrar una hora (por omisión, la hora local HH:mm).</param>
        public static Resumen Evaluar(EstadoAgente e, DateTime ahoraUtc, Func<DateTime, string> hora = null)
        {
            hora = hora ?? (f => f.ToLocalTime().ToString("HH:mm", CultureInfo.InvariantCulture));
            if (e == null)
                return Nuevo(Nivel.Rojo, "El agente no está corriendo", "No se encontró su estado en este equipo. " + Servicio);
            if (e.Formato != LectorEstado.Formato)
                return Nuevo(Nivel.Amarillo, "Versión del agente no reconocida", "Vuelve a ejecutar el instalador de NexoMesa para actualizar el ícono.");

            var r = Base(e, hora);
            var actualizado = LectorEstado.Fecha(e.Actualizado);
            var edad = actualizado.HasValue ? ahoraUtc - actualizado.Value : TimeSpan.MaxValue;

            if (e.Detenido)
            {
                switch (e.Motivo)
                {
                    case "actualizando":
                        return edad < Actualizacion
                            ? Llenar(r, Nivel.Amarillo, "Actualizando el agente…", "Vuelve a funcionar en unos segundos.", false)
                            : Llenar(r, Nivel.Rojo, "El agente no volvió tras actualizarse", Servicio);
                    case "configuracion":
                        return Llenar(r, Nivel.Rojo, "Falta configurar el agente",
                            "Vuelve a ejecutar el instalador con un Codigo de instalacion de NexoMesa (Configuracion POS > Agente de impresion).");
                    case "error":
                        return Llenar(r, Nivel.Rojo, "El agente se detuvo por un error",
                            "Windows lo vuelve a iniciar solo. Si no se recupera, revisa los últimos mensajes.");
                    default:
                        return Llenar(r, Nivel.Rojo, "El agente está detenido", Servicio);
                }
            }

            if (edad > SinLatido)
                return Llenar(r, Nivel.Rojo, "El agente no responde",
                    (actualizado.HasValue ? "Su último reporte fue a las " + hora(actualizado.Value) + ". " : "") + Servicio);

            var s = e.Servidor;
            if (s != null && s.Conectado == false)
            {
                if (s.Error != null && s.Error.Codigo == 401)
                    return Llenar(r, Nivel.Rojo, "NexoMesa no reconoce este agente",
                        "Genera un Codigo de instalacion en Configuracion POS > Agente de impresion y vuelve a ejecutar el instalador.");
                var desde = LectorEstado.Fecha(s.Error?.Desde) ?? ahoraUtc;
                if (ahoraUtc - desde > SinConexion)
                    return Llenar(r, Nivel.Rojo, "Sin conexión con NexoMesa",
                        "Desde las " + hora(desde) + ". Revisa el internet de este equipo." + Motivo(s.Error?.Mensaje));
                return Llenar(r, Nivel.Amarillo, "Reconectando con NexoMesa…", Motivo(s.Error?.Mensaje).Trim(), false);
            }
            if (s == null || s.Conectado == null)
                return Llenar(r, Nivel.Amarillo, "Conectando con NexoMesa…", "", false);

            var fallando = (e.Impresoras ?? new List<EstadoImpresora>()).Where(p => p != null && p.Ok == false).ToList();
            if (fallando.Count == 1)
                return Llenar(r, Nivel.Amarillo, "La impresora " + fallando[0].Nombre + " tiene problemas",
                    fallando[0].UltimoError?.Mensaje ?? "");
            if (fallando.Count > 1)
                return Llenar(r, Nivel.Amarillo, fallando.Count + " impresoras tienen problemas",
                    string.Join(", ", fallando.Select(p => p.Nombre)));

            var contacto = LectorEstado.Fecha(s.UltimoContacto);
            return Llenar(r, Nivel.Verde, "Conectado y listo", contacto.HasValue ? "Último contacto: " + hora(contacto.Value) : "");
        }

        /// <summary>
        /// Qué aviso emergente mostrar al pasar de `anterior` a `actual` (null: ninguno). Solo cuando aparece o cambia un problema y
        /// cuando se resuelve uno que ya se había avisado; los estados de paso (conectando, actualizando) no avisan.
        /// </summary>
        public static Aviso DecidirAviso(Resumen anterior, Resumen actual, ref bool problemaAvisado)
        {
            if (actual.Nivel == Nivel.Verde)
            {
                if (!problemaAvisado) return null;
                problemaAvisado = false;
                return new Aviso { Titulo = "NexoMesa: todo en orden", Texto = "El agente de impresión volvió a funcionar normal.", EsProblema = false };
            }
            if (!actual.Avisable) return null;
            if (anterior != null && anterior.Nivel == actual.Nivel && anterior.Titulo == actual.Titulo && problemaAvisado) return null;
            problemaAvisado = true;
            return new Aviso
            {
                Titulo = Resumen.Recortar("NexoMesa: " + actual.Titulo, 63),
                Texto = Resumen.Recortar(string.IsNullOrEmpty(actual.Detalle) ? actual.Titulo : actual.Detalle, 255),
                EsProblema = true,
            };
        }

        /// <summary>Solo direcciones web: el ícono nunca abre otra cosa con lo que diga el archivo.</summary>
        public static string UrlSegura(string url)
        {
            Uri uri;
            if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out uri)) return null;
            if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) return null;
            return uri.GetLeftPart(UriPartial.Authority);
        }

        /// <summary>Pantalla de agentes de NexoMesa.</summary>
        public static string UrlAgentes(string url)
        {
            var base_ = UrlSegura(url);
            return base_ == null ? null : base_ + "/pos/configuracion?seccion=agentes";
        }

        static string Motivo(string mensaje) => string.IsNullOrEmpty(mensaje) ? "" : " (" + Resumen.Recortar(mensaje, 120) + ")";

        static Resumen Nuevo(Nivel nivel, string titulo, string detalle) => new Resumen { Nivel = nivel, Titulo = titulo, Detalle = detalle };

        static Resumen Base(EstadoAgente e, Func<DateTime, string> hora)
        {
            var r = new Resumen { Version = e.Version, Url = UrlSegura(e.Servidor?.Url) };
            foreach (var p in e.Impresoras ?? new List<EstadoImpresora>())
            {
                if (p == null) continue;
                var nombre = Resumen.Recortar(p.Nombre ?? "Impresora", 40) + (p.Conexion == "USB" ? " (USB)" : "");
                if (p.Ok == true) r.Impresoras.Add("✓ " + nombre);
                else if (p.Ok == false)
                {
                    var cuando = LectorEstado.Fecha(p.UltimoError?.Hora);
                    r.Impresoras.Add("✗ " + nombre + ": " + Resumen.Recortar(p.UltimoError?.Mensaje ?? "falló", 70)
                        + (cuando.HasValue ? " (" + hora(cuando.Value) + ")" : ""));
                }
                else r.Impresoras.Add("• " + nombre);
            }
            return r;
        }

        static Resumen Llenar(Resumen r, Nivel nivel, string titulo, string detalle, bool avisable = true)
        {
            r.Nivel = nivel;
            r.Titulo = titulo;
            r.Detalle = detalle ?? "";
            r.Avisable = avisable;
            return r;
        }
    }
}
