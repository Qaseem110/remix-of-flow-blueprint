/** One ordered handshake per peer, including ICE that arrives before the SDP. */
export function createCallPeer(
  peer: RTCPeerConnection,
  send: (event: string, payload: Record<string, unknown>) => void,
) {
  let started = false;
  let pending: RTCIceCandidateInit[] = [];
  let work = Promise.resolve();
  const ordered = (action: () => Promise<void>) => {
    const result = work.then(action);
    work = result.catch(() => {});
    return result;
  };
  const flush = async () => {
    const candidates = pending;
    pending = [];
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  };
  return {
    offer: () => ordered(async () => {
      if (started || peer.signalingState === "closed") return;
      started = true;
      await peer.setLocalDescription(await peer.createOffer());
      send("offer", { sdp: peer.localDescription });
    }),
    receiveOffer: (sdp: RTCSessionDescriptionInit) => ordered(async () => {
      if (started) return;
      started = true;
      await peer.setRemoteDescription(sdp);
      await flush();
      await peer.setLocalDescription(await peer.createAnswer());
      send("answer", { sdp: peer.localDescription });
    }),
    receiveAnswer: (sdp: RTCSessionDescriptionInit) => ordered(async () => {
      if (peer.signalingState !== "have-local-offer") return;
      await peer.setRemoteDescription(sdp);
      await flush();
    }),
    receiveIce: (candidate: RTCIceCandidateInit) => ordered(async () => {
      if (!peer.remoteDescription) pending.push(candidate);
      else await peer.addIceCandidate(candidate);
    }),
  };
}