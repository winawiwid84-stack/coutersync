import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Tier 1 Google Maps Platform Demo Key Quota Defense
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const text = args.map((a) => String(a ?? '')).join(' ');
  if (text.includes('OverQuotaMapError') || text.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  originalConsoleError.apply(console, args);
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

