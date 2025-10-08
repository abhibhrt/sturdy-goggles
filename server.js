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

app.use(express.static(path.join(__dirname, 'public')));

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
            socket.to(broadcasters[roomCode]).emit('watcher', socket.id, roomCode);
            socket.join(roomCode);
        } else {
            socket.emit('no-broadcaster', roomCode);
        }
    });

    socket.on('offer', (id, message) => {
        socket.to(id).emit('offer', socket.id, message);
    });

    socket.on('answer', (id, message) => {
        socket.to(id).emit('answer', socket.id, message);
    });

    socket.on('ice-candidate', (id, candidate) => {
        socket.to(id).emit('ice-candidate', socket.id, candidate);
    });

    socket.on('stop-sharing', (roomCode) => {
        if (broadcasters[roomCode] === socket.id) {
            delete broadcasters[roomCode];
            socket.to(roomCode).emit('broadcaster-disconnected');
        }
    });

    socket.on('disconnect', () => {
        for (const [roomCode, broadcasterId] of Object.entries(broadcasters)) {
            if (broadcasterId === socket.id) {
                delete broadcasters[roomCode];
                socket.to(roomCode).emit('broadcaster-disconnected');
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 5467;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));