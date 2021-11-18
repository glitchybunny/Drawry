/*
	drawry
	server.js
	a multiplayer drawing game by Glitch Taylor (rtay.io)
*/
"use strict";

// Including libraries
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")({ serveClient: false });
io.attach(server, { pingInterval: 10000, pingTimeout: 5000, cookie: true });
const xss = require("xss");
const path = require("path");
const sizeOf = require("image-size");

// Server constants
const CLIENTS = [];
const SOCKETS = [];
const ROOMS = {};
const SETTINGS_CONSTRAINTS = {
	firstPage: ["string", ["Write", "Draw"]],
	pageCount: ["number", [2, 20]],
	pageOrder: ["string", ["Normal", "Random"]],
	palette: ["string", ["No palette", "Blues", "Rainbow", "PICO-8" /*, "Random"*/]],
	timeWrite: ["number", [0, 15]],
	timeDraw: ["number", [0, 15]],
};
const SETTINGS_DEFAULT = {
	firstPage: "Write",
	pageCount: "8",
	pageOrder: "Normal",
	palette: "No palette",
	timeWrite: "0",
	timeDraw: "0",
};
const STATE = {
	LOBBY: 0,
	PLAYING: 1,
	PRESENTING: 2,
};
const MAX_ROOM_SIZE = 10;
const DEBUG = process.env.DEBUG;

