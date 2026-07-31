// -------------------- Config --------------------
const socket = io(window.location.origin);
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

// -------------------- STUN/TURN (Updated for Loopback & Mobile Reliability) --------------------
const pcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.stunprotocol.org:3478" }
    ]
};

// -------------------- Share Screen --------------------
document.getElementById('shareBtn').onclick = async () => {
    if (isSharing) return alert("Already sharing!");

    try {
        localStream = navigator.mediaDevices.getDisplayMedia
            ? await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true })
            : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        localStream.getTracks().forEach(track => { track.onended = stopSharing; });
        document.getElementById('localVideo').srcObject = localStream;
        isSharing = true;
        updateStatus(`Sharing screen in room: ${roomCode}`, 'connected');

        socket.emit('broadcaster', roomCode);
    } catch (e) {
        console.error(e);
        alert("Cannot start sharing. Camera fallback may be used.");
        isSharing = false;
        updateStatus('Screen share failed', 'disconnected');
    }
};

// -------------------- Watch Screen --------------------
document.getElementById('watchBtn').onclick = () => {
    if (isWatching) return alert("Already watching!");
    const watchRoomCode = document.getElementById('roomCodeInput').value;
    if (!watchRoomCode || watchRoomCode.length !== 5) return alert("Enter valid 5-digit code");

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

// Broadcaster events
socket.on('watcher', id => {
    if (!isSharing) return;
    const pc = new RTCPeerConnection(pcConfig);
    peers[id] = pc;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = e => { 
        if (e.candidate) socket.emit('ice-candidate', id, e.candidate); 
    };

    pc.createOffer()
        .then(o => pc.setLocalDescription(o))
        .then(() => {
            // Fixed: Removed extra 'roomCode' argument to match server signature socket.on('offer', (id, sdp) => ...)
            socket.emit('offer', id, pc.localDescription);
        })
        .catch(err => console.error("Error creating offer:", err));
});

socket.on('answer', (id, desc) => { 
    if (peers[id]) {
        peers[id].setRemoteDescription(new RTCSessionDescription(desc)).catch(err => console.error(err));
    }
});

socket.on('ice-candidate', (id, c) => { 
    if (peers[id] && c) {
        peers[id].addIceCandidate(new RTCIceCandidate(c)).catch(err => console.error(err));
    }
});

socket.on('broadcaster-disconnected', stopSharing);

// Watcher events
socket.on('offer', async (id, desc) => {
    const pc = new RTCPeerConnection(pcConfig);
    peers[id] = pc;

    pc.ontrack = e => { 
        document.getElementById('remoteVideo').srcObject = e.streams[0]; 
    };
    
    pc.onicecandidate = e => { 
        if(e.candidate) socket.emit('ice-candidate', id, e.candidate); 
    };

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(desc));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', id, pc.localDescription);
    } catch (err) {
        console.error("Error handling watcher offer:", err);
    }
});

socket.on('disconnectPeer', id => { 
    if(peers[id]) { 
        peers[id].close(); 
        delete peers[id]; 
    } 
});

socket.on('no-broadcaster', () => { 
    alert("No broadcaster found for this room yet."); 
});