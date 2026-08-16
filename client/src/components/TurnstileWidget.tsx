import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          language?: string;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
};

/** Cloudflare Turnstile widget — «أنا مش روبوت» */
export function TurnstileWidget({ siteKey, onToken }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const render = () => {
      if (cancelled || !hostRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
      hostRef.current.innerHTML = "";
      widgetIdRef.current = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        theme: "light",
        language: "ar",
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
      setReady(true);
    };

    const existing = document.querySelector("script[data-turnstile]");
    if (window.turnstile) {
      render();
    } else if (existing) {
      window.onTurnstileLoad = render;
    } else {
      window.onTurnstileLoad = render;
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-turnstile", "1");
      document.head.appendChild(s);
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, onToken]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={hostRef} className="min-h-[65px]" />
      {!ready && <p className="text-xs text-slate-400">جاري تحميل التحقق...</p>}
    </div>
  );
}
