namespace CleanShot.Core.Services;

internal static class AppLog
{
    public static string FilePath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
        "cleanshot-w.log");

    private static readonly string LogPath = FilePath;

    public static void Info(string message) => Write("INFO", message);

    public static void Error(string message) => Write("ERROR", message);

    public static void Error(Exception exception) =>
        Write("ERROR", $"{exception.GetType().Name}: {exception.Message}\n{exception.StackTrace}");

    private static void Write(string level, string message)
    {
        var line = $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] {message}";
        System.Diagnostics.Debug.WriteLine(line);
        try
        {
            File.AppendAllText(LogPath, line + Environment.NewLine);
        }
        catch
        {
            // Best-effort logging only.
        }
    }
}
