import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import './styles/global.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api/queryClient';
import { App } from './app/App';
import { normalizeInitialRoute } from './app/router';
import { sounds } from './game/audio/soundManager';
import { startMocking } from './mocks/browser';
import { getOptions } from './storage/settings';

async function bootstrap(): Promise<void> {
  normalizeInitialRoute();
  sounds.setEnabled(getOptions().soundEnabled);
  await startMocking();
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element #root not found');
  const queryClient = createQueryClient();
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
