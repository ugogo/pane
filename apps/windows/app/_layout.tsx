import './global.css';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import GeistVariable from '../assets/fonts/Geist-Variable.woff2';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PaneQueryProvider } from '@/lib/query-provider';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Geist Variable': GeistVariable,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PaneQueryProvider>
      <TooltipProvider>
        <Slot />
      </TooltipProvider>
    </PaneQueryProvider>
  );
}
