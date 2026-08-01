import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LudoGame } from './components/LudoGame';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LudoGame />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
