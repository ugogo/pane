using Home.Hub.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Home.Hub.Views;

public sealed partial class HomePage : Page
{
    public HomePage()
    {
        InitializeComponent();
        DataContext = App.MainViewModel;
    }
}
