namespace Home.Windows;

public sealed class GlobalHotkeyCoordinator
{
    private readonly Dictionary<string, RegisteredHotkey> _registered = new(StringComparer.OrdinalIgnoreCase);

    public bool TryRegister(string ownerId, int hotkeyId, uint modifiers, uint virtualKey, out string? conflict)
    {
        conflict = null;
        var signature = FormatSignature(modifiers, virtualKey);

        foreach (var (existingOwner, existing) in _registered)
        {
            if (existing.Signature == signature && !string.Equals(existingOwner, ownerId, StringComparison.OrdinalIgnoreCase))
            {
                conflict = $"Hotkey already used by {existingOwner}: {signature}";
                return false;
            }
        }

        _registered[ownerId] = new RegisteredHotkey(hotkeyId, signature);
        return true;
    }

    public void UnregisterOwner(string ownerId)
    {
        _registered.Remove(ownerId);
    }

    public IReadOnlyList<string> ListConflicts()
    {
        var bySignature = _registered
            .GroupBy(pair => pair.Value.Signature)
            .Where(group => group.Count() > 1)
            .Select(group => string.Join(" vs ", group.Select(item => item.Key)))
            .ToList();

        return bySignature;
    }

    private static string FormatSignature(uint modifiers, uint virtualKey) =>
        $"{modifiers:X}:{virtualKey:X}";

    private readonly record struct RegisteredHotkey(int HotkeyId, string Signature);
}
