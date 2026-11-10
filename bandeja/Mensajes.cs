// Ventana «Últimos mensajes del agente»: los 20 mensajes que guarda estado.json, el más reciente arriba.
using System;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace NexoMesa.Bandeja
{
    sealed class Mensajes : Form
    {
        public const string TituloVentana = "NexoMesa · Últimos mensajes del agente";
        readonly TextBox texto = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            WordWrap = true,
            Dock = DockStyle.Fill,
            Font = new Font("Consolas", 9.5f),
            BackColor = SystemColors.Window,
            BorderStyle = BorderStyle.None,
        };

        public Mensajes()
        {
            Text = TituloVentana;
            Icon = Iconos.Marca(32);
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(720, 380);
            MinimumSize = new Size(420, 240);
            ShowInTaskbar = true;

            var pie = new FlowLayoutPanel { Dock = DockStyle.Bottom, FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Padding = new Padding(8) };
            var cerrar = new Button { Text = "Cerrar", AutoSize = true };
            cerrar.Click += (s, e) => Close();
            var copiar = new Button { Text = "Copiar", AutoSize = true };
            copiar.Click += (s, e) => { if (texto.TextLength > 0) Clipboard.SetText(texto.Text); };
            pie.Controls.Add(cerrar);
            pie.Controls.Add(copiar);
            var ayuda = new Label
            {
                Text = "Si llamas a soporte, copia estos mensajes. No incluyen datos privados.",
                AutoSize = true,
                Padding = new Padding(0, 6, 12, 0),
                ForeColor = SystemColors.GrayText,
            };
            pie.Controls.Add(ayuda);

            var marco = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10) };
            marco.Controls.Add(texto);
            Controls.Add(marco);
            Controls.Add(pie);
            AcceptButton = cerrar;
            CancelButton = cerrar;
        }

        public void Mostrar(EstadoAgente estado)
        {
            var eventos = estado?.Eventos;
            string contenido;
            if (eventos == null || eventos.Count == 0)
                contenido = estado == null ? "No se encontró el estado del agente en este equipo." : "El agente todavía no ha registrado mensajes.";
            else
            {
                var sb = new StringBuilder();
                foreach (var ev in Enumerable.Reverse(eventos).Where(x => x != null))
                {
                    var hora = LectorEstado.Fecha(ev.Hora);
                    sb.Append(hora.HasValue ? hora.Value.ToLocalTime().ToString("dd/MM HH:mm:ss", CultureInfo.InvariantCulture) : "--/-- --:--:--");
                    sb.Append("  ").Append(EtiquetaNivel(ev.Nivel)).Append("  ").Append(ev.Mensaje ?? "").Append("\r\n");
                }
                contenido = sb.ToString();
            }
            if (texto.Text != contenido)
            {
                texto.Text = contenido;
                texto.Select(0, 0);
            }
        }

        static string EtiquetaNivel(string nivel)
        {
            switch (nivel)
            {
                case "error": return "ERROR ";
                case "warn": return "AVISO ";
                default: return "info  ";
            }
        }
    }
}