///// ----- ASYNC SERVER FUNCTIONS ----- /////
// Listen for incoming connections from clients
io.on("connection", (socket) => {
	CLIENTS[socket.id] = {};
	SOCKETS[socket.id] = socket;

	/// --- LOBBY --- ///
	// Listen for client joining room
	socket.on("joinRoom", (data) => {
		if (process.env.VERBOSE) {
			console.log("joinRoom", data.id, {
				name: data.name,
				roomCode: data.roomCode,
			});
		}

		// first of all, make sure no two clients connect with the same ID
		let _oldID,
			auth = 1;
		for (let _socketID in CLIENTS) {
			if (data.id === CLIENTS[_socketID].id) {
				// ensure the key matches
				if (data.key === CLIENTS[_socketID].key) {
					// same user, disconnect old and delete old client with matching ID
					SOCKETS[_socketID].disconnect();
					delete CLIENTS[_socketID];

					// client is reconnecting, keep track of old ID and set auth to 2
					_oldID = _socketID;
					auth = 2;
				} else {
					// different user, disconnect since ID is already taken
					socket.disconnect();
					auth = 0;
				}
				break;
			}
		}

		console.log(auth);

		if (auth > 0) {
			// fetch client values
			let _client = CLIENTS[socket.id];
			_client.id = xss(data.id.substr(0, 10)).replace(/[^a-fA-F0-9]]/g, "") || 0;
			_client.key = xss(data.key.substr(0, 20)).replace(/[^a-fA-F0-9]]/g, "") || 0;
			_client.name = xss(data.name.substr(0, 32));
			_client.roomCode = xss(data.roomCode.substr(0, 12)).replace(/[^a-zA-Z0-9-_]/g, "") || 0;

			if (_client.id === 0 || _client.roomCode === 0) {
				// ID or roomCode is invalid, boot client
				io.to(socket.id).emit("kick", "invalid room code");
				socket.disconnect();
			} else {
				// add client to the room
				socket.join(_client.roomCode);

				// if room doesn't exist, create it and make client the host
				if (!ROOMS.hasOwnProperty(_client.roomCode)) {
					// create room
					ROOMS[_client.roomCode] = {
						clients: [],
						host: socket.id,
						settings: SETTINGS_DEFAULT,
						state: STATE.LOBBY,
						page: 0,
						submitted: 0,
						books: undefined,
						timer: undefined,
					};
				}

				let _room = ROOMS[_client.roomCode];

				if (auth !== 2) {
					if (_room.state !== STATE.LOBBY) {
						// game in progress, can't connect
						io.to(socket.id).emit("kick", "game in progress");
						socket.disconnect();
					} else if (Object.keys(_room.clients).length >= MAX_ROOM_SIZE) {
						// room is full, can't connect
						io.to(socket.id).emit("kick", "server full");
						socket.disconnect();
					} else {
						// add client to the room
						_room.clients[socket.id] = 1;
						io.to(socket.id).emit("joined", {
							roomCode: _client.roomCode,
							users: Object.values(CLIENTS).filter((c) => {
								return c.roomCode === _client.roomCode && c.id !== _client.id;
							}),
							host: CLIENTS[_room.host].id,
							settings: _room.settings,
						});

						// broadcast join to other clients
						socket.to(_client.roomCode).emit("userJoin", { id: _client.id, name: _client.name });
					}
				} else {
					// reconnect user and remove old ID
					delete _room.clients[_oldID];
					_room.clients[socket.id] = 1;

					// inform client they've joined
					io.to(socket.id).emit("joined", {
						roomCode: _client.roomCode,
						users: Object.values(CLIENTS).filter((c) => {
							return c.roomCode === _client.roomCode && c.id !== _client.id;
						}),
						host: CLIENTS[_room.host].id,
						settings: _room.settings,
					});

					// tell other users about client reconnecting
					socket.to(_client.roomCode).emit("userReconnect", { id: _client.id, name: _client.name });
				}
			}
		}
	});

	// Listen for room settings changes
	socket.on("settings", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("settings", CLIENTS[socket.id].id, data.settings);
			}

			let _roomCode = CLIENTS[socket.id].roomCode;
			let _room = ROOMS[_roomCode];

			// Make sure user is the host and settings are within constraints
			if (socket.id === _room.host && verifySettings(data.settings)) {
				// Host updating settings
				_room.settings = data.settings;

				// Propagate settings to other clients
				socket.to(_roomCode).emit("settings", _room.settings);
			} else {
				// Invalid request, kick from game
				io.to(socket.id).emit("kick", "invalid settings");
				socket.disconnect();
			}
		} else {
			socket.disconnect();
		}
	});

	/// --- GAME --- ///
	// Start the game for the room
	socket.on("startGame", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("startGame", CLIENTS[socket.id].id, data.settings);
			}

			let _roomCode = CLIENTS[socket.id].roomCode;
			let _room = ROOMS[_roomCode];

			// Make sure user is the host, player count is reached, and settings are valid
			if (
				(socket.id === _room.host &&
					Object.keys(_room.clients).length >= 2 &&
					verifySettings(data.settings) &&
					_room.state === STATE.LOBBY) ||
				DEBUG
			) {
				// Initialise room values, generate books
				_room.settings = data.settings;
				_room.state = STATE.PLAYING;
				_room.page = 0;
				_room.books = generateBooks(_room.clients, _room.settings);

				// Start game
				io.to(_roomCode).emit("startGame", {
					books: _room.books,
					start: _room.settings.firstPage,
				});
				startTimer(_roomCode, _room.settings.firstPage);
			} else {
				// Invalid request, kick from game
				socket.disconnect();
			}
		}
	});

	// Update a player's book title
	socket.on("updateTitle", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("updateTitle", CLIENTS[socket.id].id, { title: data.title });
			}

			let _id = CLIENTS[socket.id].id;
			let _roomCode = CLIENTS[socket.id].roomCode;
			let _room = ROOMS[_roomCode];

			// make sure to sanitise title string
			let _title = xss(data.title.substr(0, 40));

			// ensure title is of adequate length, otherwise make it the player name + "'s book"
			if (_title.length === 0) {
				_title = CLIENTS[socket.id].name + "'s book";
			}

			// send title to other players
			if (_room.page === 0) {
				io.to(_roomCode).emit("title", { id: _id, title: _title });
			}
		}
	});

	// Get page from player
	socket.on("submitPage", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("submitPage", CLIENTS[socket.id].id, {
					mode: data.mode,
					value: data.value.substr(0, 63) + (data.value.length > 63 ? "…" : ""),
				});
			}
			let _id = CLIENTS[socket.id].id;
			let _roomCode = CLIENTS[socket.id].roomCode;
			let _room = ROOMS[_roomCode];
			let _value = undefined;

			// Fetch page data
			if (data.mode === "Write") {
				// Data is text
				_value = xss(data.value.substr(0, 140));
				if (_value.length === 0) {
					_value = "...";
				}
			} else if (data.mode === "Draw") {
				// Data is encoded image
				// make sure the image is expected format
				if (data.value.indexOf("data:image/png;base64,") === 0) {
					let img = Buffer.from(data.value.split(";base64,").pop(), "base64");
					let dimensions = sizeOf(img);

					// make sure image is correct size
					if (dimensions.width === 800 && dimensions.height === 600) {
						_value = data.value;
					} else {
						// if it's not the correct size, check if it's within a reasonable tolerance range (1%)
						let _diffWidth = Math.abs(dimensions.width - 800);
						let _diffHeight = Math.abs(dimensions.height - 600);
						if (_diffWidth < 8 && _diffHeight < 6) {
							// Send image data anyway, it's close enough
							_value = data.value;
						} else {
							console.log("ERROR unexpected image size", [dimensions.width, dimensions.height]);
						}
					}
				} else {
					console.log("ERROR unexpected image format", {
						format: data.value.substr(0, 22),
					});
				}
			}

			// Identify book ID to update
			let _bookID;
			for (let i of Object.keys(_room.books)) {
				if (_room.books[i][_room.page] === _id) {
					_bookID = i;
					break;
				}
			}

			// Verify data.mode is valid
			let _expected = (_room.settings.firstPage === "Write") ^ _room.page % 2 ? "Write" : "Draw";
			if (_expected !== data.mode) {
				// Client trying to send tampered data, overwrite
				_value = undefined;
				console.log("ERROR unexpected data.mode", {
					received: data.mode,
					expected: _expected,
				});
			}

			// Send page data to all players
			io.to(_roomCode).emit("page", {
				id: _bookID,
				page: _room.page,
				value: _value,
				author: _id,
				mode: _expected,
			});

			// Check if all players have submitted
			_room.submitted += 1;
			if (_room.submitted === Object.keys(_room.clients).length) {
				_room.submitted = 0;
				_room.page += 1;

				if (_room.page === parseInt(_room.settings.pageCount)) {
					// Finished creation part of game, move to presenting
					_room.state = STATE.PRESENTING;
					io.to(_roomCode).emit("startPresenting");
				} else {
					// Go to next page
					io.to(_roomCode).emit("pageForward");
					startTimer(_roomCode, _expected === "Draw" ? "Write" : "Draw");
				}
			}
		}
	});

	/// --- PRESENTING --- ///
	// Begin presenting a book
	socket.on("presentBook", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("presentBook", CLIENTS[socket.id].id, { book: data.book });
			}
			// let _id = CLIENTS[socket.id].id; // unused
			let _roomCode = CLIENTS[socket.id].roomCode;

			// Make sure request is from the host
			if (socket.id === ROOMS[_roomCode].host) {
				// Ensure book ID is valid
				let _book = xss(data.book.toString());
				if (_book in ROOMS[_roomCode].books) {
					// Begin presenting book
					ROOMS[_roomCode].page = -1;
					ROOMS[_roomCode].presenter = _book;

					// Tell all clients that a book is being presented
					io.to(_roomCode).emit("presentBook", {
						book: _book,
						presenter: ROOMS[_roomCode].presenter,
					});
				}
			}
		}
	});

	// Go to next page of presentation
	socket.on("presentForward", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("presentForward", CLIENTS[socket.id].id);
			}
			let _id = CLIENTS[socket.id].id;
			let _roomCode = CLIENTS[socket.id].roomCode;

			// Make sure request is from the presenter
			if (_id === ROOMS[_roomCode].presenter) {
				if (ROOMS[_roomCode].page < parseInt(ROOMS[_roomCode].settings.pageCount) - 1) {
					ROOMS[_roomCode].page += 1;
					io.to(_roomCode).emit("presentForward");
				}
			}
		}
	});

	// Go to previous page of presentation (hide most recently shown page)
	socket.on("presentBack", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("presentBack", CLIENTS[socket.id].id);
			}
			let _id = CLIENTS[socket.id].id;
			let _roomCode = CLIENTS[socket.id].roomCode;

			// Make sure request is from the presenter
			if (_id === ROOMS[_roomCode].presenter) {
				if (ROOMS[_roomCode].page > -1) {
					ROOMS[_roomCode].page -= 1;
					io.to(_roomCode).emit("presentBack");
				}
			}
		}
	});

	// Take over presentation as host
	socket.on("presentOverride", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("presentOverride", CLIENTS[socket.id].id);
			}
			let _id = CLIENTS[socket.id].id;
			let _roomCode = CLIENTS[socket.id].roomCode;

			// Make sure request is from the host
			if (socket.id === ROOMS[_roomCode].host) {
				ROOMS[_roomCode].presenter = _id;
				io.to(_roomCode).emit("presentOverride");
			}
		}
	});

	// Return to lobby for next book
	socket.on("presentFinish", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("presentFinish", CLIENTS[socket.id].id);
			}
			let _id = CLIENTS[socket.id].id;
			let _roomCode = CLIENTS[socket.id].roomCode;

			// Make sure request is from the presenter
			if (_id === ROOMS[_roomCode].presenter) {
				ROOMS[_roomCode].page = undefined;
				ROOMS[_roomCode].presenter = undefined;
				io.to(_roomCode).emit("presentFinish");
			}
		}
	});

	/// --- END --- ///
	// Listen for game finish events
	socket.on("finish", (data) => {
		if (CLIENTS[socket.id] !== undefined && data.key === CLIENTS[socket.id].key) {
			if (process.env.VERBOSE) {
				console.log("finish", CLIENTS[socket.id].id);
			}

			// Make sure request is from the host
			let _roomCode = CLIENTS[socket.id].roomCode;
			if (socket.id === ROOMS[_roomCode].host) {
				ROOMS[_roomCode].state = STATE.LOBBY;
				ROOMS[_roomCode].page = 0;
				ROOMS[_roomCode].submitted = 0;
				ROOMS[_roomCode].books = undefined;
				io.to(_roomCode).emit("finish");
			}
		}
	});

	// Listen for disconnect events
	socket.on("disconnect", (data) => {
		if (CLIENTS[socket.id] !== undefined) {
			if (process.env.VERBOSE) {
				if (CLIENTS[socket.id].id !== undefined) {
					console.log("disconnect", CLIENTS[socket.id].id, { type: data });
				}
			}

			// remove client from the room if they've joined one
			if (CLIENTS[socket.id].id && CLIENTS[socket.id].roomCode) {
				let _id = CLIENTS[socket.id].id;
				let _roomCode = CLIENTS[socket.id].roomCode;

				// alert others that client has left the room
				socket.to(_roomCode).emit("userLeave", _id);

				if (ROOMS[_roomCode]) {
					// mark client as disconnected
					let _clients = ROOMS[_roomCode].clients;
					_clients[socket.id] = 0;

					// get number of connected clients
					let _connected = 0;
					Object.keys(_clients).forEach((e) => {
						_connected += _clients[e];
					});

					if (_connected === 0) {
						// All users disconnected, delete room
						delete ROOMS[_roomCode];
					} else {
						// Still users connected
						if (socket.id === ROOMS[_roomCode].host) {
							// Host disconnected, so reassign host to first active client
							Object.keys(_clients).forEach((_s) => {
								if (_clients[_s] === 1) {
									// Assign host
									ROOMS[_roomCode].host = _s;
									socket.to(_roomCode).emit("userHost", CLIENTS[_s].id);
								}
							});
						}
					}
				}
			}

			// mark as disconnected so user can rejoin
			//CLIENTS[socket.id].disconnected = true;
		}
	});
});

