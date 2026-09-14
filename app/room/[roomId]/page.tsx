"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "../../../lib/supabase";
import { ensureSession } from "../../../lib/auth";

type Message = { id: string; name: string; text: string; mine?: boolean; createdAt?: string };
type PresenceUser = { id: string; name: string };

const randomName = () => `Guest-${Math.random().toString(36).slice(2, 6)}`;
const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const validUrl = (value: string) => { try { const u = new URL(value); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomCode = decodeURIComponent(params.roomId).trim().toLowerCase();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("https://example.com");
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [roomTitle, setRoomTitle] = useState("LiveShare room");
  const [isHost, setIsHost] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const clientId = useMemo(() => randomId(), []);

  useEffect(() => {
    const saved = localStorage.getItem("liveshare-name");
    setName(saved || randomName());
  }, []);

  useEffect(() => {
    if (!name || !roomCode) return;
    localStorage.setItem("liveshare-name", name.slice(0, 32));
    let cancelled = false;
    const start = async () => {
      const supabase = getSupabase();
      if (!supabase) { setError("LiveShare is not configured. Please try again later."); return; }
      const { session, error: authError } = await ensureSession(supabase);
      if (cancelled) return;
      if (authError || !session) { setError("Could not start a secure session. Please try again later."); return; }
      userIdRef.current = session.user.id;
      const { data: roomId, error: joinError } = await supabase.rpc("join_room", { p_code: roomCode });
      if (cancelled) return;
      if (joinError || !roomId) { setError("This room does not exist or has expired."); return; }
      roomIdRef.current = String(roomId);
      const { data: room, error: roomError } = await supabase.from("rooms").select("id,title,current_url,host_user_id,expires_at,is_active").eq("id", roomId).single();
      if (roomError || !room || !room.is_active || new Date(room.expires_at).getTime() <= Date.now()) { setError("This room does not exist or has expired."); return; }
      setRoomTitle(room.title || "LiveShare room");
      setIsHost(room.host_user_id === session.user.id);
      if (room.current_url && validUrl(room.current_url)) setDestination(room.current_url);
      const { data: history } = await supabase.from("room_events").select("id,event_type,payload,created_at").eq("room_id", roomId).order("created_at", { ascending: true }).limit(100);
      if (history) setMessages(history.filter(e => e.event_type === "chat").map(e => ({ id: String(e.id), name: String(e.payload?.name || "Guest"), text: String(e.payload?.text || ""), createdAt: String(e.created_at) })));
      const channel = supabase.channel(`room:${roomCode}`);
      channelRef.current = channel;
      channel.on("broadcast", { event: "navigate" }, ({ payload }) => {
        if (payload?.sender !== clientId && validUrl(payload?.url)) { setDestination(payload.url); setNotice(`Navigation shared by ${String(payload?.name || "another participant")}.`); }
      });
      channel.on("broadcast", { event: "chat" }, ({ payload }) => {
        if (!payload || payload.sender === clientId || typeof payload.text !== "string") return;
        setMessages(current => [...current, { id: String(payload.id || randomId()), name: String(payload.name || "Guest"), text: payload.text.slice(0, 500), createdAt: new Date().toISOString() }].slice(-100));
      });
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        setUsers(Object.values(state).flat().map(v => ({ id: v.id, name: v.name })).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i));
      });
      channel.subscribe(async status => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") { setConnected(true); await channel.track({ id: clientId, name: name.slice(0, 32) }); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { setConnected(false); setError("Realtime connection failed. Check your connection and retry."); }
      });
    };
    void start();
    return () => { cancelled = true; setConnected(false); if (channelRef.current) { void channelRef.current.unsubscribe(); channelRef.current = null; } };
  }, [roomCode, clientId, name]);

  const navigate = async () => {
    let url = destination.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!validUrl(url)) { setNotice("Enter a valid http or https web address."); return; }
    setDestination(url); setIframeBlocked(false); setNotice("Navigation shared with the room.");
    await channelRef.current?.send({ type: "broadcast", event: "navigate", payload: { sender: clientId, name, url } });
    const supabase = getSupabase();
    if (supabase && roomIdRef.current && userIdRef.current) {
      await supabase.from("room_events").insert({ room_id: roomIdRef.current, actor_user_id: userIdRef.current, event_type: "navigate", payload: { url } });
      if (isHost) await supabase.from("rooms").update({ current_url: url }).eq("id", roomIdRef.current);
    }
  };

  const sendMessage = async () => {
    const text = message.trim().slice(0, 500);
    if (!text || !channelRef.current) return;
    const item = { id: randomId(), name: name || "Guest", text, mine: true, createdAt: new Date().toISOString() };
    setMessages(current => [...current, item].slice(-100)); setMessage("");
    await channelRef.current.send({ type: "broadcast", event: "chat", payload: { sender: clientId, ...item } });
    const supabase = getSupabase();
    if (supabase && roomIdRef.current && userIdRef.current) await supabase.from("room_events").insert({ room_id: roomIdRef.current, actor_user_id: userIdRef.current, event_type: "chat", payload: { id: item.id, name: item.name, text } });
  };

  const copyInvite = async () => { try { await navigator.clipboard.writeText(window.location.href); setNotice("Invite link copied to clipboard."); } catch { setNotice("Copy failed. Copy the room URL from your browser instead."); } };
  const copyCode = async () => { try { await navigator.clipboard.writeText(roomCode); setNotice("Room code copied."); } catch { setNotice(`Room code: ${roomCode}`); } };

  return <div className="roomPage">
    <header className="roomHeader"><div className="container roomHeaderInner"><Link className="back" href="/">← LiveShare</Link><div className="status"><span className="statusDot" style={{ opacity: connected ? 1 : .45 }} />{connected ? "Connected" : "Connecting…"}</div></div></header>
    <main className="container roomLayout">
      <div className="roomTop roomTitleBar"><div><strong>{roomTitle}</strong><div className="roomUrl">Room code: <button className="codeButton" onClick={copyCode}>{roomCode}</button>{isHost ? " · Host" : ""}</div></div><div className="roomControls"><button className="btn" onClick={copyInvite}>Copy invite</button><Link className="btn" href="/">Leave room</Link></div></div>
      {error && <div className="notice errorBox" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <div className="roomGrid">
        <section className="roomCard">
          <div className="roomTop"><div><strong>Shared browser</strong><div className="roomUrl">Everyone sees the same shared destination. Some sites block being displayed inside another website.</div></div></div>
          <div className="browserToolbar"><input className="input" aria-label="Shared web address" value={destination} onChange={e => setDestination(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void navigate(); }} /><button className="btn primary" onClick={() => void navigate()}>Share</button><button className="btn" onClick={() => window.open(destination, "_blank", "noopener,noreferrer")}>Open</button></div>
          <div className="webViewport">{validUrl(destination) && !iframeBlocked ? <iframe title="Shared destination" src={destination} sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts" onError={() => setIframeBlocked(true)} /> : <div className="iframeFallback"><b>This site cannot be displayed here.</b><p>Many sites intentionally block iframes for security. The shared URL is still synchronized for everyone.</p><button className="btn primary" onClick={() => window.open(destination, "_blank", "noopener,noreferrer")}>Open in a new tab</button></div>}</div>
          <div className="roomBar"><div className="status">{users.length || 1} participant{(users.length || 1) === 1 ? "" : "s"}</div><div className="muted">{connected ? "Realtime room active" : "Connecting to realtime…"}</div></div>
        </section>
        <aside className="panel"><h3>Room controls</h3><label className="muted" htmlFor="displayName">Your name</label><input id="displayName" className="input" value={name} onChange={e => setName(e.target.value.slice(0, 32))} maxLength={32}/><h3 style={{marginTop:25}}>People</h3>{users.length ? users.map(u => <div key={u.id} className="person"><span className="personDot" />{u.name}{u.id === clientId ? " · you" : ""}</div>) : <div className="muted">You · {isHost ? "host" : "participant"}</div>}</aside>
      </div>
      <section className="panel chatPanel"><div className="chatHeader"><div><h3>Room chat</h3><div className="muted">Messages are kept with the room history.</div></div><span className="muted">{messages.length}/100</span></div><div className="chatList" aria-live="polite">{messages.length === 0 ? <span className="muted">No messages yet. Say hello.</span> : messages.map(m => <div key={m.id} className={m.mine ? "chatMessage mine" : "chatMessage"}><div><strong>{m.mine ? "You" : m.name}</strong><span className="chatTime">{m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span></div><div>{m.text}</div></div>)}</div><div className="chatForm"><input className="input" value={message} onChange={e => setMessage(e.target.value.slice(0,500))} onKeyDown={e => { if (e.key === "Enter") void sendMessage(); }} placeholder="Message the room…" maxLength={500}/><button className="btn primary" onClick={() => void sendMessage()} disabled={!connected || !message.trim()}>Send</button></div></section>
      <div className="featureStrip"><span>✓ Shared navigation</span><span>✓ Live presence</span><span>✓ Persistent chat</span><span>✓ Invite links</span></div>
    </main>
  </div>;
}
