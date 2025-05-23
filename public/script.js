const socket = io();
const localVideo = document.getElementById('local-video');
const remoteVideos = document.getElementById('remote-videos');
const peerConnections = {};

const roomId = window.location.pathname.substring(1);

// Get user media
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localVideo.srcObject = stream;

    socket.emit('join-room', roomId);

    socket.on('user-connected', userId => {
      if (peerConnections[userId]) return; // Avoid duplicates

      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });

      peerConnections[userId] = peerConnection;

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = event => {
        const remoteStream = event.streams[0];
        if (!document.getElementById(`video-${userId}`)) {
          const video = document.createElement('video');
          video.id = `video-${userId}`;
          video.srcObject = remoteStream;
          video.autoplay = true;
          video.playsInline = true;
          remoteVideos.appendChild(video);
        }
      };

      peerConnection.onicecandidate = event => {
        if (event.candidate) {
          socket.emit('signal', {
            to: userId,
            signal: { candidate: event.candidate }
          });
        }
      };

      peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
          socket.emit('signal', {
            to: userId,
            signal: { sdp: peerConnection.localDescription }
          });
        });
    });

    socket.on('signal', async ({ from, signal }) => {
      let peerConnection = peerConnections[from];

      if (!peerConnection) {
        peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
          ]
        });

        peerConnections[from] = peerConnection;

        peerConnection.ontrack = event => {
          const remoteStream = event.streams[0];
          if (!document.getElementById(`video-${from}`)) {
            const video = document.createElement('video');
            video.id = `video-${from}`;
            video.srcObject = remoteStream;
            video.autoplay = true;
            video.playsInline = true;
            remoteVideos.appendChild(video);
          }
        };

        peerConnection.onicecandidate = event => {
          if (event.candidate) {
            socket.emit('signal', {
              to: from,
              signal: { candidate: event.candidate }
            });
          }
        };

        stream.getTracks().forEach(track => {
          peerConnection.addTrack(track, stream);
        });
      }

      if (signal.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        if (signal.sdp.type === 'offer') {
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit('signal', {
            to: from,
            signal: { sdp: peerConnection.localDescription }
          });
        }
      } else if (signal.candidate) {
        peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    });

    socket.on('user-disconnected', userId => {
      if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
      }
      const video = document.getElementById(`video-${userId}`);
      if (video) video.remove();
    });
  });
