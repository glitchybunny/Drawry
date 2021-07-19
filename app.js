// Including libraries
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const http = require('http');
const xss = require("xss");
const path = require('path');

// Basic client list (to keep track of currently connected client IDs and names only, nothing more)
const clients = [];
const sockets = [];
const rooms = {};


// Listen for incoming connections from clients
io.on('connection', (socket) => {

	clients[socket.id] = {};
	sockets[socket.id] = socket;

	// Listen for disconnect events
	socket.on('disconnect', (data) => {
		// Only broadcast to other clients that this one has left IF it has triggered a join event
		if (clients[socket.id].id !== undefined && clients[socket.id].room !== undefined) {
			socket.to(clients[socket.id].room).emit('userLeave', clients[socket.id].id);
			removeFromRoom(clients[socket.id].room, socket.id);
		}
		delete clients[socket.id];
	});

	// Listen for client joining room
	socket.on('joinRoom', (data) => {
		// fetch client values
		let _id = data.id || 0;
		let _name = xss(data.name.substr(0, 32));
		let _room = xss(data.room.substr(0, 16)).replace(/[^a-zA-Z0-9-_]/g, '');

		// make sure no two clients connect with the same ID
		let clientsKeys = Object.keys(clients)
		clientsKeys.forEach((key, index) => {
			// if the ID matches, then drop the existing socket connection
			if (`${clients[key].id}` == _id) {
				let clientToDisconnect = `${[key]}`;
				sockets[clientToDisconnect].disconnect(); // boot the existing client off the server
			}
		})

		// add client to game
		if (_id !== 0 && roomNotFull(_room)) {
			clients[socket.id].id = _id;
			clients[socket.id].name = _name;
			clients[socket.id].room = _room;

			socket.join(_room);
			socket.to(_room).emit("userJoin", clients[socket.id]); // alert others to new user
			io.to(socket.id).emit("joined", {room:_room}); // let client know they've joined the room
			for (socketid of getRoomIDs(_room)) {io.to(socket.id).emit("userJoin", clients[socketid]);} // let client know other user info

			addToRoom(_room, socket.id);

			console.log(_id, "joined room " + _room + " with name " + _name);
		} else {
			io.to(socket.id).emit("disconnect", "server full")
		}
	});
});


// Room management code
function addToRoom(r, id) {
	r = r.toString();
	if (r in rooms) {
		rooms[r].push(id);
	} else {
		rooms[r] = [id];
	}
}

function removeFromRoom(r, id) {
	r = r.toString();
	if (r in rooms) {
		let index = rooms[r].indexOf(id);
		if (index > -1) {
			rooms[r].splice(index, 1);
		}
		// make sure to clean up room once everyone has left
		if (rooms[r].length === 0) {
			delete rooms[r];
		}
	} else {
		console.error("ERROR: Client disconnected from non-existent room?");
	}
}

function getRoomIDs(r) {
	r = r.toString();
	if (r in rooms) {
		return rooms[r];
	} else {
		return [];
	}
}

function roomNotFull(r) {
	if (r in rooms) {
		return rooms[r].length < 10;
	} else {
		return true;
	}
}



// Simple HTTP server
app.get('/', function(req, res) {
	res.sendFile(path.join(__dirname + '/index.html'));
});
app.use(express.static('static'));


// Open server to manage server things
server.listen(process.env.PORT || 80);