///// ----- SYNCHRONOUS SERVER FUNCTIONS ----- /////
// Ensure game settings are within reasonable constraints
function verifySettings(settings) {
	let _valid = true;

	for (let _rule in settings) {
		let _setting = settings[_rule];
		let _constraint = SETTINGS_CONSTRAINTS[_rule];

		switch (_constraint[0]) {
			case "string":
				// Ensure string is in the list of valid strings
				if (!_constraint[1].includes(_setting)) {
					_valid = false;
				}
				break;
			case "number":
				// Ensure value is a valid integer, and is within the valid range
				if (/^[0-9]+$/.test(_setting)) {
					_setting = +_setting;
					if (_setting < _constraint[1][0] || _setting > _constraint[1][1]) {
						_valid = false;
					}
				} else {
					_valid = false;
				}
				break;
		}
	}

	return _valid;
}

// Get current game state
function getGameState(room) {
	// todo: write function that fetches the following information about the game state
	//  - whether the game is lobby/playing/presenting
	//  - page number
	// 	- mode (write/draw)
}

// Reconnect client to game
function reconnect(room, client) {
	// todo:
	//  - send client game state, settings, etc
	//  - ask client which data they're missing in terms of pages
	//  - if necessary, get data from host and transfer it to the client (create a transfer key for the host to use)
	// not sure if it's better to send the missing data as soon as the client connects,
	// or to only send immediately necessary data and wait until presenting to send everything else?????
}

