import { Socket } from 'socket.io-client';

export class VoiceChatManager {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private socket: Socket | null = null;
  private onRemoteStreamAdd: (peerId: string, stream: MediaStream) => void;
  private onRemoteStreamRemove: (peerId: string) => void;
  public isMuted: boolean = true; // default mute

  constructor(
    onRemoteStreamAdd: (peerId: string, stream: MediaStream) => void,
    onRemoteStreamRemove: (peerId: string) => void
  ) {
    this.onRemoteStreamAdd = onRemoteStreamAdd;
    this.onRemoteStreamRemove = onRemoteStreamRemove;
  }

  public async initialize(socket: Socket) {
    this.socket = socket;
    
    // Request microphone access
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Mute the local track initially
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
    } catch (e) {
      console.error("Microphone access denied or not available", e);
      return;
    }

    // Set up socket listeners for WebRTC signaling
    this.socket.on('webrtc_offer', async (data: { senderId: string, offer: RTCSessionDescriptionInit }) => {
      const pc = this.getOrCreatePeerConnection(data.senderId);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket?.emit('webrtc_answer', { targetId: data.senderId, answer });
    });

    this.socket.on('webrtc_answer', async (data: { senderId: string, answer: RTCSessionDescriptionInit }) => {
      const pc = this.peerConnections.get(data.senderId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    this.socket.on('webrtc_ice_candidate', async (data: { senderId: string, candidate: RTCIceCandidateInit }) => {
      const pc = this.peerConnections.get(data.senderId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });
  }

  public connectToPeers(peerIds: string[]) {
    if (!this.localStream || !this.socket) return;
    
    // We only initiate connection if our ID is "greater" to avoid duplicate offers
    // But since we don't have our own ID easily available here as a string comparison,
    // we just connect to everyone not yet connected
    peerIds.forEach(async (peerId) => {
       if (peerId !== this.socket!.id && !this.peerConnections.has(peerId) && !peerId.startsWith('BOT_')) {
          const pc = this.getOrCreatePeerConnection(peerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.socket?.emit('webrtc_offer', { targetId: peerId, offer });
       }
    });
  }

  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ]
    });

    this.peerConnections.set(peerId, pc);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket?.emit('webrtc_ice_candidate', {
          targetId: peerId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.onRemoteStreamAdd(peerId, event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.onRemoteStreamRemove(peerId);
        this.peerConnections.delete(peerId);
      }
    };

    return pc;
  }

  public toggleMute(): boolean {
    if (this.localStream) {
      this.isMuted = !this.isMuted;
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
      return this.isMuted;
    }
    return true;
  }

  public disconnectAll() {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
    if (this.socket) {
      this.socket.off('webrtc_offer');
      this.socket.off('webrtc_answer');
      this.socket.off('webrtc_ice_candidate');
    }
  }
}
