namespace LightControls.Core.Logitech;

public static class LogitechProbe
{
    public static string Run()
    {
        if (!Hidpp20.Hidpp20Session.TryOpen(out var session, out var error) || session is null)
        {
            return "OPEN FAILED: " + error;
        }

        using (session)
        {
            var lines = new List<string> { "Mouse HID session opened." };
            lines.Add($"8090: {session.TryGetFeatureIndex(Hidpp20.Hidpp20Constants.FeatureModeStatus, out var modeStatus)} -> {modeStatus}");
            lines.Add($"8070: {session.TryGetFeatureIndex(Hidpp20.Hidpp20Constants.FeatureColorLedEffects, out var colorLed)} -> {colorLed}");
            lines.Add($"8071: {session.TryGetFeatureIndex(Hidpp20.Hidpp20Constants.FeatureRgbEffects, out var rgbEffects)} -> {rgbEffects}");
            lines.Add($"8100: {session.TryGetFeatureIndex(Hidpp20.Hidpp20Constants.FeatureOnboardProfiles, out var onboard)} -> {onboard}");
            lines.Add($"G HUB friendly: {session.IsGhubFriendlyLighting}");

            foreach (var (label, red, green, blue) in new[]
                     {
                         ("RED", (byte)255, (byte)0, (byte)0),
                         ("GREEN", (byte)0, (byte)255, (byte)0),
                         ("BLUE", (byte)0, (byte)0, (byte)255)
                     })
            {
                var ok = session.TrySetPowerLedColor(red, green, blue, out var setError);
                lines.Add($"SET {label}: {ok}" + (setError is null ? string.Empty : $" ({setError})"));
            }

            lines.Add($"Active path: {session.ActiveColorPathName}");
            return string.Join(Environment.NewLine, lines);
        }
    }
}