// Generate books for a room
function generateBooks(clients, settings) {
	// create books
	let books = {};
	let players = [];
	Object.keys(clients).forEach((id) => {
		let clientID = CLIENTS[id].id.toString();
		players.push(clientID);
		books[clientID] = [clientID];
	});

	// assign pages
	if (settings.pageOrder === "Normal" || players.length <= 3) {
		// normal order (cyclical)
		for (let i = 1; i < settings.pageCount; i++) {
			for (let j = 0; j < players.length; j++) {
				books[players[(j + i) % players.length]].push(players[j]);
			}
		}
	} else if (settings.pageOrder === "Random") {
		// random order
		let _assigned = [players]; // variable to keep track of previous rounds

		for (let i = 1; i < settings.pageCount; i++) {
			let _prev = _assigned[i - 1];
			let _next = _prev.slice(); // copy previous array

			// randomly shuffle
			shuffle(_next);

			// ensure no pages match the previous round
			for (let j = 0; j < players.length; j++) {
				if (_prev[j] === _next[j]) {
					// pages match, generate random index to swap with
					let _swap = Math.floor(Math.random() * (players.length - 1));
					if (_swap >= j) {
						_swap += 1;
					}

					// swap values
					[_next[j], _next[_swap]] = [_next[_swap], _next[j]];
				}
			}

			// add round to books
			_assigned.push(_next);
			for (let j = 0; j < players.length; j++) {
				books[players[j]].push(_next[j]);
			}
		}
	}

	return books;
}

