"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "../../../lib/supabase";
import { ensureSession } from "../../../lib/auth";

type Message = { id: string; name: string; text: string; mine?: boolean };
type PresenceUser = { id: string; name: string; desktop?: boolean };

declare global { interface Window { liveshareDesktop?: { navigate(url: string): Promise<unknown>; back(): Promise<unknown>; forward(): Promise<unknown>; reload(): Promise<unknown>; getUrl(): Promise<string>; openExternal(url: string): Promise<unknown>; onNavigation(callback: (payload: { url: string; remote?: boolean }) => void): () => void; onLocalNavigation(callback: (payload: { url: string }) => void): () => void; onReady(callback: (payload: { roomId: string }) => void): () => void; }; } }

const randomName = () => `Guest-${Math.random().toString(36).slice(2, 6)}`;
const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const validUrl = (value: string) => { try { const u = new URL(value); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomCode = decodeURIComponent(params.roomId).trim().toLowerCase();
  const [isDesktop, setIsDesktop] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("https://example.com");
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientId = useMemo(() => randomId(), []);
  const desktop = typeof window !== "undefined" ? window.liveshareDesktop : undefined;

  useEffect(() => {
    setIsDesktop(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("desktop") === "1");
    const saved = localStorage.getItem("liveshare-name");
    setName(saved || randomName());
  }, []);

  useEffect(() => {
    if (!name || !roomCode) return;
    let cancelled = false;
    const start = async () => {
      const supabase = getSupabase();
      if (!supabase) { setError("LiveShare is not configured. Please try again later."); return; }
      const { session, error: authError } = await ensureSession(supabase);
      if (cancelled) return;
      if (authError || !session) { setError("Could not start a secure session. Please try again later."); return; }
      const { data: roomId, error: joinError } = await supabase.rpc("join_room", { p_code: roomCode });
      if (cancelled) return;
      if (joinError || !roomId) { setError("This room does not exist or has expired."); return; }
      const { data: room } = await supabase.from("rooms").select("current_url").eq("id", roomId).single();
      if (room?.current_url && validUrl(room.current_url)) setDestination(room.current_url);
      const { data: history } = await supabase.from("room_events").select("id,event_type,payload,created_at").eq("room_id", roomId).order("created_at", { ascending: true }).limit(100);
      if (history) setMessages(history.filter(e => e.event_type === "chat").map(e => ({ id: String(e.id), name: String(e.payload?.name || "Guest"), text: String(e.payload?.text || "") })));
      const channel = supabase.channel(`room:${roomCode}`);
      channelRef.current = channel;
      channel.on("broadcast", { event: "navigate" }, ({ payload }) => { if (payload?.sender !== clientId && validUrl(payload?.url)) { setDestination(payload.url); if (desktop) void desktop.navigate(payload.url); } });
      channel.on("broadcast", { event: "chat" }, ({ payload }) => { if (!payload || payload.sender === clientId || typeof payload.text !== "string") return; setMessages(current => [...current, { id: String(payload.id || randomId()), name: String(payload.name || "Guest"), text: payload.text.slice(0, 500) }]); });
      channel.on("presence", { event: "sync" }, () => { const state = channel.presenceState<PresenceUser>(); setUsers(Object.values(state).flat().map(v => ({ id: v.id, name: v.name, desktop: v.desktop }))); });
      channel.subscribe(async status => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") { setConnected(true); await channel.track({ id: clientId, name: name.slice(0, 32), desktop: isDesktop }); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { setConnected(false); setError("Realtime connection failed. Check your connection and retry."); }
      });
    };
    void start();
    return () => { cancelled = true; setConnected(false); if (channelRef.current) { void channelRef.current.unsubscribe(); channelRef.current = null; } };
  }, [roomCode, clientId, name, isDesktop, desktop]);

  useEffect(() => { if (!desktop) return; const stopLocal = desktop.onLocalNavigation(({ url }) => { if (!validUrl(url)) return; setDestination(url); void channelRef.current?.send({ type: "broadcast", event: "navigate", payload: { sender: clientId, url } }); }); const stopNav = desktop.onNavigation(({ url }) => { if (validUrl(url)) setDestination(url); }); return () => { stopLocal(); stopNav(); }; }, [desktop, clientId]);

  const navigate = async () => { let url = destination.trim(); if (!url) return; if (!/^https?:\/\//i.test(url)) url = `https://${url}`; if (!validUrl(url)) { setNotice("Enter a valid web address."); return; } setDestination(url); setNotice("Navigation sent to the room."); await channelRef.current?.send({ type: "broadcast", event: "navigate", payload: { sender: clientId, url } }); if (desktop) await desktop.navigate(url); const supabase = getSupabase(); if (supabase) { const { data: room } = await supabase.from("rooms").select("id").eq("code", roomCode).single(); if (room) await supabase.from("room_events").insert({ room_id: room.id, actor_user_id: (await supabase.auth.getUser()).data.user?.id, event_type: "navigate", payload: { url } }); } };

  const sendMessage = async () => { const text = message.trim().slice(0, 500); if (!text) return; const item = { id: randomId(), name: name || "Guest", text, mine: true }; setMessages(current => [...current, item]); setMessage(""); await channelRef.current?.send({ type: "broadcast", event: "chat", payload: { sender: clientId, id: item.id, name: item.name, text } }); const supabase = getSupabase(); if (supabase) { const { data: room } = await supabase.from("rooms").select("id").eq("code", roomCode).single(); const user = (await supabase.auth.getUser()).data.user; if (room && user) await supabase.from("room_events").insert({ room_id: room.id, actor_user_id: user.id, event_type: "chat", payload: { id: item.id, name: item.name, text } }); } };
  const copyInvite = async () => { try { await navigator.clipboard.writeText(window.location.href); setNotice("Invite copied."); } catch { setNotice("Copy failed. Copy the URL from your browser instead."); } };
  const openDestination = () => desktop ? void desktop.openExternal(destination) : window.open(destination, "_blank", "noopener,noreferrer");

  return <div className="roomPage"><header className="roomHeader"><div className="container roomHeaderInner"><Link className="back" href="/">← LiveShare</Link><div className="status"><span className="statusDot" style={{ opacity: connected ? 1 : .45 }} />{connected ? "Connected" : "Connecting…"}{isDesktop ? " · Desktop" : ""}</div></div></header>
    <main className="container roomLayout"><div className="roomTop" style={{ marginBottom: 15 }}><div><strong>Room: {roomCode}</strong><div className="roomUrl">Share this private invite link with collaborators.</div></div><div className="roomControls"><button className="btn" onClick={copyInvite}>Copy invite</button></div></div>
      {error && <div className="notice" role="alert">{error}</div>}
      <div className="roomGrid"><section className="roomCard"><div className="roomTop"><div><strong>{isDesktop ? "Shared browser" : "Shared destination"}</strong><div className="roomUrl">{isDesktop ? "The native Chromium surface is controlled by this room." : "Use the Windows client for full shared browsing."}</div></div></div><div className="roomStage"><div><b>{isDesktop ? "Live browser connected" : "Browser surface ready"}</b><p>{isDesktop ? "Navigation state is synchronized through LiveShare Realtime." : "Arbitrary websites cannot be embedded reliably in a normal webpage because of browser security headers. The Windows client provides the actual browser surface."}</p><div className="actions"><button className="btn primary" onClick={openDestination}>Open destination</button></div></div></div><div className="roomBar"><div className="status">{users.length || 1} participant{(users.length || 1) === 1 ? "" : "s"}</div><div className="muted">{connected ? "Realtime room active" : "Establishing secure room session…"}</div></div></section>
        <aside className="panel"><h3>Room controls</h3><label className="muted" htmlFor="displayName">Your name</label><input id="displayName" className="input" value={name} onChange={e => setName(e.target.value.slice(0, 32))} maxLength={32}/><label className="muted" htmlFor="destination" style={{display:"block",marginTop:14}}>Shared URL</label><input id="destination" className="input" value={destination} onChange={e => setDestination(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void navigate(); }}/><button className="btn primary" style={{width:"100%",marginTop:9}} onClick={() => void navigate()}>Share navigation</button>{notice && <div className="notice" role="status">{notice}</div>}<h3 style={{marginTop:25}}>People</h3>{users.length ? users.map(u => <div key={u.id} className="muted" style={{padding:"6px 0"}}>● {u.name}{u.id === clientId ? " · you" : ""}{u.desktop ? " · desktop" : ""}</div>) : <div className="muted">You · host</div>}</aside></div>
      <section className="panel" style={{marginTop:15}}><h3>Chat</h3><div className="chatList" aria-live="polite">{messages.length === 0 ? <span className="muted">No messages yet. Say hello.</span> : messages.map(m => <div key={m.id} style={{marginBottom:8}}><strong>{m.mine ? "You" : m.name}</strong>: {m.text}</div>)}</div><div className="chatForm"><input className="input" value={message} onChange={e => setMessage(e.target.value.slice(0,500))} onKeyDown={e => { if (e.key === "Enter") void sendMessage(); }} placeholder="Message the room…" maxLength={500}/><button className="btn primary" onClick={() => void sendMessage()}>Send</button></div></section>
      <p className="notice">LiveShare keeps arbitrary website content inside an isolated Chromium WebContentsView in the desktop client. The room control plane exchanges collaboration state only.</p>
    </main></div>;
}
