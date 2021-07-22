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


// Listen for incoming connections from clients
io.on('connection', (socket) => {

    CLIENTS[socket.id] = {};
    SOCKETS[socket.id] = socket;

    // Listen for disconnect events
    socket.on('disconnect', (data) => {

        if (CLIENTS[socket.id].id !== undefined && CLIENTS[socket.id].room !== undefined) {
            // remove client from the room if they've joined one
            let _id = CLIENTS[socket.id].id;
            let _room = CLIENTS[socket.id].room;

            // alert others that client has left the room
            socket.to(_room).emit('userLeave', _id);

            // remove client from the room
            let _clients = ROOMS[_room].clients;
            let _index = _clients.indexOf(socket.id);
            if (_index !== -1) {
                _clients.splice(_index, 1);
            } else {
                console.error("FAILED TO REMOVE NON-EXISTENT CLIENT FROM ROOM");
            }

            // delete the room if everyone has left
            if (_clients.length === 0) {
                delete ROOMS[_room];
            } else {
                // otherwise, assign a new host
                ROOMS[_room].host = _clients[0];
                socket.to(_room).emit("userHost", CLIENTS[ROOMS[_room].host].id);
            }
        }

        delete CLIENTS[socket.id];
    });

    // Listen for client joining room
    socket.on('joinRoom', (data) => {
        // fetch client values
        let _id = data.id || 0;
        let _name = xss(data.name.substr(0, 32));
        let _room = xss(data.room.substr(0, 8)).replace(/[^a-zA-Z0-9-_]/g, '');

        // make sure no two clients connect with the same ID
        Object.keys(CLIENTS).forEach((key, index) => {
            // if the ID matches, then drop the existing socket connection
            if (`${CLIENTS[key].id}` == _id) {
                // boot the existing client off the server
                let _clientToDisconnect = `${[key]}`;
                SOCKETS[_clientToDisconnect].disconnect();
            }
        })

        // add client to room
        if (_id !== 0 && _room.length > 0 && roomNotFull(_room)) {
            CLIENTS[socket.id].id = _id;
            CLIENTS[socket.id].name = _name;
            CLIENTS[socket.id].room = _room;

            // inform client they've joined the room
            socket.join(_room);
            io.to(socket.id).emit("joined", {room: _room});

            if (_room in ROOMS) {
                // room already exists
                // add client to room
                ROOMS[_room].clients.push(socket.id);

                // alert others to new user
                socket.to(_room).emit("userJoin", CLIENTS[socket.id]);

                // send client other user info
                for (let _socketid of roomGetClients(_room)) {
                    if (_socketid !== socket.id) {
                        io.to(socket.id).emit("userJoin", CLIENTS[_socketid]);
                    }
                }
            } else {
                // room doesn't exist
                // create room and make client the host
                ROOMS[_room] = {
                    clients: [socket.id],
                    host: socket.id
                };
            }

            // tell client the host ID
            io.to(socket.id).emit("userHost", CLIENTS[ROOMS[_room].host].id);
        } else {
            // don't let client join a full room
            io.to(socket.id).emit("disconnect", "server full")
        }
    });

    // Update room settings
    socket.on('updateSettings', (data) => {
        // todo: verify whether the user is host
        // if they are, update the settings for the room
        // and propogate settings changes to other clients
    })
});


// Room management code
function roomGetClients(r) {
    if (r in ROOMS) {
        return ROOMS[r].clients;
    } else {
        return [];
    }
}

function roomNotFull(r) {
    if (r in ROOMS) {
        return ROOMS[r].clients.length < 10;
    } else {
        return true;
    }
}


// Simple HTTP server
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});
app.use(express.static('static'));


// Open server to manage server things
server.listen(process.env.PORT || 80);
