import { describe, expect, it, vi } from "vitest";
import { createCallPeer } from "@/lib/call-peer";

function fixture() {
  const peer = {
    signalingState: "stable",
    remoteDescription: null as RTCSessionDescriptionInit | null,
    localDescription: null as RTCSessionDescriptionInit | null,
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer" })),
    createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer" })),
    setLocalDescription: vi.fn(async (sdp: RTCSessionDescriptionInit) => {
      peer.localDescription = sdp;
      peer.signalingState = sdp.type === "offer" ? "have-local-offer" : "stable";
    }),
    setRemoteDescription: vi.fn(async (sdp: RTCSessionDescriptionInit) => { peer.remoteDescription = sdp; }),
    addIceCandidate: vi.fn(async () => {
      if (!peer.remoteDescription) throw new Error("Missing remote SDP");
    }),
  };
  const send = vi.fn();
  return { peer, send, call: createCallPeer(peer as unknown as RTCPeerConnection, send) };
}

describe("video call handshake", () => {
  it("does not restart an offer when greetings arrive repeatedly", async () => {
    const { peer, send, call } = fixture();
    await Promise.all([call.offer(), call.offer(), call.offer()]);
    expect(peer.createOffer).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("offer", { sdp: { type: "offer", sdp: "offer" } });
  });

  it("retains early ICE until the remote offer is installed", async () => {
    const { peer, call } = fixture();
    const candidate = { candidate: "candidate:early" };
    await call.receiveIce(candidate);
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
    await call.receiveOffer({ type: "offer", sdp: "remote" });
    expect(peer.addIceCandidate).toHaveBeenCalledWith(candidate);
    expect(peer.createAnswer).toHaveBeenCalledTimes(1);
  });

  it("retains early ICE until the remote answer is installed", async () => {
    const { peer, call } = fixture();
    await call.offer();
    await call.receiveIce({ candidate: "candidate:answer" });
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
    await call.receiveAnswer({ type: "answer", sdp: "remote" });
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(1);
  });
});