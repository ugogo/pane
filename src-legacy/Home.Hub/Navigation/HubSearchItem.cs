namespace Home.Hub.Navigation;

public sealed class HubSearchItem
{
    public HubSearchItem(string label, string navigationTag, string iconGlyph, params string[] keywords)
    {
        Label = label;
        NavigationTag = navigationTag;
        IconGlyph = iconGlyph;
        Keywords = keywords;
    }

    public string Label { get; }

    public string NavigationTag { get; }

    public string IconGlyph { get; }

    public IReadOnlyList<string> Keywords { get; }

    public bool Matches(string query)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return true;
        }

        var normalized = query.Trim();
        if (Label.Contains(normalized, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return Keywords.Any(keyword => keyword.Contains(normalized, StringComparison.OrdinalIgnoreCase));
    }
}
