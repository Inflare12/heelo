"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "../../../lib/supabase";
import { ensureSession } from "../../../lib/auth";

type Message = { id: string; name: string; text: string; mine?: boolean; createdAt?: string };
type PresenceUser = { id: string; name: string };
type ShareRequest = { userId: string; name: string; approved: boolean };
type RemoteStream = { userId: string; name: string; stream: MediaStream };

const randomName = () => `Guest-${Math.random().toString(36).slice(2, 6)}`;
const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const validUrl = (value: string) => { try { const u = new URL(value); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };
const rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

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
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState("Not sharing");
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [shareRequests, setShareRequests] = useState<ShareRequest[]>([]);
  const [permission, setPermission] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const hostIdRef = useRef<string | null>(null);
  const nameRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const sharingRef = useRef(false);
  const peerRefs = useRef(new Map<string, RTCPeerConnection>());
  const remoteStreamRefs = useRef(new Map<string, MediaStream>());
  const remoteNamesRef = useRef(new Map<string, string>());
  const clientId = useMemo(() => randomId(), []);

  useEffect(() => {
    const saved = localStorage.getItem("liveshare-name");
    const next = saved || randomName();
    nameRef.current = next;
    setName(next);
  }, []);
  useEffect(() => { nameRef.current = name.slice(0, 32); }, [name]);

  const closePeer = (peerId: string) => {
    const pc = peerRefs.current.get(peerId);
    if (pc) pc.close();
    peerRefs.current.delete(peerId);
  };

  const publishRemoteStreams = () => {
    setRemoteStreams(Array.from(remoteStreamRefs.current.entries()).map(([userId, stream]) => ({ userId, stream, name: remoteNamesRef.current.get(userId) || "Guest" })));
  };

  const sendSignal = async (event: string, payload: Record<string, unknown>) => {
    await channelRef.current?.send({ type: "broadcast", event, payload: { sender: clientId, ...payload } });
  };

  const makeReceiverPeer = async (sharerId: string, sharerName: string) => {
    if (sharerId === clientId || peerRefs.current.has(sharerId)) return;
    const pc = new RTCPeerConnection(rtcConfig);
    peerRefs.current.set(sharerId, pc);
    remoteNamesRef.current.set(sharerId, sharerName);
    pc.onicecandidate = e => { if (e.candidate) void sendSignal("webrtc-ice", { target: sharerId, from: clientId, candidate: e.candidate.toJSON() }); };
    pc.ontrack = e => { const stream = e.streams[0]; if (stream) { remoteStreamRefs.current.set(sharerId, stream); publishRemoteStreams(); } };
    pc.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(pc.connectionState)) { closePeer(sharerId); remoteStreamRefs.current.delete(sharerId); publishRemoteStreams(); } };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal("webrtc-offer", { target: sharerId, from: clientId, offer });
  };

  const makeSharerPeer = async (receiverId: string, offer: RTCSessionDescriptionInit) => {
    if (!streamRef.current) return;
    closePeer(receiverId);
    const pc = new RTCPeerConnection(rtcConfig);
    peerRefs.current.set(receiverId, pc);
    streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current as MediaStream));
    pc.onicecandidate = e => { if (e.candidate) void sendSignal("webrtc-ice", { target: receiverId, from: clientId, candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(pc.connectionState)) closePeer(receiverId); };
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal("webrtc-answer", { target: receiverId, from: clientId, answer });
  };

  const startScreenShare = async () => {
    if (sharingRef.current) return;
    const supabase = getSupabase();
    if (!supabase || !roomIdRef.current || !userIdRef.current) return;
    if (!isHost) {
      const { data } = await supabase.from("room_share_permissions").select("approved").eq("room_id", roomIdRef.current).eq("user_id", userIdRef.current).maybeSingle();
      if (!data?.approved) { setNotice("The host must approve your screen-sharing request first."); return; }
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true });
      streamRef.current = stream;
      sharingRef.current = true;
      setSharing(true);
      setShareStatus("Sharing your screen");
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { void stopScreenShare(); });
      await sendSignal("share-start", { sharerId: clientId, name: nameRef.current });
      const state = channelRef.current?.presenceState<PresenceUser>() || {};
      const peers = Object.values(state).flat().filter(p => p.id !== clientId);
      for (const peer of peers) await sendSignal("share-start", { sharerId: clientId, name: nameRef.current, target: peer.id });
    } catch (e) {
      const message = e instanceof DOMException && e.name === "NotAllowedError" ? "Screen sharing was cancelled." : "Could not start screen sharing. Check your browser permissions.";
      setNotice(message);
    }
  };

  const stopScreenShare = async () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    sharingRef.current = false;
    setSharing(false);
    setShareStatus("Not sharing");
    peerRefs.current.forEach(pc => pc.close());
    peerRefs.current.clear();
    await sendSignal("share-stop", { sharerId: clientId });
  };

  const requestScreenShare = async () => {
    const supabase = getSupabase();
    if (!supabase || !roomIdRef.current || !userIdRef.current) return;
    const { error: requestError } = await supabase.rpc("request_screen_share", { p_room_id: roomIdRef.current });
    if (requestError) { setNotice("Could not send the screen-sharing request."); return; }
    await sendSignal("share-request", { userId: clientId, name: nameRef.current });
    setShareStatus("Waiting for host approval");
    setNotice("Request sent to the host.");
  };

  const setPermissionFor = async (request: ShareRequest, approved: boolean) => {
    const supabase = getSupabase();
    if (!supabase || !roomIdRef.current) return;
    const { error: permissionError } = await supabase.rpc("set_screen_share_permission", { p_room_id: roomIdRef.current, p_user_id: request.userId, p_approved: approved });
    if (permissionError) { setNotice("Could not change screen-sharing permission."); return; }
    setShareRequests(current => current.filter(r => r.userId !== request.userId));
    await sendSignal("share-permission", { userId: request.userId, approved });
    setNotice(`${request.name} can ${approved ? "now" : "no longer"} share their screen.`);
  };

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
      hostIdRef.current = room.host_user_id;
      setRoomTitle(room.title || "LiveShare room");
      setIsHost(room.host_user_id === session.user.id);
      if (room.current_url && validUrl(room.current_url)) setDestination(room.current_url);
      if (room.host_user_id !== session.user.id) {
        const { data: ownPermission } = await supabase.from("room_share_permissions").select("approved").eq("room_id", roomId).eq("user_id", session.user.id).maybeSingle();
        setPermission(Boolean(ownPermission?.approved));
      } else {
        const { data: requests } = await supabase.from("room_share_permissions").select("user_id,approved").eq("room_id", roomId).eq("approved", false);
        if (requests) setShareRequests(requests.map(r => ({ userId: r.user_id, name: "Participant", approved: false })));
      }
      const { data: history } = await supabase.from("room_events").select("id,event_type,payload,created_at").eq("room_id", roomId).order("created_at", { ascending: true }).limit(100);
      if (history) setMessages(history.filter(e => e.event_type === "chat").map(e => ({ id: String(e.id), name: String(e.payload?.name || "Guest"), text: String(e.payload?.text || ""), createdAt: String(e.created_at) })));
      const channel = supabase.channel(`room:${roomCode}`);
      channelRef.current = channel;
      channel.on("broadcast", { event: "navigate" }, ({ payload }) => { if (payload?.sender !== clientId && validUrl(payload?.url)) { setDestination(payload.url); setIframeBlocked(false); setNotice(`Navigation shared by ${String(payload?.name || "another participant")}.`); } });
      channel.on("broadcast", { event: "chat" }, ({ payload }) => { if (!payload || payload.sender === clientId || typeof payload.text !== "string") return; setMessages(current => [...current, { id: String(payload.id || randomId()), name: String(payload.name || "Guest"), text: payload.text.slice(0, 500), createdAt: new Date().toISOString() }].slice(-100)); });
      channel.on("broadcast", { event: "share-request" }, ({ payload }) => { if (room.host_user_id === session.user.id && payload?.userId && payload.userId !== clientId) setShareRequests(current => current.some(r => r.userId === payload.userId) ? current : [...current, { userId: payload.userId, name: String(payload.name || "Participant"), approved: false }]); });
      channel.on("broadcast", { event: "share-permission" }, ({ payload }) => { if (payload?.userId !== clientId) return; setPermission(Boolean(payload.approved)); if (!payload.approved && sharingRef.current) void stopScreenShare(); setShareStatus(payload.approved ? "Screen sharing approved" : "Screen sharing not approved"); });
      channel.on("broadcast", { event: "share-start" }, ({ payload }) => { if (payload?.sharerId === clientId) return; const target = payload?.target; if (target && target !== clientId) return; void makeReceiverPeer(String(payload.sharerId), String(payload.name || "Participant")); });
      channel.on("broadcast", { event: "webrtc-offer" }, ({ payload }) => { if (payload?.target !== clientId || !sharingRef.current || !payload.offer) return; void makeSharerPeer(String(payload.from), payload.offer as RTCSessionDescriptionInit); });
      channel.on("broadcast", { event: "webrtc-answer" }, async ({ payload }) => { if (payload?.target !== clientId || !payload.answer) return; const pc = peerRefs.current.get(String(payload.from)); if (pc && pc.signalingState === "have-local-offer") await pc.setRemoteDescription(payload.answer as RTCSessionDescriptionInit); });
      channel.on("broadcast", { event: "webrtc-ice" }, async ({ payload }) => { if (payload?.target !== clientId || !payload.candidate) return; const pc = peerRefs.current.get(String(payload.from)); if (pc) { try { await pc.addIceCandidate(payload.candidate as RTCIceCandidateInit); } catch {} } });
      channel.on("broadcast", { event: "share-stop" }, ({ payload }) => { if (!payload?.sharerId || payload.sharerId === clientId) return; const id = String(payload.sharerId); closePeer(id); remoteStreamRefs.current.delete(id); remoteNamesRef.current.delete(id); publishRemoteStreams(); });
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const nextUsers = Object.values(state).flat().map(v => ({ id: v.id, name: v.name })).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);
        setUsers(nextUsers);
        if (sharingRef.current) void (async () => { for (const peer of nextUsers) if (peer.id !== clientId) await sendSignal("share-start", { sharerId: clientId, name: nameRef.current, target: peer.id }); })();
      });
      channel.subscribe(async status => { if (cancelled) return; if (status === "SUBSCRIBED") { setConnected(true); await channel.track({ id: clientId, name: nameRef.current }); } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { setConnected(false); setError("Realtime connection failed. Check your connection and retry."); } });
    };
    void start();
    return () => { cancelled = true; void stopScreenShare(); setConnected(false); channelRef.current?.unsubscribe(); channelRef.current = null; peerRefs.current.forEach(pc => pc.close()); peerRefs.current.clear(); remoteStreamRefs.current.clear(); setRemoteStreams([]); };
    // Room identity is stable; the name is read from nameRef so changing it does not rebuild the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, clientId, name ? "ready" : ""]);

  const navigate = async () => {
    let url = destination.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!validUrl(url)) { setNotice("Enter a valid http or https web address."); return; }
    setDestination(url); setIframeBlocked(false); setNotice("Navigation shared with the room.");
    await channelRef.current?.send({ type: "broadcast", event: "navigate", payload: { sender: clientId, name: nameRef.current, url } });
    const supabase = getSupabase();
    if (supabase && roomIdRef.current && userIdRef.current) { await supabase.from("room_events").insert({ room_id: roomIdRef.current, actor_user_id: userIdRef.current, event_type: "navigate", payload: { url } }); if (isHost) await supabase.from("rooms").update({ current_url: url }).eq("id", roomIdRef.current); }
  };

  const sendMessage = async () => {
    const text = message.trim().slice(0, 500);
    if (!text || !channelRef.current) return;
    const item = { id: randomId(), name: nameRef.current || "Guest", text, mine: true, createdAt: new Date().toISOString() };
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
      {error && <div className="notice errorBox" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
      <div className="roomGrid">
        <section className="roomCard">
          <div className="roomTop"><div><strong>Shared browser</strong><div className="roomUrl">Shared navigation plus live screen sharing. Websites that block embedding can be shown through screen sharing.</div></div></div>
          <div className="browserToolbar"><input className="input" aria-label="Shared web address" value={destination} onChange={e => setDestination(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void navigate(); }} /><button className="btn primary" onClick={() => void navigate()}>Share</button><button className="btn" onClick={() => window.open(destination, "_blank", "noopener,noreferrer")}>Open</button></div>
          <div className="webViewport">{validUrl(destination) && !iframeBlocked ? <iframe title="Shared destination" src={destination} sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts" onError={() => setIframeBlocked(true)} /> : <div className="iframeFallback"><b>This site cannot be displayed inside LiveShare.</b><p>Some sites intentionally block iframe embedding. Open it in a tab or use screen sharing to show it to everyone.</p><button className="btn primary" onClick={() => window.open(destination, "_blank", "noopener,noreferrer")}>Open in a new tab</button></div>}</div>
          <div className="roomBar"><div className="status">{users.length || 1} participant{(users.length || 1) === 1 ? "" : "s"}</div><div className="muted">{connected ? "Realtime room active" : "Connecting to realtime…"}</div></div>
        </section>
        <aside className="panel"><h3>Room controls</h3><label className="muted" htmlFor="displayName">Your name</label><input id="displayName" className="input" value={name} onChange={e => setName(e.target.value.slice(0, 32))} maxLength={32}/><div className="shareControls"><h3 style={{marginTop:25}}>Screen sharing</h3><div className="muted">{shareStatus}</div>{sharing ? <button className="btn" onClick={() => void stopScreenShare()}>Stop sharing</button> : isHost || permission ? <button className="btn primary" onClick={() => void startScreenShare()}>Share my screen</button> : <button className="btn primary" onClick={() => void requestScreenShare()}>Request screen-share permission</button>}</div>{isHost && shareRequests.length > 0 && <div className="requestBox"><h3>Sharing requests</h3>{shareRequests.map(r => <div className="request" key={r.userId}><div><strong>{r.name}</strong><div className="muted">wants to share their screen</div></div><div className="requestActions"><button className="btn primary" onClick={() => void setPermissionFor(r, true)}>Allow</button><button className="btn" onClick={() => void setPermissionFor(r, false)}>Deny</button></div></div>)}</div>}<h3 style={{marginTop:25}}>People</h3>{users.length ? users.map(u => <div key={u.id} className="person"><span className="personDot" />{u.name}{u.id === clientId ? " · you" : ""}</div>) : <div className="muted">You · {isHost ? "host" : "participant"}</div>}</aside>
      </div>
      {remoteStreams.length > 0 && <section className="panel screenPanel"><div className="chatHeader"><div><h3>Live screens</h3><div className="muted">Screen shares are peer-to-peer between room participants.</div></div><span className="muted">{remoteStreams.length} live</span></div><div className="screenGrid">{remoteStreams.map(item => <ScreenTile key={item.userId} item={item} />)}</div></section>}
      <section className="panel chatPanel"><div className="chatHeader"><div><h3>Room chat</h3><div className="muted">Messages are kept with the room history.</div></div><span className="muted">{messages.length}/100</span></div><div className="chatList" aria-live="polite">{messages.length === 0 ? <span className="muted">No messages yet. Say hello.</span> : messages.map(m => <div key={m.id} className={m.mine ? "chatMessage mine" : "chatMessage"}><div><strong>{m.mine ? "You" : m.name}</strong><span className="chatTime">{m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span></div><div>{m.text}</div></div>)}</div><div className="chatForm"><input className="input" value={message} onChange={e => setMessage(e.target.value.slice(0,500))} onKeyDown={e => { if (e.key === "Enter") void sendMessage(); }} placeholder="Message the room…" maxLength={500}/><button className="btn primary" onClick={() => void sendMessage()} disabled={!connected || !message.trim()}>Send</button></div></section>
      <div className="featureStrip"><span>✓ Shared navigation</span><span>✓ Live presence</span><span>✓ Persistent chat</span><span>✓ WebRTC screen sharing</span><span>✓ Host-controlled permissions</span></div>
    </main>
  </div>;
}

function ScreenTile({ item }: { item: RemoteStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => { if (ref.current) { ref.current.srcObject = item.stream; void ref.current.play().catch(() => {}); } }, [item.stream]);
  return <div className="screenTile"><div className="screenLabel"><span className="personDot" />{item.name}</div><video ref={ref} autoPlay playsInline controls={false} /></div>;
}
