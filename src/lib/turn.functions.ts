import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ice = { urls: string | string[]; username?: string; credential?: string };

const STUN: Ice[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["turn:freestun.net:3478", "turn:freestun.net:3478?transport=tcp"], username: "free", credential: "free" },
  { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
];

/**
 * Returns ICE servers for video calls. When Cloudflare TURN keys are configured,
 * short-lived relay credentials are minted so calls connect across strict networks.
 */
export const getIceServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ iceServers: Ice[]; relay: boolean }> => {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !token) return { iceServers: STUN, relay: false };
    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 86400 }),
      });
      if (!res.ok) {
        console.error("TURN credentials failed", res.status, await res.text());
        return { iceServers: STUN, relay: false };
      }
      const json = (await res.json()) as { iceServers?: Ice | Ice[] };
      const list = Array.isArray(json.iceServers) ? json.iceServers : json.iceServers ? [json.iceServers] : [];
      return { iceServers: [...STUN, ...list], relay: list.length > 0 };
    } catch (e) {
      console.error("TURN credentials error", e);
      return { iceServers: STUN, relay: false };
    }
  });
