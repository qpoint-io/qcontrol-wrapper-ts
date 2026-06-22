/*
 * Hosts qctl.exe as a real Windows service and owns the Windows-specific
 * service duties that the cross-platform TypeScript daemon should not know.
 */
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Threading;

namespace Qpoint.Qctl.ServiceHost
{
    internal sealed class QctlService : ServiceBase
    {
        private const string ServiceNameValue = "qctl";
        private const string DefaultPipeName = "qctl-collector";
        private const string QctlSocketPathEnv = "QCTL_SOCKET_PATH";
        private const string WrapperCacheDirEnv = "QCONTROL_WRAPPER_CACHE_DIR";
        private const int PipeAclTimeoutMs = 30000;
        private const int PipeAclPollMs = 250;

        private readonly object logLock = new object();
        private Process daemonProcess;
        private StreamWriter stdoutLog;
        private StreamWriter stderrLog;

        public QctlService()
        {
            ServiceName = ServiceNameValue;
            CanStop = true;
            CanShutdown = true;
            AutoLog = true;
        }

        public static void Main()
        {
            if (Environment.UserInteractive)
            {
                using (QctlService service = new QctlService())
                {
                    service.StartForConsole();
                    Console.WriteLine("qctl service host is running. Press Enter to stop.");
                    Console.ReadLine();
                    service.StopForConsole();
                }
                return;
            }

            ServiceBase.Run(new QctlService());
        }

        protected override void OnStart(string[] args)
        {
            StartDaemon();
        }

        protected override void OnStop()
        {
            StopDaemon();
        }

        protected override void OnShutdown()
        {
            StopDaemon();
        }

        private void StartForConsole()
        {
            OnStart(new string[0]);
        }

        private void StopForConsole()
        {
            OnStop();
        }

        /*
         * Starts the cross-platform daemon as a child process while this host
         * remains the SCM-facing process that can respond to service controls.
         */
        private void StartDaemon()
        {
            string installDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string qctlPath = Path.Combine(installDirectory, "qctl.exe");
            string programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            string qctlDataDirectory = Path.Combine(programData, "qctl");
            string logDirectory = Path.Combine(qctlDataDirectory, "logs");
            string cacheDirectory = Path.Combine(qctlDataDirectory, "cache");
            string socketPath = Environment.GetEnvironmentVariable(QctlSocketPathEnv);

            if (String.IsNullOrWhiteSpace(socketPath))
            {
                socketPath = DefaultPipeName;
            }

            Directory.CreateDirectory(logDirectory);
            Directory.CreateDirectory(cacheDirectory);

            stdoutLog = CreateLogWriter(Path.Combine(logDirectory, "stdout.log"));
            stderrLog = CreateLogWriter(Path.Combine(logDirectory, "stderr.log"));

            ProcessStartInfo startInfo = new ProcessStartInfo(qctlPath, "daemon");
            startInfo.WorkingDirectory = installDirectory;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.EnvironmentVariables[QctlSocketPathEnv] = socketPath;
            startInfo.EnvironmentVariables[WrapperCacheDirEnv] = cacheDirectory;

            daemonProcess = new Process();
            daemonProcess.StartInfo = startInfo;
            daemonProcess.EnableRaisingEvents = true;
            daemonProcess.Exited += delegate(object sender, EventArgs eventArgs)
            {
                Process exitedProcess = sender as Process;
                string exitCode = exitedProcess == null ? "unknown" : exitedProcess.ExitCode.ToString();
                WriteLogLine(stderrLog, "qctl daemon exited with code " + exitCode);

                if (Object.ReferenceEquals(daemonProcess, sender))
                {
                    try
                    {
                        Stop();
                    }
                    catch
                    {
                    }
                }
            };
            daemonProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                WriteLogLine(stdoutLog, eventArgs.Data);
            };
            daemonProcess.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                WriteLogLine(stderrLog, eventArgs.Data);
            };

            daemonProcess.Start();
            daemonProcess.BeginOutputReadLine();
            daemonProcess.BeginErrorReadLine();

