// NexoMesa-Bandeja.exe: ícono del agente de impresión junto al reloj de Windows.
//
// Arranca al iniciar sesión (lo registra el instalador) y solo LEE estado.json, que escribe el agente (servicio de Windows): no tiene
// el token, no habla con el servidor y no abre puertos. Una sola copia por sesión de Windows.
//
//   NexoMesa-Bandeja.exe                     ícono (estado en C:\ProgramData\NexoMesa\estado\estado.json o en AGENT_ESTADO)
//   NexoMesa-Bandeja.exe --estado <ruta>     ícono leyendo otro archivo (pruebas)
//   NexoMesa-Bandeja.exe --mensajes          solo la ventana de últimos mensajes
//   NexoMesa-Bandeja.exe --muestras <dir>    guarda los íconos de cada estado como PNG (revisión en el CI)
using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace NexoMesa.Bandeja
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (args.Length == 2 && args[0] == "--muestras")
            {
                Iconos.GuardarMuestras(args[1]);
                return 0;
            }
            var ruta = RutaEstado(args);
            if (Array.IndexOf(args, "--mensajes") >= 0)
            {
                var ventana = new Mensajes();
                EstadoAgente estado = null;
                try { estado = LectorEstado.Leer(ruta); } catch (Exception) { }
                ventana.Mostrar(estado);
                Application.Run(ventana);
                return 0;
            }

            bool primera;
            using (var unica = new Mutex(true, @"Local\NexoMesa.Bandeja", out primera))
            {
                if (!primera) return 0; // ya hay un ícono en esta sesión
                Application.Run(new Bandeja(ruta));
                GC.KeepAlive(unica);
            }
            return 0;
        }

        static string RutaEstado(string[] args)
        {
            var i = Array.IndexOf(args, "--estado");
            if (i >= 0 && i + 1 < args.Length) return args[i + 1];
            var env = Environment.GetEnvironmentVariable("AGENT_ESTADO");
            if (!string.IsNullOrEmpty(env)) return env;
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "NexoMesa", "estado", "estado.json");
        }
    }
}
