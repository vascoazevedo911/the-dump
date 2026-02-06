import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Handle OAuth redirect when deployed as an SPA (Vercel / single-page fallback)
// If the OAuth provider redirected to /auth-success?token=..., store token/user and redirect to root
try {
  if (typeof window !== 'undefined' && window.location && window.location.pathname === '/auth-success') {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      try { localStorage.setItem('token', token); } catch (e) { /* ignore */ }
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          const minimalUser = { id: payload.userId || payload.sub || null, email: payload.email || null, name: payload.name || payload.email || 'Google User' };
          try { localStorage.setItem('user', JSON.stringify(minimalUser)); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore decode errors */ }
      // Redirect to app root so React can load normally and detect token in localStorage
      window.location.replace('/');
    }
  }
} catch (e) {
  // ignore any errors during early auth handling
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
