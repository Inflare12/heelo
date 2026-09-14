"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../lib/supabase";
import { ensureSession } from "../lib/auth";

function makeRoomCode(name: string) {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${clean || "room"}-${suffix}`;
}

export default function Home() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const createRoom = async () => {
    if (busy) return;
    setBusy(true); setError("");
    const supabase = getSupabase();
    if (!supabase) { setError("LiveShare is not configured. Please try again later."); setBusy(false); return; }
    const { session, error: authError } = await ensureSession(supabase);
    if (authError || !session) { setError("Could not start a secure session. Please try again later."); setBusy(false); return; }
    const code = makeRoomCode(name);
    const title = name.trim().slice(0, 80) || "LiveShare room";
    const { data: room, error: insertError } = await supabase.from("rooms").insert({ code, title, host_user_id: session.user.id, current_url: "https://example.com" }).select("id, code").single();
    if (insertError || !room) { setError("Could not create the room. Please try again."); setBusy(false); return; }
    const { error: memberError } = await supabase.from("room_members").insert({ room_id: room.id, user_id: session.user.id });
    if (memberError) { await supabase.from("rooms").update({ is_active: false }).eq("id", room.id); setError("Could not secure the room membership. Please try again."); setBusy(false); return; }
    setBusy(false); setOpen(false); router.push(`/room/${encodeURIComponent(room.code)}`);
  };

  return (
    <div className="page">
      <nav className="nav"><div className="container navInner"><div className="brand"><span className="brandDot" />LiveShare</div><div className="navLinks"><a href="#features">Features</a><a href="#how">How it works</a><a href="#start">Get started</a></div></div></nav>
      <main>
        <section className="hero"><div className="container"><span className="pill">● Secure real-time collaborative browsing</span><h1>Browse together.<br />Actually together.</h1><p>LiveShare gives teams and friends a shared browser room where everyone can stay in sync, communicate and work from the same destination.</p><div className="actions"><button className="btn primary" onClick={() => { setError(""); setOpen(true); }}>Create a room</button><a className="btn" href="#features">Explore features</a></div></div></section>
        <section className="container"><div className="demo"><div className="chrome"><div className="traffic"><span /><span /><span /></div><div className="address">liveshare.app / room / design-review</div></div><div className="demoBody"><aside className="side"><div className="active">Shared browser</div><div>People</div><div>Chat</div><div>Notes</div></aside><div className="shared"><div className="sharedCenter"><b>Your shared browser.</b>Navigation, presence and context in one room.</div><span className="cursor c1">Alex</span><span className="cursor c2">Sam</span></div></div></div>
          <div className="features" id="features"><article className="card"><div className="icon">↗</div><h3>Shared navigation</h3><p>Keep everyone focused on the same destination instead of sending screenshots and links back and forth.</p></article><article className="card"><div className="icon">◉</div><h3>Live presence</h3><p>See who is in the room and keep collaboration immediate with participant presence and shared context.</p></article><article className="card"><div className="icon">⌁</div><h3>One-click rooms</h3><p>Create a private room, copy the invite, and bring collaborators in with a simple workflow.</p></article></div></section>
        <section className="section" id="how"><div className="container"><div className="sectionHead"><span className="eyebrow">How it works</span><h2>Three steps. No friction.</h2><p>Designed around the simplest possible collaboration flow.</p></div><div className="steps"><div className="step"><span className="num">01</span><h3>Create</h3><p>Start a secure room and get a unique invite link instantly.</p></div><div className="step"><span className="num">02</span><h3>Invite</h3><p>Share the room link with a friend, teammate or client.</p></div><div className="step"><span className="num">03</span><h3>Collaborate</h3><p>Navigate together, chat and keep everyone on the same context.</p></div></div></div></section>
        <section className="container" id="start"><div className="cta"><h2>Ready to browse together?</h2><p>Start a room and invite someone. The realtime transport layer keeps collaboration fast and isolated.</p><button className="btn primary" onClick={() => { setError(""); setOpen(true); }}>Create your first room</button></div></section>
      </main>
      <footer className="footer"><div className="container footerInner"><span>LiveShare · Collaborative browsing</span><span>Windows-first · Built for real-time rooms</span></div></footer>
      {open && <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setOpen(false); }}><div className="modal"><h3 id="create-title">Create a room</h3><p>Choose a short room name. LiveShare adds a secure random suffix.</p><input className="input" maxLength={24} autoFocus value={name} disabled={busy} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void createRoom(); }} placeholder="e.g. design-review" />{error && <div className="notice" role="alert">{error}</div>}<div className="modalActions"><button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void createRoom()}>{busy ? "Creating…" : "Create room"}</button></div></div></div>}
    </div>
  );
}
