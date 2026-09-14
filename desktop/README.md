# LiveShare Windows client

LiveShare uses Electron + `WebContentsView` for the real shared-browser surface. The web room remains the control plane.

## Run locally

From the repository root:

```powershell
cd desktop
npm install
$env:LIVESHARE_WEB_URL="http://localhost:3000"
npm start -- --room=my-room
```

Start the Next.js app separately with `npm run dev` from the repository root.

For the deployed web app, set `LIVESHARE_WEB_URL` to the public LiveShare URL before launching the desktop client.

## Production build

```powershell
npm run build
```

This creates a Windows NSIS installer.

## Architecture

- **Control WebContentsView:** trusted LiveShare room UI, Supabase Realtime, presence and chat.
- **Browser WebContentsView:** isolated arbitrary HTTPS/HTTP websites.
- **Main process:** owns browser navigation and IPC; remote pages never receive Electron Node access.
- **Preload:** tiny context-isolated API only for the trusted room UI.
- **Transport:** Supabase Realtime Broadcast + Presence.
- **Persistence:** Supabase Postgres stores room metadata/events when authenticated database APIs are used.

Electron's `WebContentsView` is used instead of the deprecated `BrowserView` or unstable `<webview>` approach.

## Security

The browser surface has `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. Popups are opened externally, and non-HTTP(S) top-level navigation is blocked. The arbitrary-site WebContentsView receives no application preload bridge.
