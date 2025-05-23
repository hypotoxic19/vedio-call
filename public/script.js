const socket = io();

const localVideo = document.getElementById('local-video');
const remoteVideos = document.getElementById('remote-videos');

let localStream;
let peers = {}; // Keep track of peer connections

// 1. Get room ID from URL
const roomId = window.location.pathname.split('/').pop();

// 2. Join the room
socket.emit('join-room', roomId);

// 3. Get user's video/audio
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localVideo.srcObject = stream;
  localStream = stream;

  // 4. When a new user connects
  socket.on('user-connected', userId => {
    const peer = createPeer(userId);
    peers[userId] = peer;
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
  });

  // 5. Receive signaling data
  socket.on('signal', async ({ from, signal }) => {
    if (!peers[from]) {
      const peer = createPeer(from);
      peers[from] = peer;
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
    }
    await peers[from].setRemoteDescription(new RTCSessionDescription(signal));
    if (signal.type === 'offer') {
      const answer = await peers[from].createAnswer();
      await peers[from].setLocalDescription(answer);
      socket.emit('signal', { to: from, signal: peers[from].localDescription });
    }
  });

  // 6. Handle user disconnected
  socket.on('user-disconnected', userId => {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
      const video = document.getElementById(userId);
      if (video) video.remove();
    }
  });

}).catch(error => {
  console.error('Error accessing media devices.', error);
});

// 7. Create peer connection
function createPeer(userId) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  peer.onicecandidate = e => {
    if (e.candidate) {
      socket.emit('signal', { to: userId, signal: e.candidate });
    }
  };

  peer.ontrack = e => {
    let video = document.getElementById(userId);
    if (!video) {
      video = document.createElement('video');
      video.id = userId;
      video.autoplay = true;
      video.playsInline = true;
      remoteVideos.appendChild(video);
    }
    video.srcObject = e.streams[0];
  };

  // If initiator
  peer.onnegotiationneeded = async () => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('signal', { to: userId, signal: peer.localDescription });
  };

  return peer;
}
