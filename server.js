require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
    }
});

// Serve static files from 'public' (for WebRTC client)
app.use(express.static(path.join(__dirname, 'public')));

// Store broadcasters by room code
const broadcasters = {};

io.on('connection', (socket) => {
    console.log(`[+] User connected: ${socket.id}`);

    socket.on('broadcaster', (roomCode) => {
        broadcasters[roomCode] = socket.id;
        console.log(`[!] Broadcaster set for room ${roomCode}: ${socket.id}`);
        socket.join(roomCode);
    });

    socket.on('watcher', (roomCode) => {
        if (broadcasters[roomCode]) {
            console.log(`[+] Watcher for room ${roomCode}: ${socket.id}`);
            socket.to(broadcasters[roomCode]).emit('watcher', socket.id, roomCode);
            socket.join(roomCode);
        } else {
            console.log(`[!] No broadcaster found for room ${roomCode}`);
            socket.emit('no-broadcaster', roomCode);
        }
    });

    socket.on('offer', (id, message, roomCode) => {
        socket.to(id).emit('offer', socket.id, message, roomCode);
    });

    socket.on('answer', (id, message) => {
        socket.to(id).emit('answer', socket.id, message);
    });

    socket.on('ice-candidate', (id, message, roomCode) => {
        socket.to(id).emit('ice-candidate', socket.id, message);
    });

    socket.on('stop-sharing', (roomCode) => {
        if (broadcasters[roomCode] === socket.id) {
            delete broadcasters[roomCode];
            console.log(`[!] Broadcaster stopped sharing for room ${roomCode}`);
            socket.to(roomCode).emit('broadcaster-disconnected');
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Disconnected: ${socket.id}`);
        
        // Remove broadcaster if they disconnect
        for (const [roomCode, broadcasterId] of Object.entries(broadcasters)) {
            if (broadcasterId === socket.id) {
                delete broadcasters[roomCode];
                console.log(`[!] Broadcaster disconnected from room ${roomCode}`);
                socket.to(roomCode).emit('broadcaster-disconnected');
                break;
            }
        }
        
        socket.broadcast.emit('disconnectPeer', socket.id);
    });
});

const PORT = 5467;

server.listen(PORT, () => {
    console.log(`🚀 Server running ${PORT}`);
});