// Shuffle array (fisher yates)
function shuffle(array) {
	let t,
		i,
		m = array.length;
	while (m) {
		i = Math.floor(Math.random() * m--);
		t = array[m];
		array[m] = array[i];
		array[i] = t;
	}
	return array;
}

// Room timers
function startTimer(roomCode, mode) {
	let room = ROOMS[roomCode];
	let time;
	switch (mode) {
		case "Write":
			time = room.settings.timeWrite;
			break;
		case "Draw":
			time = room.settings.timeDraw;
			break;
		default:
			time = 0;
	}

	// clear the timer if it already exists
	if (room.timer) {
		clearTimeout(room.timer);
		room.timer = undefined;
	}

	// set timer (plus an extra couple of seconds to account for network latency)
	room.timer = setTimeout(() => {
		// tell clients when the timer is done
		io.to(roomCode).emit("timerFinish");
		clearTimeout(room.timer);
		room.timer = undefined;
	}, (parseFloat(time) * 60 + 2) * 1000);
}

///// ----- HTTP SERVER ----- /////
// setup rate limiter, default max of 50 resource requests per minute
const RateLimit = require("express-rate-limit");
let limiter = new RateLimit({
	windowMs: 60 * 1000,
	max: process.env.RATE_LIMIT ?? 50,
});

// apply rate limiter to all resource requests
app.use(limiter);

// handle requests
app.get("/js/socket.io.min.js", (req, res) => {
	res.sendFile(path.join(__dirname + "/node_modules/socket.io/client-dist/socket.io.min.js"));
});
app.get("/js/fabric.min.js", (req, res) => {
	res.sendFile(path.join(__dirname + "/node_modules/fabric/dist/fabric.min.js"));
});
app.get("/js/dialog-polyfill.js", (req, res) => {
	res.sendFile(path.join(__dirname + "/node_modules/dialog-polyfill/dist/dialog-polyfill.js"));
});

app.use(express.static("static"));

// Open server to manage server things
server.listen(process.env.PORT ?? 80);