            ThreadPool.QueueUserWorkItem(delegate
            {
                ApplyPipeAclWhenReady(socketPath);
            });
        }

        /*
         * Stops the daemon process tree so qcontrol scanner children cannot be
         * orphaned if SCM stops or upgrades the service.
         */
        private void StopDaemon()
        {
            Process process = daemonProcess;
            daemonProcess = null;

            if (process != null && !process.HasExited)
            {
                try
                {
                    RunTaskkill(process.Id);
                }
                catch (Exception error)
                {
                    WriteLogLine(stderrLog, "failed to stop qctl daemon process tree: " + error.Message);
                    try
                    {
                        process.Kill();
                    }
                    catch
                    {
                    }
                }

                process.WaitForExit(10000);
            }

            if (process != null)
            {
                process.Dispose();
            }

            CloseLogWriter(stdoutLog);
            CloseLogWriter(stderrLog);
            stdoutLog = null;
            stderrLog = null;
        }

        /*
         * Grants ordinary local users read/write access to the daemon pipe. This
         * is the Windows equivalent of chmodding the macOS Unix socket after bind.
         */
        private void ApplyPipeAclWhenReady(string configuredSocketPath)
        {
            string pipePath = NormalizePipePath(configuredSocketPath);
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(PipeAclTimeoutMs);

            while (DateTime.UtcNow < deadline)
            {
                try
                {
                    PipeSecurity.ApplyUsersReadWriteDacl(pipePath);
                    WriteLogLine(stdoutLog, "applied qctl named pipe access policy to " + pipePath);
                    return;
                }
                catch (Win32Exception error)
                {
                    if (error.NativeErrorCode != 2 && error.NativeErrorCode != 231)
                    {
                        WriteLogLine(stderrLog, "failed to apply qctl named pipe access policy: " + error.Message);
                        return;
                    }
                }
                catch (Exception error)
                {
                    WriteLogLine(stderrLog, "failed to apply qctl named pipe access policy: " + error.Message);
                    return;
                }

                Thread.Sleep(PipeAclPollMs);
            }

            WriteLogLine(stderrLog, "timed out waiting for qctl named pipe " + pipePath);
        }

        private static string NormalizePipePath(string value)
        {
            if (value.StartsWith(@"\\.\pipe\", StringComparison.OrdinalIgnoreCase))
            {
                return value;
            }

            if (value.StartsWith("pipe://", StringComparison.OrdinalIgnoreCase))
            {
                return @"\\.\pipe\" + value.Substring("pipe://".Length);
            }

            return @"\\.\pipe\" + value;
        }

        private static StreamWriter CreateLogWriter(string path)
        {
            FileStream stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            StreamWriter writer = new StreamWriter(stream);
            writer.AutoFlush = true;
            return writer;
        }

        private void WriteLogLine(StreamWriter writer, string message)
        {
            if (writer == null || message == null)
            {
                return;
            }

            lock (logLock)
            {
                try
                {
                    writer.WriteLine(DateTimeOffset.Now.ToString("o") + " " + message);
                }
                catch (ObjectDisposedException)
                {
                }
                catch (IOException)
                {
                }
            }
        }

        private static void CloseLogWriter(StreamWriter writer)
        {
            if (writer == null)
            {
                return;
            }

            writer.Flush();
            writer.Dispose();
        }

        private static void RunTaskkill(int processId)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo("taskkill.exe", "/PID " + processId + " /T /F");
            startInfo.CreateNoWindow = true;
            startInfo.UseShellExecute = false;

            using (Process taskkill = Process.Start(startInfo))
            {
                taskkill.WaitForExit(10000);
            }
        }
    }

    internal static class PipeSecurity
    {
        private const UInt32 ReadControl = 0x00020000;
        private const UInt32 WriteDac = 0x00040000;
        private const UInt32 FileShareRead = 0x00000001;
        private const UInt32 FileShareWrite = 0x00000002;
        private const UInt32 OpenExisting = 3;
        private const UInt32 DaclSecurityInformation = 0x00000004;
        private const int SeKernelObject = 6;
        private static readonly IntPtr InvalidHandleValue = new IntPtr(-1);

        private const string UsersReadWriteDacl =
            "D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;OW)(A;;GRGW;;;BU)";

        public static void ApplyUsersReadWriteDacl(string pipePath)
        {
            IntPtr handle = CreateFile(
                pipePath,
                ReadControl | WriteDac,
                FileShareRead | FileShareWrite,
                IntPtr.Zero,
                OpenExisting,
                0,
                IntPtr.Zero);

            if (handle == InvalidHandleValue)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }

            IntPtr securityDescriptor;
            UInt32 securityDescriptorSize;

            if (!ConvertStringSecurityDescriptorToSecurityDescriptor(
                UsersReadWriteDacl,
                1,
                out securityDescriptor,
                out securityDescriptorSize))
            {
                CloseHandle(handle);
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }

            try
            {
                bool daclPresent;
                bool daclDefaulted;
                IntPtr dacl;

                if (!GetSecurityDescriptorDacl(securityDescriptor, out daclPresent, out dacl, out daclDefaulted))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                }

                UInt32 error = SetSecurityInfo(
                    handle,
                    SeKernelObject,
                    DaclSecurityInformation,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    dacl,
                    IntPtr.Zero);

                if (error != 0)
                {
                    throw new Win32Exception((int)error);
                }
            }
            finally
            {
                LocalFree(securityDescriptor);
                CloseHandle(handle);
            }
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateFile(
            string fileName,
            UInt32 desiredAccess,
            UInt32 shareMode,
            IntPtr securityAttributes,
            UInt32 creationDisposition,
            UInt32 flagsAndAttributes,
            IntPtr templateFile);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern UInt32 SetSecurityInfo(
            IntPtr handle,
            int objectType,
            UInt32 securityInfo,
            IntPtr owner,
            IntPtr group,
            IntPtr dacl,
            IntPtr sacl);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(
            string stringSecurityDescriptor,
            UInt32 stringSecurityDescriptorRevision,
            out IntPtr securityDescriptor,
            out UInt32 securityDescriptorSize);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool GetSecurityDescriptorDacl(
            IntPtr securityDescriptor,
            out bool daclPresent,
            out IntPtr dacl,
            out bool daclDefaulted);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr LocalFree(IntPtr handle);
    }
}
