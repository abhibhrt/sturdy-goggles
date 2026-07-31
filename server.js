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
        methods: ['GET','POST']
    }
});

app.use(express.static(path.join(__dirname, 'public')));

const broadcasters = {};

io.on('connection', socket => {
    console.log('[+] Connected:', socket.id);

    socket.on('broadcaster', roomCode => {
        broadcasters[roomCode] = socket.id;
        socket.join(roomCode);
        console.log(`[!] Broadcaster set for room ${roomCode}: ${socket.id}`);
    });

    socket.on('watcher', roomCode => {
        const broadcasterId = broadcasters[roomCode];
        if (broadcasterId) {
            socket.join(roomCode);
            // Notify broadcaster about the new watcher
            io.to(broadcasterId).emit('watcher', socket.id);
            console.log(`[!] Watcher ${socket.id} joined room ${roomCode} for broadcaster ${broadcasterId}`);
        } else {
            socket.emit('no-broadcaster', roomCode);
        }
    });

    socket.on('offer', (id, sdp) => {
        socket.to(id).emit('offer', socket.id, sdp);
    });

    socket.on('answer', (id, sdp) => {
        socket.to(id).emit('answer', socket.id, sdp);
    });

    socket.on('ice-candidate', (id, candidate) => {
        socket.to(id).emit('ice-candidate', socket.id, candidate);
    });

    socket.on('stop-sharing', roomCode => {
        if (broadcasters[roomCode] === socket.id) {
            delete broadcasters[roomCode];
            socket.to(roomCode).emit('broadcaster-disconnected');
        }
    });

    socket.on('disconnect', () => {
        for (const [room, id] of Object.entries(broadcasters)) {
            if (id === socket.id) {
                delete broadcasters[room];
                io.to(room).emit('broadcaster-disconnected');
            }
        }
        console.log('[-] Disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5467;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));