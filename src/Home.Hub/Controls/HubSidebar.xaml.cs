using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Home.Hub.Controls;

public sealed partial class HubSidebar : UserControl
{
    private readonly Dictionary<string, Button> _navButtons = new(StringComparer.OrdinalIgnoreCase);
    private string _selectedTag = "home";

    public HubSidebar()
    {
        InitializeComponent();
        AddNavItem("home", "Home", "\uE80F");
    }

    public event EventHandler<string>? NavigationRequested;

    public string SelectedTag
    {
        get => _selectedTag;
        set
        {
            if (string.Equals(_selectedTag, value, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            _selectedTag = value;
            UpdateSelectionVisuals();
        }
    }

    public void ClearModuleItems()
    {
        foreach (var key in _navButtons.Keys.Where(k => k is not "home").ToList())
        {
            if (_navButtons.TryGetValue(key, out var button))
            {
                NavItemsPanel.Children.Remove(button);
                _navButtons.Remove(key);
            }
        }
    }

    public void AddModuleNavItem(string tag, string label, string glyph)
    {
        if (_navButtons.ContainsKey(tag))
        {
            return;
        }

        AddNavItem(tag, label, glyph);
    }

    public void SetStandaloneMode(string moduleTag)
    {
        ClearModuleItems();
        NavItemsPanel.Children.Clear();
        _navButtons.Clear();
        AddNavItem(moduleTag, GetStandaloneLabel(moduleTag), GetStandaloneGlyph(moduleTag));
        SelectedTag = moduleTag;
        SettingsNavButton.Visibility = Visibility.Collapsed;
    }

    public void HideHomeAndSettings()
    {
        if (_navButtons.TryGetValue("home", out var home))
        {
            home.Visibility = Visibility.Collapsed;
        }

        SettingsNavButton.Visibility = Visibility.Collapsed;
    }

    private void AddNavItem(string tag, string label, string glyph)
    {
        var button = new Button
        {
            Tag = tag,
            Style = (Style)Application.Current.Resources["NavRailItemStyle"],
            HorizontalAlignment = HorizontalAlignment.Stretch,
            HorizontalContentAlignment = HorizontalAlignment.Left,
        };
        button.Click += OnNavItemClicked;

        var content = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, VerticalAlignment = VerticalAlignment.Center };
        content.Children.Add(new FontIcon
        {
            Glyph = glyph,
            FontFamily = (FontFamily)Application.Current.Resources["SymbolThemeFontFamily"],
            FontSize = 14,
            VerticalAlignment = VerticalAlignment.Center,
        });
        content.Children.Add(new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center });
        button.Content = content;

        if (string.Equals(tag, "home", StringComparison.OrdinalIgnoreCase))
        {
            NavItemsPanel.Children.Insert(0, button);
        }
        else
        {
            NavItemsPanel.Children.Add(button);
        }

        _navButtons[tag] = button;
        UpdateSelectionVisuals();
    }

    private void OnNavItemClicked(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not string tag)
        {
            return;
        }

        SelectedTag = tag;
        NavigationRequested?.Invoke(this, tag);
    }

    private void UpdateSelectionVisuals()
    {
        var activeStyle = (Style)Application.Current.Resources["NavRailItemActiveStyle"];
        var normalStyle = (Style)Application.Current.Resources["NavRailItemStyle"];

        foreach (var (tag, button) in _navButtons)
        {
            button.Style = string.Equals(tag, _selectedTag, StringComparison.OrdinalIgnoreCase)
                ? activeStyle
                : normalStyle;
        }

        SettingsNavButton.Style = string.Equals(_selectedTag, "general", StringComparison.OrdinalIgnoreCase)
            ? activeStyle
            : normalStyle;
    }

    private static string GetStandaloneLabel(string tag) => tag switch
    {
        "cleanshot" => "CleanShot",
        "light-controls" => "Light Controls",
        _ => "Home",
    };

    private static string GetStandaloneGlyph(string tag) => tag switch
    {
        "cleanshot" => "\uE722",
        "light-controls" => "\uE8BE",
        _ => "\uE80F",
    };
}
