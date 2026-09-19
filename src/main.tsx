import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './native/android.css';
import { connection, initializeConnection } from './localConnection';
import { PROXY_BASE } from './config';

void initializeConnection(PROXY_BASE).then(() => {
  if (connection.kind === 'local' && connection.base !== window.location.origin) {
    window.location.replace(connection.base);
    return;
  }
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
});
