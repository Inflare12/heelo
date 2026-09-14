"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "../../../lib/supabase";

type Message = { id: string; name: string; text: string; mine?: boolean };
type PresenceUser = { id: string; name: string };

const randomName = () => `Guest-${Math.random().toString(36).slice(2, 6)}`;
const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = decodeURIComponent(params.roomId);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("https://example.com");
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientId = useMemo(() => randomId(), []);

  useEffect(() => {
    const saved = localStorage.getItem("liveshare-name");
    setName(saved || randomName());
  }, []);

  useEffect(() => {
    if (!name) return;
    localStorage.setItem("liveshare-name", name);
    const supabase = getSupabase();
    if (!supabase) {
      setConnected(false);
      return;
    }

    const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: clientId } } });
    channelRef.current = channel;
    channel.on("broadcast", { event: "navigate" }, ({ payload }) => {
      if (payload?.sender !== clientId && typeof payload.url === "string") setDestination(payload.url);
    });
    channel.on("broadcast", { event: "chat" }, ({ payload }) => {
      if (!payload || payload.sender === clientId) return;
      setMessages((current) => [...current, { id: payload.id, name: payload.name, text: payload.text }]);
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceUser>();
      const next: PresenceUser[] = Object.values(state).flat().map((v) => ({ id: v.id, name: v.name }));
      setUsers(next);
    });
    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      setConnected(true);
      await channel.track({ id: clientId, name });
    });

    return () => {
      setConnected(false);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId, clientId, name]);

  const navigate = async () => {
    let url = destination.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { setNotice("Enter a valid web address."); return; }
    setDestination(url);
    setNotice("Navigation sent to the room.");
    await channelRef.current?.send({ type: "broadcast", event: "navigate", payload: { sender: clientId, url } });
  };

  const sendMessage = async () => {
    const text = message.trim();
    if (!text) return;
    const item = { id: randomId(), name: name || "Guest", text, mine: true };
    setMessages((current) => [...current, item]);
    setMessage("");
    await channelRef.current?.send({ type: "broadcast", event: "chat", payload: { sender: clientId, id: item.id, name: item.name, text } });
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setNotice("Invite copied.");
  };

  const openDestination = () => window.open(destination, "_blank", "noopener,noreferrer");

  return <div className="roomPage">
    <header className="roomHeader"><div className="container roomHeaderInner"><Link className="back" href="/">← LiveShare</Link><div className="status"><span className="statusDot" style={{ opacity: connected ? 1 : .45 }} />{connected ? "Connected" : "Demo mode"}</div></div></header>
    <main className="container roomLayout">
      <div className="roomTop" style={{ marginBottom: 15 }}><div><strong>Room: {roomId}</strong><div className="roomUrl">Invite collaborators to this exact room.</div></div><div className="roomControls"><button className="btn" onClick={copyInvite}>Copy invite</button></div></div>
      <div className="roomGrid">
        <section className="roomCard">
          <div className="roomTop"><div><strong>Shared destination</strong><div className="roomUrl">Everyone in the room can see the destination state.</div></div></div>
          <div className="roomStage"><div><b>Shared browser surface</b><p>The web can synchronize navigation and collaboration state, but arbitrary websites cannot safely be embedded inside a normal web page. The Windows desktop client will provide the real browser surface.</p><div className="actions"><button className="btn primary" onClick={openDestination}>Open destination</button></div></div></div>
          <div className="roomBar"><div className="status">{users.length || 1} participant{(users.length || 1) === 1 ? "" : "s"}</div><div className="muted">{connected ? "Realtime room active" : "Add Supabase env vars to enable realtime"}</div></div>
        </section>
        <aside className="panel"><h3>Room controls</h3><label className="muted" htmlFor="displayName">Your name</label><input id="displayName" className="input" value={name} onChange={(e) => setName(e.target.value.slice(0, 32))} maxLength={32} /><label className="muted" htmlFor="destination" style={{ display: "block", marginTop: 14 }}>Shared URL</label><input id="destination" className="input" value={destination} onChange={(e) => setDestination(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") navigate(); }} /><button className="btn primary" style={{ width: "100%", marginTop: 9 }} onClick={navigate}>Share navigation</button>{notice && <div className="notice">{notice}</div>}
          <h3 style={{ marginTop: 25 }}>People</h3>{users.length ? users.map((u) => <div key={u.id} className="muted" style={{ padding: "6px 0" }}>● {u.name}{u.id === clientId ? " · you" : ""}</div>) : <div className="muted">You · host</div>}
        </aside>
      </div>
      <section className="panel" style={{ marginTop: 15 }}><h3>Chat</h3><div className="chatList">{messages.length === 0 ? <span className="muted">No messages yet. Say hello.</span> : messages.map((m) => <div key={m.id} style={{ marginBottom: 8 }}><strong>{m.mine ? "You" : m.name}</strong>: {m.text}</div>)}</div><div className="chatForm"><input className="input" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} placeholder="Message the room…" maxLength={500} /><button className="btn primary" onClick={sendMessage}>Send</button></div></section>
      <p className="notice">LiveShare does not proxy or inspect arbitrary third-party websites. The production desktop client will use an embedded Chromium browser plus the same room transport for full synchronized browsing.</p>
    </main>
  </div>;
}
