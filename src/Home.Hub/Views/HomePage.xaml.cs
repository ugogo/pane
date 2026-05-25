using Home.Core;
using Home.Hub.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Home.Hub.Views;

public sealed partial class HomePage : Page
{
    public HomePage()
    {
        InitializeComponent();
        DataContext = App.MainViewModel;
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        var viewModel = App.MainViewModel;
        viewModel.RefreshHotkeyConflicts();
        viewModel.RefreshHomeDashboard();
    }

    private void OnModuleSettingsClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string moduleId })
        {
            App.MainWindow.NavigateToTag(moduleId);
        }
    }

    private void OnHotkeyConflictActionClicked(object sender, RoutedEventArgs e) =>
        App.MainWindow.NavigateToTag(HomeServiceCollectionExtensions.CleanShotModuleId);
}
