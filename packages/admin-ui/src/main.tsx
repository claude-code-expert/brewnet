import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth-context.js';
import { PasswordGate } from './components/PasswordGate.js';
import { Router } from './router.js';
import { Toast } from './components/Toast.js';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <PasswordGate>
        <div id="shell">
          <Router />
        </div>
        <Toast />
      </PasswordGate>
    </AuthProvider>
  </StrictMode>,
);
