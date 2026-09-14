import Link from "next/link";

export default function NotFound() {
  return <main className="centerPage"><div className="panel centerPanel"><span className="eyebrow">404</span><h1>That room is not here.</h1><p className="muted">The link may be wrong, or the room may have expired.</p><Link className="btn primary" href="/">Back to LiveShare</Link></div></main>;
}
