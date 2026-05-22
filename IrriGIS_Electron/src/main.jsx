import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ── OAuth-session warmup (runs before AuthProvider mounts) ──────────────────
// The backend redirects to /oauth/callback?token=…&user=….
// main.jsx cannot read those query params after the pre-app hash-sanitizer has
// stripped the hash fragment — the URL will be a clean /oauth/callback.
//
// AuthContext.initAuth() handles the post-reload OAuth recovery from
// localStorage.  We do NOT need to redirect again here, unlike the previous
// attempts: doing so would replay the query params and re-trigger this script,
// causing an infinite reload loop.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
