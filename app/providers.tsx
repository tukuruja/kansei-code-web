"use client";

import { useEffect } from "react";
import { ToastProvider } from "@/lib/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  // #12: Service Worker登録（PWA化）
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW登録失敗は致命的でないので無視
      });
    }
  }, []);

  return <ToastProvider>{children}</ToastProvider>;
}
