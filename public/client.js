// -------------------- Config --------------------
const socket = io(window.location.origin); // automatically uses HTTPS/WSS on Render
const peers = {};
let localStream;
let isSharing = false;
let isWatching = false;

// -------------------- Room Code --------------------
function generateRoomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

let roomCode = generateRoomCode();
document.getElementById('roomCodeDisplay').textContent = roomCode;

document.getElementById('generateCodeBtn').addEventListener('click', () => {
    roomCode = generateRoomCode();
    document.getElementById('roomCodeDisplay').textContent = roomCode;
    updateStatus('Room code updated', 'disconnected');
});

// -------------------- Status --------------------
function updateStatus(message, type) {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
}

// -------------------- STUN/TURN --------------------
const pcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        // For production, add TURN server for mobile reliability
    ]
};

// -------------------- Share Screen --------------------
document.getElementById('shareBtn').onclick = async () => {
    if (isSharing) return alert("Already sharing!");

    try {
        // Desktop: screen share, Mobile fallback: camera
        if (navigator.mediaDevices.getDisplayMedia) {
            localStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
        } else {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }

        // Stop sharing when user stops track
        localStream.getTracks().forEach(track => {
            track.onended = stopSharing;
        });

        document.getElementById('localVideo').srcObject = localStream;
        isSharing = true;
        updateStatus(`Sharing screen in room: ${roomCode}`, 'connected');

        socket.emit('broadcaster', roomCode);

    } catch (e) {
        console.error(e);
        alert("Cannot start sharing. Using camera fallback if possible.");
        isSharing = false;
        updateStatus('Screen share failed', 'disconnected');
    }
};

// -------------------- Watch Screen --------------------
document.getElementById('watchBtn').onclick = () => {
    if (isWatching) return alert("Already watching!");
    const watchRoomCode = document.getElementById('roomCodeInput').value;
    if (!watchRoomCode || watchRoomCode.length !== 5) return alert("Enter valid 5-digit room code");

    isWatching = true;
    updateStatus(`Connecting to room: ${watchRoomCode}`, 'connected');
    socket.emit('watcher', watchRoomCode);
};

// -------------------- Stop Sharing --------------------
function stopSharing() {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    Object.values(peers).forEach(pc => pc.close());
    Object.keys(peers).forEach(k => delete peers[k]);
    isSharing = false;
    updateStatus('Screen sharing stopped', 'disconnected');
    socket.emit('stop-sharing', roomCode);
}

// -------------------- Socket Events --------------------

// For broadcaster
socket.on('watcher', id => {
    if (!isSharing) return;
    const pc = new RTCPeerConnection(pcConfig);
    peers[id] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = e => {
        if (e.candidate) socket.emit('ice-candidate', id, e.candidate);
    };

    pc.createOffer().then(offer => pc.setLocalDescription(offer))
        .then(() => socket.emit('offer', id, pc.localDescription, roomCode));
});

socket.on('answer', (id, description) => {
    if (peers[id]) peers[id].setRemoteDescription(description);
});

socket.on('ice-candidate', (id, candidate) => {
    if (peers[id]) peers[id].addIceCandidate(candidate);
});

socket.on('stop-sharing', () => stopSharing());
socket.on('broadcaster-disconnected', stopSharing);

// For watcher
socket.on('offer', async (id, description, offerRoomCode) => {
    const watchRoomCode = document.getElementById('roomCodeInput').value;
    if (watchRoomCode !== offerRoomCode) return;

    const pc = new RTCPeerConnection(pcConfig);
    peers[id] = pc;

    pc.ontrack = e => {
        document.getElementById('remoteVideo').srcObject = e.streams[0];
        updateStatus(`Watching screen in room: ${watchRoomCode}`, 'connected');
    };

    pc.onicecandidate = e => {
        if (e.candidate) socket.emit('ice-candidate', id, e.candidate);
    };

    await pc.setRemoteDescription(description);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', id, pc.localDescription);
});

socket.on('disconnectPeer', id => {
    if (peers[id]) {
        peers[id].close();
        delete peers[id];
    }
});