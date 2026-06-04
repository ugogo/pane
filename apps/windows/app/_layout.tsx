import './global.css';
import { Slot } from 'expo-router';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function RootLayout() {
  return (
    <TooltipProvider>
      <Slot />
    </TooltipProvider>
  );
}
