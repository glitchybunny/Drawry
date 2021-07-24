/*
    picturephone
    app.js
    a multiplayer art experiment by Riley Taylor (rtay.io)
*/
"use strict";

// Including libraries
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const http = require('http');
const xss = require("xss");
const path = require('path');

// Basic client list (to keep track of currently connected client IDs and names only, nothing more)
const CLIENTS = [];
const SOCKETS = [];
const ROOMS = {};
const MAX_ROOM_SIZE = 10;
const DEFAULT_SETTINGS = {
    firstPage: 'Write',
    pageCount: '8',
    pageOrder: 'Normal',
    palette: 'No palette',
    timeWrite: '0',
    timeDraw: '0'
};


// Listen for incoming connections from clients
io.on('connection', (socket) => {

    CLIENTS[socket.id] = {};
    SOCKETS[socket.id] = socket;

    // Listen for client joining room
    socket.on('joinRoom', (data) => {
        // first of all, make sure no two clients connect with the same ID
        for (let _socketID in CLIENTS) {
            if (data.id === CLIENTS[_socketID].id) {
                // disconnect client with matching ID
                SOCKETS[_socketID].disconnect();
            }
        }

        // fetch client values
        let _client = CLIENTS[socket.id];
        _client.id = data.id || 0;
        _client.name = xss(data.name.substr(0, 32));
        _client.room = xss(data.room.substr(0, 8)).replace(/[^a-zA-Z0-9-_]/g, '') || 0;

        if (_client.id && _client.room) {
            // add client to the room
            socket.join(_client.room);

            if (!ROOMS.hasOwnProperty(_client.room)) {
                // if room doesn't exist, create it and make client the host
                ROOMS[_client.room] = {
                    clients: [socket.id],
                    host: socket.id,
                    settings: DEFAULT_SETTINGS
                }
            } else if (ROOMS[_client.room].clients.length < MAX_ROOM_SIZE) {
                // if room does exist and isn't full, add client to the room
                ROOMS[_client.room].clients.push(socket.id);
            } else {
                // if room is full, boot client
                io.to(socket.id).emit("disconnect", "server full");
            }

            // inform the client they've joined the room
            io.to(socket.id).emit("joined", {
                room: _client.room,
                users: Object.values(CLIENTS).filter((c) => {
                    return c.room === _client.room && c.id !== _client.id
                }),
                host: CLIENTS[ROOMS[_client.room].host].id,
                settings: ROOMS[_client.room].settings
            });

            // inform users in the room about the new client
            socket.to(_client.room).emit("userJoin", CLIENTS[socket.id]);

        } else {
            // ID or roomID is invalid, boot client
            io.to(socket.id).emit("disconnect");
        }
    });

    // Listen for room settings changes
    socket.on('settings', (data) => {
        let _roomID = CLIENTS[socket.id].room;
        let _room = ROOMS[_roomID];

        // Make sure user is the host
        if (socket.id === _room.host) {
            // Verify settings are within constraints
            // todo

            // Host updating settings
            _room.settings = data;

            // Propogate settings to other clients
            socket.to(_roomID).emit("settings", _room.settings);
        } else {
            // Non-host attempting to update settings without permission, kick from game
            socket.disconnect();
        }
    });

    socket.on('startGame', (data) => {
        let _roomID = CLIENTS[socket.id].room;
        let _room = ROOMS[_roomID];

        // Make sure user is the host
        if (socket.id === _room.host) {
            // Verify settings are within constraints

            // Host updating settings
            _room.settings = data.settings;

            // Generate page assignment order for books

            // Tell clients game has started
            io.to(_roomID).emit('gameStart', {});

        } else {
            // Non-host attempting to start game without permission, kick from game
            socket.disconnect();
        }
    });

    // Listen for disconnect events
    socket.on('disconnect', (data) => {
        if (CLIENTS[socket.id].id && CLIENTS[socket.id].room) {
            // remove client from the room if they've joined one
            let _id = CLIENTS[socket.id].id;
            let _roomID = CLIENTS[socket.id].room;
            let _room = ROOMS[_roomID];

            // alert others that client has left the room
            socket.to(_roomID).emit('userLeave', _id);

            // remove client from the room
            let _clients = _room.clients;
            let _index = _clients.indexOf(socket.id);
            if (_index !== -1) {
                _clients.splice(_index, 1);
            } else {
                console.error("FAILED TO REMOVE NON-EXISTENT CLIENT FROM ROOM????");
            }

            // delete the room if everyone has left
            if (_clients.length === 0) {
                delete ROOMS[_roomID];
            } else {
                // if the host disconnected, assign a new host
                if (socket.id == _room.host) {
                    _room.host = _clients[0];
                    socket.to(_roomID).emit("host", CLIENTS[_room.host].id);
                }
            }
        }

        delete CLIENTS[socket.id];
    });
});


// Simple HTTP server
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});
app.use(express.static('static'));


// Open server to manage server things
server.listen(process.env.PORT || 80);
