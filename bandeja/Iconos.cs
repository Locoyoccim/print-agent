// Íconos del área de notificación: la N de NexoMesa (instalador/marca/pequena-250.png) con un punto de color abajo a la derecha.
// Se parte del PNG y no del .ico: el .ico de la marca guarda sus imágenes como PNG y así no depende de cómo las lea System.Drawing.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

namespace NexoMesa.Bandeja
{
    static class Iconos
    {
        // Colores de estado (no son de la paleta de marca: verde, ámbar y rojo se leen igual en cualquier fondo de la barra).
        static readonly Dictionary<Nivel, Color> Colores = new Dictionary<Nivel, Color>
        {
            { Nivel.Verde, Color.FromArgb(0x16, 0xA3, 0x4A) },
            { Nivel.Amarillo, Color.FromArgb(0xF5, 0x9E, 0x0B) },
            { Nivel.Rojo, Color.FromArgb(0xDC, 0x26, 0x26) },
        };

        static readonly Dictionary<Nivel, Icon> Cache = new Dictionary<Nivel, Icon>();

        static Image marca;

        static Image ImagenMarca()
        {
            if (marca == null)
                using (var flujo = typeof(Iconos).Assembly.GetManifestResourceStream("NexoMesa.Bandeja.marca.png"))
                using (var leida = Image.FromStream(flujo))
                    marca = new Bitmap(leida);
            return marca;
        }

        /// <summary>La N sin punto (ícono de la ventana de mensajes).</summary>
        public static Icon Marca(int tamano)
        {
            using (var bmp = new Bitmap(tamano, tamano, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.DrawImage(ImagenMarca(), new Rectangle(0, 0, tamano, tamano));
                }
                return Icon.FromHandle(bmp.GetHicon());
            }
        }

        public static Icon De(Nivel nivel)
        {
            Icon icono;
            if (!Cache.TryGetValue(nivel, out icono))
            {
                using (var bmp = Dibujar(nivel, SystemInformation.SmallIconSize.Width))
                    icono = Icon.FromHandle(bmp.GetHicon()); // tres íconos en toda la vida del programa: no se liberan
                Cache[nivel] = icono;
            }
            return icono;
        }

        static Bitmap Dibujar(Nivel nivel, int tamano)
        {
            var bmp = new Bitmap(tamano, tamano, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.DrawImage(ImagenMarca(), new Rectangle(0, 0, tamano, tamano));
                var d = (float)Math.Round(tamano * 0.5);
                var borde = Math.Max(1f, tamano / 16f);
                var rect = new RectangleF(tamano - d, tamano - d, d - 0.5f, d - 0.5f);
                using (var fondo = new SolidBrush(Color.White))
                    g.FillEllipse(fondo, rect.X - borde, rect.Y - borde, rect.Width + borde, rect.Height + borde);
                using (var punto = new SolidBrush(Colores[nivel]))
                    g.FillEllipse(punto, rect);
            }
            return bmp;
        }

        /// <summary>Para revisar en el CI: guarda los tres íconos a 16, 24 y 32 px como PNG en `carpeta`.</summary>
        public static void GuardarMuestras(string carpeta)
        {
            Directory.CreateDirectory(carpeta);
            foreach (Nivel nivel in Enum.GetValues(typeof(Nivel)))
                foreach (var t in new[] { 16, 24, 32 })
                    using (var bmp = Dibujar(nivel, t))
                        bmp.Save(Path.Combine(carpeta, "icono-" + nivel.ToString().ToLowerInvariant() + "-" + t + ".png"), ImageFormat.Png);
        }
    }
}
