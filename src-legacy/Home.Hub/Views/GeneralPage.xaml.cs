using Home.Hub.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Home.Hub.Views;

public sealed partial class GeneralPage : Page
{
    public GeneralPage()
    {
        InitializeComponent();
        DataContext = App.MainViewModel;
    }
}
