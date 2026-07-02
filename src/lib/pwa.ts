// PWA service worker registration — guarded to never register in the
// Lovable editor preview / dev / iframe contexts.
//
// Rules (from Lovable PWA skill):
//  - Only single registration wrapper (this file).
//  - Refuse if not PROD, if in iframe, if hostname is a Lovable preview,
//    or if URL has ?sw=off (kill-switch that unregisters instead).

const PREVIEW_HOSTNAMES = [
  "lovableproject.com",
  "lovableproject-dev.com",
  "beta.lovable.dev",
];

function isPreviewHost(host: string): boolean {
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  return PREVIEW_HOSTNAMES.some((h) => host === h || host.endsWith(`.${h}`));
}

async function unregisterAppSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* noop */
  }
}

export function registerPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const inIframe = window.top !== window.self;
  const isPreview = isPreviewHost(window.location.hostname);
  const killSwitch = url.searchParams.get("sw") === "off";
  const notProd = !import.meta.env.PROD;

  if (notProd || inIframe || isPreview || killSwitch) {
    void unregisterAppSW();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* silent — PWA is a progressive enhancement */
    });
  });
}
