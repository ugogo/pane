import './global.css';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import GeistVariable from '../assets/fonts/Geist-Variable.woff2';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Geist Variable': GeistVariable,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <TooltipProvider>
      <Slot />
    </TooltipProvider>
  );
}
