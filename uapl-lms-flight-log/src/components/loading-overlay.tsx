"use client";

import { useEffect, useState } from "react";

type LoadingOverlayProps = {
  label: string;
  description?: string;
  delay?: number;
};

function LoadingContent({ label, description }: Omit<LoadingOverlayProps, "delay">) {
  return (
    <div className="app-loading-content" role="status" aria-live="polite" aria-busy="true">
      <div className="app-loading-symbol" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="app-loading-title">{label}</p>
      {description ? <p className="app-loading-description">{description}</p> : null}
      <div className="app-loading-track" aria-hidden="true"><span /></div>
    </div>
  );
}

export function LoadingScreen({ label, description }: Omit<LoadingOverlayProps, "delay">) {
  return (
    <main className="app-loading-screen">
      <LoadingContent label={label} description={description} />
    </main>
  );
}

export function LoadingOverlay({
  label,
  description,
  delay = 120,
}: LoadingOverlayProps) {
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) {
      setVisible(true);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  return <div className="app-overlay-enter app-loading-overlay">
    <LoadingContent label={label} description={description} />
  </div>;
}
