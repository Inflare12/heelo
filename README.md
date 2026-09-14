# LiveShare

LiveShare is a Windows-first collaborative browsing product: create a room, invite people, synchronize navigation, see presence, and chat in one shared workspace.

## Current web MVP

- Next.js App Router
- Responsive landing page
- Stable `/room/[roomId]` URLs (no SPA 404 problem)
- Room creation and invite copying
- Optional Supabase Realtime presence
- Realtime room navigation state
- Realtime room chat
- Local fallback/demo mode when Supabase is not configured
- No third-party website content is proxied through LiveShare

## Realtime setup

Copy `.env.example` to `.env.local` and provide a Supabase project URL and browser-safe publishable/anon key. Realtime channels are named `room:<roomId>`.

For production, configure Supabase security/auth policies before exposing private room data. The current room transport intentionally uses ephemeral Realtime Broadcast/Presence state rather than storing chat or browsing history.

## Important browser limitation

A normal web page cannot reliably iframe arbitrary websites because many sites send `X-Frame-Options` or CSP `frame-ancestors` restrictions. Therefore the web app is the control plane, not a proxy for arbitrary pages. The planned Windows client is the data-plane browser: it will embed Chromium and connect to the same room transport so navigation, scroll, pointer/presence and collaboration commands can be synchronized without bypassing site security policies.

## Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Production architecture

Web control plane: Next.js + Vercel.

Realtime: Supabase Realtime for signaling/presence/broadcast in the first production iteration.

Desktop browser: Windows-first Electron/Tauri shell with Chromium/WebView and a strict allowlist of commands sent through the room channel.

Security: short room IDs, rate limits, input validation, origin checks, CSP/security headers, abuse controls, and authenticated/private rooms before paid launch.
