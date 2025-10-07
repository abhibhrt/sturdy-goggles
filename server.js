const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let broadcaster;

io.on('connection', socket => {
    console.log('User connected:', socket.id);

    socket.on('broadcaster', () => {
        broadcaster = socket.id;
        socket.broadcast.emit('broadcaster');
    });

    socket.on('watcher', () => {
        if (broadcaster) {
            socket.to(broadcaster).emit('watcher', socket.id);
        }
    });

    socket.on('offer', (id, message) => {
        socket.to(id).emit('offer', socket.id, message);
    });

    socket.on('answer', (id, message) => {
        socket.to(id).emit('answer', socket.id, message);
    });

    socket.on('ice-candidate', (id, message) => {
        socket.to(id).emit('ice-candidate', socket.id, message);
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit('disconnectPeer', socket.id);
    });
});

// Listen on all interfaces so mobile can connect
server.listen(3000, '0.0.0.0', () => console.log('Server running on http://10.148.2.100:3000'));
