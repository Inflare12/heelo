# LiveShare

LiveShare is a Windows-first collaborative browsing product: create a room, invite people, browse arbitrary websites inside an isolated Chromium surface, synchronize navigation, show presence, and chat.

## Architecture

```text
Browser / Windows client
        |
        v
Next.js room control plane
        |
        +---- Supabase Realtime ---- presence / broadcast
        |
        +---- Supabase Postgres --- room metadata / durable events
        |
        +---- future WebRTC ------ direct data/media transport
        |
Windows Electron shell
  +-- trusted room WebContentsView
  +-- isolated arbitrary-site WebContentsView
  +-- main-process navigation + security boundary
```

## Web app

- Next.js App Router
- Responsive landing page
- Stable `/room/[roomId]` routes
- Room creation and invite copying
- Supabase Realtime presence
- Realtime navigation and chat
- Desktop-aware room control plane
- Demo fallback when Supabase environment variables are absent

## Backend

The LiveShare backend is a dedicated Supabase project, separate from Plantinia.

- Postgres: rooms and room events
- RLS: enabled on persistent tables
- Realtime: Broadcast + Presence for low-latency ephemeral state
- Room expiry: built into the database schema
- Security hardening migration: active rooms are protected by authenticated RLS policies and maintenance functions are not intended as public RPCs

Copy `.env.example` to `.env.local` and configure the LiveShare Supabase URL and publishable key.

## Windows client

The `desktop/` directory contains the Electron client. It uses Electron's modern `WebContentsView` rather than deprecated `BrowserView` or `<webview>`.

```powershell
cd desktop
npm install
$env:LIVESHARE_WEB_URL="http://localhost:3000"
npm start -- --room=my-room
```

Build an installer:

```powershell
npm run build
```

Security boundaries:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- no Electron preload in arbitrary websites
- only HTTP(S) top-level navigation
- popups opened externally
- trusted room UI and arbitrary web content live in separate WebContentsViews

## Browser limitation

A normal webpage cannot reliably iframe arbitrary websites because of `X-Frame-Options` and CSP `frame-ancestors`. LiveShare does not bypass those policies or proxy website content. The Windows client provides the actual browser surface through Chromium while the room UI exchanges only collaboration state.

## CI

GitHub Actions runs the Next.js typecheck/build and the Windows Electron installer build on pushes and pull requests.

## Production roadmap

1. Enable anonymous or permanent Supabase Auth for room membership.
2. Switch Realtime rooms to private channels with Realtime authorization policies.
3. Add CAPTCHA/rate limiting for anonymous room creation.
4. Add durable room state snapshots and cleanup jobs.
5. Add cursor/pointer annotations and richer synchronized interactions.
6. Add WebRTC data/media channels with a TURN fallback when direct peer connectivity is unavailable.
7. Add updater/signing and release automation for the Windows installer.

The architecture deliberately keeps the control plane independent from the browser data plane so these upgrades do not require rebuilding the product from scratch.
