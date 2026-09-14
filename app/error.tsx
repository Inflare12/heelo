"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="centerPage"><div className="panel centerPanel"><span className="eyebrow">Something went wrong</span><h1>LiveShare hit an unexpected error.</h1><p className="muted">Try the page again. Your room data is stored separately from this screen.</p><div className="actions"><button className="btn primary" onClick={() => reset()}>Try again</button><a className="btn" href="/">Home</a></div></div></main>;
}
