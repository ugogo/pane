using System.Runtime.InteropServices;
using H.NotifyIcon;
using Home.Core;
using Home.Hub.Modules;
using Home.Hub.Navigation;
using Home.Hub.Tray;
using Home.Hub.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml.Input;
using WinRT.Interop;
using WinUIEx;
using Windows.Graphics;

namespace Home.Hub;

public sealed partial class MainWindow : WindowEx
{
    private const int GwlpWndproc = -4;

    private bool _trayInitialized;
    private bool _forceClose;
    private IntPtr _originalWndProc;
    private WndProcDelegate? _wndProcDelegate;
    private TrayMenuController? _trayMenu;
    private IReadOnlyList<HubSearchItem> _searchItems = [];

    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
    private static extern IntPtr SetWindowLong32(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll")]
    private static extern IntPtr CallWindowProc(IntPtr lpPrevWndFunc, IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    public MainWindow()
    {
        InitializeComponent();
        Title = "Home";
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        SystemBackdrop = new Microsoft.UI.Xaml.Media.MicaBackdrop();
        AppWindow.Resize(new SizeInt32(780, 520));

        BuildModuleNavigation();
        BuildSearchCatalog();

        NavView.DisplayModeChanged += OnNavDisplayModeChanged;
        NavView.PaneClosing += OnNavPaneClosing;

        if (App.StandaloneModuleId is not null)
        {
            ApplyStandaloneNavigation(App.StandaloneModuleId);
            Title = GetStandaloneTitle(App.StandaloneModuleId);
            SearchBox.Visibility = Visibility.Collapsed;
        }

        var settings = HubSettingsStore.Load();
        var initialTag = App.StandaloneModuleId ?? settings.LastOpenedPage;
        SelectNavigationTag(initialTag);

        NavView.SelectionChanged += OnNavigationSelectionChanged;
        AppWindow.Closing += OnAppWindowClosing;
        AppWindow.Changed += OnAppWindowChanged;
        AppTitleBar.SizeChanged += (_, _) => ApplyTitleBarInsets();
    }

    private void OnAppWindowChanged(AppWindow sender, AppWindowChangedEventArgs args)
    {
        if (args.DidSizeChange || args.DidPresenterChange)
        {
            ApplyTitleBarInsets();
        }
    }

    private void ApplyTitleBarInsets()
    {
        var titleBar = AppWindow.TitleBar;
        AppTitleBar.Padding = new Thickness(
            Math.Max(titleBar.LeftInset, 0),
            0,
            Math.Max(titleBar.RightInset, 0),
            0);
    }

    public void NavigateToPage(Type pageType)
    {
        ShowFromTray();
        ContentFrame.Navigate(pageType);
    }

    public void ShowFromTray()
    {
        AppWindow.Show();
        Activate();
    }

    public void HideToTray() => AppWindow.Hide();

    public void RefreshTrayMenu() => _trayMenu?.Refresh();

    public void NavigateToTag(string tag)
    {
        ShowFromTray();

        var item = FindNavItem(tag);
        if (item is not null)
        {
            NavView.SelectedItem = item;
        }
    }

    private void ApplyStandaloneNavigation(string moduleId)
    {
        for (var i = NavView.MenuItems.Count - 1; i >= 0; i--)
        {
            if (NavView.MenuItems[i] is NavigationViewItem item
                && !string.Equals(item.Tag as string, moduleId, StringComparison.OrdinalIgnoreCase))
            {
                NavView.MenuItems.RemoveAt(i);
            }
        }

        NavView.FooterMenuItems.Clear();
    }

    private static string GetStandaloneTitle(string moduleId) => moduleId switch
    {
        HomeServiceCollectionExtensions.CleanShotModuleId => "CleanShot",
        HomeServiceCollectionExtensions.LightControlsModuleId => "Light Controls",
        _ => "Home",
    };

    private void BuildModuleNavigation()
    {
        var registry = App.Services.GetRequiredService<ModuleRegistry>();
        var insertIndex = NavView.MenuItems.Count;

        foreach (var module in registry.Modules)
        {
            if (!ModuleNavigation.HasSettingsPage(module.Id))
            {
                continue;
            }

            NavView.MenuItems.Insert(insertIndex++, new NavigationViewItem
            {
                Content = module.DisplayName,
                Tag = module.Id,
                Icon = new SymbolIcon(ModuleNavigation.GetIcon(module.Id)),
            });
        }
    }

    private void BuildSearchCatalog()
    {
        var registry = App.Services.GetRequiredService<ModuleRegistry>();
        var items = new List<HubSearchItem>
        {
            new("Home", "home", "\uE80F", "dashboard", "utilities", "modules"),
            new("General", "general", "\uE713", "startup", "preferences", "tray", "settings"),
        };

        foreach (var module in registry.Modules)
        {
            if (!ModuleNavigation.HasSettingsPage(module.Id))
            {
                continue;
            }

            var glyph = ModuleNavigation.GetIcon(module.Id) switch
            {
                Symbol.Camera => "\uE722",
                Symbol.Switch => "\uE8E7",
                _ => "\uE713",
            };

            items.Add(new HubSearchItem(
                module.DisplayName,
                module.Id,
                glyph,
                module.Description,
                "settings",
                "module",
                "utility"));
        }

        _searchItems = items;
        SearchBox.ItemsSource = _searchItems;
    }

    private IEnumerable<HubSearchItem> FilterSearchItems(string query) =>
        _searchItems.Where(item => item.Matches(query));

    private void OnSearchTextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason != AutoSuggestionBoxTextChangeReason.UserInput)
        {
            return;
        }

        sender.ItemsSource = FilterSearchItems(sender.Text).ToList();
    }

