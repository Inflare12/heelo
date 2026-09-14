"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function makeRoomId(name: string) {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (clean) return clean.slice(0, 32);
  return Math.random().toString(36).slice(2, 8);
}

export default function Home() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const createRoom = () => router.push(`/room/${makeRoomId(name)}`);

  return (
    <div className="page">
      <nav className="nav">
        <div className="container navInner">
          <div className="brand"><span className="brandDot" />LiveShare</div>
          <div className="navLinks"><a href="#features">Features</a><a href="#how">How it works</a><a href="#start">Get started</a></div>
        </div>
      </nav>

      <main>
        <section className="hero"><div className="container">
          <span className="pill">● Real-time collaborative browsing</span>
          <h1>Browse together.<br />Actually together.</h1>
          <p>LiveShare gives teams and friends a shared browser room where everyone can stay in sync, communicate and work from the same destination.</p>
          <div className="actions"><button className="btn primary" onClick={() => setOpen(true)}>Create a room</button><a className="btn" href="#features">Explore features</a></div>
        </div></section>

        <section className="container"><div className="demo">
          <div className="chrome"><div className="traffic"><span /><span /><span /></div><div className="address">liveshare.app / room / design-review</div></div>
          <div className="demoBody"><aside className="side"><div className="active">Shared browser</div><div>People</div><div>Chat</div><div>Notes</div></aside><div className="shared"><div className="sharedCenter"><b>Your shared browser.</b>Navigation, presence and context in one room.</div><span className="cursor c1">Alex</span><span className="cursor c2">Sam</span></div></div>
        </div>
        <div className="features" id="features">
          <article className="card"><div className="icon">↗</div><h3>Shared navigation</h3><p>Keep everyone focused on the same destination instead of sending screenshots and links back and forth.</p></article>
          <article className="card"><div className="icon">◉</div><h3>Live presence</h3><p>See who is in the room and keep collaboration immediate with participant presence and shared context.</p></article>
          <article className="card"><div className="icon">⌁</div><h3>One-click rooms</h3><p>Create a room, copy the invite, and bring collaborators in with a simple workflow.</p></article>
        </div></section>

        <section className="section" id="how"><div className="container"><div className="sectionHead"><span className="eyebrow">How it works</span><h2>Three steps. No friction.</h2><p>Designed around the simplest possible collaboration flow.</p></div><div className="steps">
          <div className="step"><span className="num">01</span><h3>Create</h3><p>Start a room and get a unique invite link instantly.</p></div>
          <div className="step"><span className="num">02</span><h3>Invite</h3><p>Share the room link with a friend, teammate or client.</p></div>
          <div className="step"><span className="num">03</span><h3>Collaborate</h3><p>Navigate together, chat and keep everyone on the same context.</p></div>
        </div></div></section>

        <section className="container" id="start"><div className="cta"><h2>Ready to browse together?</h2><p>Start a room and invite someone. The realtime transport layer is designed to plug into the same room experience.</p><button className="btn primary" onClick={() => setOpen(true)}>Create your first room</button></div></section>
      </main>

      <footer className="footer"><div className="container footerInner"><span>LiveShare · Collaborative browsing</span><span>Windows-first · Built for real-time rooms</span></div></footer>

      {open && <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="modal"><h3 id="create-title">Create a room</h3><p>Choose a short room name or leave it generated automatically.</p><input className="input" maxLength={32} autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createRoom(); }} placeholder="e.g. design-review" />
          <div className="modalActions"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" onClick={createRoom}>Create room</button></div>
        </div>
      </div>}
    </div>
  );
}
