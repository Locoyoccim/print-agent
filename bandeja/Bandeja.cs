// El ícono junto al reloj: lee estado.json cada 3 s, cambia de color, avisa cuando algo cambia y ofrece un menú con el detalle.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;

namespace NexoMesa.Bandeja
{
    sealed class Bandeja : ApplicationContext
    {
        /// <summary>Si el archivo no se puede leer (lo están reemplazando), se conserva lo último; pasado este tiempo se avisa.</summary>
        static readonly TimeSpan ToleranciaLectura = TimeSpan.FromSeconds(15);

        readonly string ruta;
        readonly NotifyIcon icono;
        readonly ContextMenuStrip menu = new ContextMenuStrip();
        readonly Timer reloj = new Timer { Interval = 3000 };
        EstadoAgente estado;
        Resumen resumen;
        DateTime? falloLecturaDesde;
        string errorLectura;
        bool problemaAvisado;
        Mensajes ventanaMensajes;

        public Bandeja(string ruta)
        {
            this.ruta = ruta;
            icono = new NotifyIcon { ContextMenuStrip = menu, Text = "NexoMesa", Icon = Iconos.De(Nivel.Amarillo), Visible = true };
            menu.Opening += (s, e) => ArmarMenu();
            icono.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) MostrarMenu(); };
            icono.BalloonTipClicked += (s, e) => VerMensajes();
            reloj.Tick += (s, e) => Actualizar();
            Actualizar();
            reloj.Start();
        }

        void Actualizar()
        {
            var ahora = DateTime.UtcNow;
            try
            {
                estado = LectorEstado.Leer(ruta);
                falloLecturaDesde = null;
                errorLectura = null;
            }
            catch (Exception e)
            {
                falloLecturaDesde = falloLecturaDesde ?? ahora;
                errorLectura = e.Message;
            }

            Resumen nuevo;
            if (falloLecturaDesde.HasValue && ahora - falloLecturaDesde.Value > ToleranciaLectura)
                nuevo = new Resumen { Nivel = Nivel.Amarillo, Titulo = "No se pudo leer el estado del agente", Detalle = Resumen.Recortar(errorLectura, 200) };
            else
                nuevo = Evaluador.Evaluar(estado, ahora);

            icono.Icon = Iconos.De(nuevo.Nivel);
            icono.Text = nuevo.Tooltip;
            var aviso = Evaluador.DecidirAviso(resumen, nuevo, ref problemaAvisado);
            if (aviso != null)
                icono.ShowBalloonTip(8000, aviso.Titulo, aviso.Texto, aviso.EsProblema ? ToolTipIcon.Warning : ToolTipIcon.Info);
            resumen = nuevo;
            if (ventanaMensajes != null && !ventanaMensajes.IsDisposed) ventanaMensajes.Mostrar(estado);
        }

        void ArmarMenu()
        {
            while (menu.Items.Count > 0) menu.Items[0].Dispose(); // Dispose también lo quita del menú
            var r = resumen ?? Evaluador.Evaluar(null, DateTime.UtcNow);
            var titulo = Fijo("NexoMesa · Agente de impresión" + (string.IsNullOrEmpty(r.Version) ? "" : " " + r.Version));
            titulo.Font = new Font(menu.Font, FontStyle.Bold);
            menu.Items.Add(titulo);
            var estadoItem = Fijo(r.Titulo);
            estadoItem.Image = Iconos.De(r.Nivel).ToBitmap();
            menu.Items.Add(estadoItem);
            if (!string.IsNullOrEmpty(r.Detalle)) menu.Items.Add(Fijo(Resumen.Recortar(r.Detalle, 110)));

            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(Fijo("Impresoras"));
            if (r.Impresoras.Count == 0) menu.Items.Add(Fijo("   Todavía no ha impreso nada"));
            foreach (var linea in r.Impresoras) menu.Items.Add(Fijo("   " + linea));

            menu.Items.Add(new ToolStripSeparator());
            var abrir = new ToolStripMenuItem("Abrir NexoMesa", null, (s, e) => Abrir(Evaluador.UrlAgentes(r.Url)));
            abrir.Enabled = r.Url != null;
            menu.Items.Add(abrir);
            menu.Items.Add(new ToolStripMenuItem("Ver últimos mensajes", null, (s, e) => VerMensajes()));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Ocultar el ícono hasta reiniciar sesión", null, (s, e) => ExitThread()));
        }

        static ToolStripMenuItem Fijo(string texto) => new ToolStripMenuItem(texto) { Enabled = false };

        void MostrarMenu()
        {
            // NotifyIcon solo abre el menú con clic derecho; con el izquierdo se usa su método interno (el mismo que usa Windows).
            var metodo = typeof(NotifyIcon).GetMethod("ShowContextMenu", BindingFlags.Instance | BindingFlags.NonPublic);
            if (metodo != null) metodo.Invoke(icono, null);
        }

        void VerMensajes()
        {
            if (ventanaMensajes == null || ventanaMensajes.IsDisposed) ventanaMensajes = new Mensajes();
            ventanaMensajes.Mostrar(estado);
            ventanaMensajes.Show();
            ventanaMensajes.Activate();
        }

        static void Abrir(string url)
        {
            if (url == null) return;
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch (Exception e) { MessageBox.Show("No se pudo abrir el navegador: " + e.Message, "NexoMesa", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }

        protected override void ExitThreadCore()
        {
            reloj.Stop();
            icono.Visible = false;
            icono.Dispose();
            if (ventanaMensajes != null && !ventanaMensajes.IsDisposed) ventanaMensajes.Close();
            base.ExitThreadCore();
        }
    }
}