    private void OnSearchQuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        var query = args.QueryText?.Trim();
        if (string.IsNullOrEmpty(query))
        {
            return;
        }

        var match = FilterSearchItems(query).FirstOrDefault();
        if (match is not null)
        {
            NavigateToSearchItem(match);
        }
    }

    private void OnSearchSuggestionChosen(AutoSuggestBox sender, AutoSuggestBoxSuggestionChosenEventArgs args)
    {
        if (args.SelectedItem is HubSearchItem item)
        {
            NavigateToSearchItem(item);
        }
    }

    private void NavigateToSearchItem(HubSearchItem item)
    {
        SearchBox.Text = string.Empty;
        SearchBox.ItemsSource = _searchItems;
        NavigateToTag(item.NavigationTag);
    }

    private void OnSearchAcceleratorInvoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (SearchBox.Visibility != Visibility.Visible)
        {
            return;
        }

        SearchBox.Focus(FocusState.Programmatic);
        args.Handled = true;
    }

    private void SelectNavigationTag(string tag)
    {
        var resolvedTag = ResolveNavigationTag(tag);
        var item = FindNavItem(resolvedTag) ?? NavView.MenuItems.OfType<NavigationViewItem>().FirstOrDefault();
        if (item is null)
        {
            NavigateContent("home");
            return;
        }

        NavView.SelectedItem = item;
        NavigateContent(resolvedTag);
    }

    private static string ResolveNavigationTag(string tag) =>
        ModuleNavigation.GetSettingsPageType(tag) is not null || tag is "home" or "general"
            ? tag
            : "home";

    private NavigationViewItem? FindNavItem(string tag) =>
        NavView.MenuItems.OfType<NavigationViewItem>().FirstOrDefault(item => item.Tag as string == tag)
        ?? NavView.FooterMenuItems.OfType<NavigationViewItem>().FirstOrDefault(item => item.Tag as string == tag);

    private void NavigateContent(string tag)
    {
        var pageType = tag switch
        {
            "home" => typeof(HomePage),
            "general" => typeof(GeneralPage),
            _ => ModuleNavigation.GetSettingsPageType(tag) ?? typeof(HomePage),
        };

        ContentFrame.Navigate(pageType);
    }

    private void OnNavigationSelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem item || item.Tag is not string tag)
        {
            return;
        }

        NavigateContent(tag);
        PersistLastOpenedPage(tag);
    }

    private void OnNavDisplayModeChanged(NavigationView sender, NavigationViewDisplayModeChangedEventArgs args)
    {
        sender.IsPaneOpen = true;
        if (sender.PaneDisplayMode != NavigationViewPaneDisplayMode.Left)
        {
            sender.PaneDisplayMode = NavigationViewPaneDisplayMode.Left;
        }
    }

    private void OnNavPaneClosing(NavigationView sender, NavigationViewPaneClosingEventArgs args)
    {
        args.Cancel = true;
    }

    private static void PersistLastOpenedPage(string tag)
    {
        var settings = HubSettingsStore.Load();
        settings.LastOpenedPage = tag;
        HubSettingsStore.Save(settings);
    }

    private void OnAppWindowClosing(Microsoft.UI.Windowing.AppWindow sender, Microsoft.UI.Windowing.AppWindowClosingEventArgs args)
    {
        if (_forceClose)
        {
            return;
        }

        args.Cancel = true;
        HideToTray();
    }

    private void QuitApplication()
    {
        _forceClose = true;
        Application.Current.Exit();
    }

    private async void OnRootLoaded(object sender, RoutedEventArgs e)
    {
        ApplyTitleBarInsets();

        if (_trayInitialized)
        {
            return;
        }

        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "tray-icon.ico");
        if (File.Exists(iconPath))
        {
            TrayIcon.Icon = new System.Drawing.Icon(iconPath);
        }

        var dispatcher = DispatcherQueue.GetForCurrentThread();
        _trayMenu = new TrayMenuController(TrayIcon, dispatcher, ShowFromTray, QuitApplication);
        TrayIcon.ForceCreate();
        _trayInitialized = true;

        var hwnd = WindowNative.GetWindowHandle(this);
        InstallHotkeyWindowHook(hwnd);

        var cleanShotModule = App.Services.GetRequiredService<CleanShotModule>();
        cleanShotModule.AttachMessageWindow(hwnd);

        if (cleanShotModule.IsEnabled)
        {
            await cleanShotModule.DisableAsync();
            await cleanShotModule.EnableAsync();
        }

        RefreshTrayMenu();
    }

    private void InstallHotkeyWindowHook(IntPtr hwnd)
    {
        _wndProcDelegate = WndProc;
        _originalWndProc = SetWindowLongPtr(hwnd, GwlpWndproc, Marshal.GetFunctionPointerForDelegate(_wndProcDelegate));
    }

    private IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        var cleanShotModule = App.Services.GetRequiredService<CleanShotModule>();
        if (cleanShotModule.TryHandleHotkeyMessage((int)msg, wParam))
        {
            return IntPtr.Zero;
        }

        return CallWindowProc(_originalWndProc, hWnd, msg, wParam, lParam);
    }

    private static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong) =>
        IntPtr.Size == 8
            ? SetWindowLongPtr64(hWnd, nIndex, dwNewLong)
            : SetWindowLong32(hWnd, nIndex, dwNewLong);

    private void OnOpenHomeRequested(object sender, RoutedEventArgs e) => ShowFromTray();
}
