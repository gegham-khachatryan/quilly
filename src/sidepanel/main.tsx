import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { SidePanel } from './SidePanel';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SidePanel />
    </ErrorBoundary>
  </StrictMode>,
);
