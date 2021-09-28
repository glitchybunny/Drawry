/*
	picturephone
	client.js
	a multiplayer art experiment by Glitch Taylor (rtay.io)
*/
"use strict";
const DEBUG = true;

/// --- SOCKET CONSTANTS --- ///
let array = new Uint32Array(3);
window.crypto.getRandomValues(array);
const ID = Cookies.get("id") ? Cookies.get("id") : (array[0].valueOf() + 1).toString();
const SESSION_KEY = array[1].valueOf().toString(16) + array[2].valueOf().toString(16); // currently unused
const SOCKET = io.connect(document.documentURI);

/// --- CONSTS/ENUMS --- ///
const TOOL = {
	PAINT: 0,
	ERASE: 1,
	FILL: 2,
	STICKER: 3,
};
const PALETTES = {
	"Blues": ["#000123", "#012345", "#234567", "#456789", "#6789AB", "#89ABCD", "#ABCDEF"],
	"Rainbow": [
		"#FF0000",
		"#FFAA00",
		"#AAFF00",
		"#00FF00",
		"#00FFAA",
		"#00AAFF",
		"#0000FF",
		"#AA00FF",
		"#FF00AA",
	],
	"PICO-8": [
		"#000000",
		"#1D2B53",
		"#7E2553",
		"#008751",
		"#AB5236",
		"#5F574F",
		"#C2C3C7",
		"#FFF1E8",
		"#FF004D",
		"#FFA300",
		"#FFEC27",
		"#00E436",
		"#29ADFF",
		"#83769C",
		"#FF77A8",
		"#FFCCAA",
	],
};

/// --- GAME CONSTANTS --- ///
const ROOM = {};
const USERS = {};
const BOOKS = {};
const ROUND = {
	timer: undefined,
	timeLeft: 0,
};
const DRAW = {
	tool: TOOL.PAINT,
	brush: undefined,
	color: "#000000",
	colorHistory: [],
	width: 6,
	flow: 50,
	undo: [],
	redo: [],
	WIDTH: 800,
	HEIGHT: 600,
};
const VIEWPORT = {
	x: 0,
	y: 0,
	width: 800,
	height: 600,
};

/// Ensure browser compatibility
const supportsCanvas = "getContext" in document.createElement("canvas");
const supportsWebGL =
	document.createElement("canvas").getContext("webgl") instanceof WebGLRenderingContext;

if (!supportsCanvas) {
	let m = "Canvas not supported!\n\nThis game requires canvas to run.";
	alert(m);
	throw new Error(m);
}
if (!supportsWebGL) {
	let m = "WebGL not supported!\n\nMore information available at https://get.webgl.org/";
	alert(m);
	throw new Error(m);
}

const byId = function (id) {
	return document.getElementById(id);
};
Cookies.defaults = {
	expires: 3600,
	sameSite: "Strict",
};

///// ----- ASYNC FUNCTIONS ----- /////
/// --- LOBBY --- ///
// Establish connection
SOCKET.on("connect", () => {
	console.log("Established connection to the server");
	console.log("ID is " + ID);
});

// Let client know they've joined the room
SOCKET.on("joined", (data) => {
	console.log("Joined room '" + data.roomCode + "'");
	hide("loading");

	// update local game values
	ROOM.code = data.roomCode;
	ROOM.settings = data.settings;
	ROOM.host = data.host;
	data.users.forEach((o) => {
		USERS[o.id] = { name: htmlDecode(o.name) };
	});

	// switch to game screen
	byId("join").remove();
	show("game");

	// update DOM
	byId("roomCode").textContent = ROOM.code;
	updatePlayers();
	updateHost();
	updateSettings();

	// set cookies so game remembers the session (in case user accidentally closes tab and needs to rejoin)
	Cookies.set("name", getName(ID));
	Cookies.set("room", ROOM.code);
	Cookies.set("id", ID);
});

// Add another user to the room
SOCKET.on("userJoin", (data) => {
	// Add user data
	console.log(data.name, "joined");
	USERS[data.id] = { name: htmlDecode(data.name) };
	updatePlayers();
});

// Remove user from room
SOCKET.on("userLeave", (userID) => {
	// Clear user data
	console.log(getName(userID), "disconnected");
	delete USERS[userID];
	updatePlayers();
});

// Update which user is the host
SOCKET.on("userHost", (userID) => {
	ROOM.host = userID;
	updateHost();
});

// Update settings
SOCKET.on("settings", (data) => {
	// Update the settings on the client to reflect the new settings
	ROOM.settings = data;
	updateSettings();
});

/// --- GAME --- ///
// Start the game
SOCKET.on("startGame", (data) => {
	// Load book page information
	for (let _id in data.books) {
		BOOKS[_id] = {
			title: getName(_id) + "'s book",
			author: getName(_id),
			book: data.books[_id],
			presented: false,
		};
	}

	// Set round info
	ROUND.book = BOOKS[ID];
	ROUND.mode = data.start;
	ROUND.page = 0;

	// Update DOM
	hide(["setup", "invite"]);
	show(["gameplay", "status"]);

	// Update round status
	byId("statusTitle").textContent = BOOKS[ID].title;
	byId("statusPage").textContent = "1";
	byId("statusPageMax").textContent = ROOM.settings.pageCount;
	byId("waitDisplay").textContent = (Object.keys(USERS).length - 1).toString();

	// Show first round input
	updateInput();
	updateBooks();
	byId("inputTitle").focus();
});

// Update book title
SOCKET.on("title", (data) => {
	BOOKS[data.id].title = htmlDecode(data.title);
	updateBooks();
});

// Get page info
SOCKET.on("page", (data) => {
	// Update local book variables
	BOOKS[data.id].book[data.page] = {
		value: data.value,
		author: data.author,
		mode: data.mode,
	};
	byId("b" + data.id).classList.add("done");

	// Update how many pages are left in the round
	if (data.author !== ID) {
		byId("waitDisplay").textContent = (parseInt(byId("waitDisplay").textContent) - 1).toString();
	}
});

// Go to next page in books
SOCKET.on("pageForward", () => {
	byId("wait").close();

	// Play ping sound
	let audio = new Audio("/sound/ping.mp3");
	audio.play().then();

	// Determine round information
	ROUND.page += 1;
	ROUND.mode = ROUND.mode === "Write" ? "Draw" : "Write";
	for (let i in BOOKS) {
		if (BOOKS[i].book[ROUND.page] === ID) {
			ROUND.book = BOOKS[i];
		}
	}

	// Update status
	byId("statusTitle").textContent = ROUND.book.title;
	byId("statusPage").textContent = ROUND.page + 1;

	// Update previous page, input mode, book list, timer
	updatePrevious();
	updateInput();
	updateBooks();

	// Show how many pages are left
	byId("waitDisplay").textContent = (Object.keys(USERS).length - 1).toString();
});

// Timer went off, automatically submit page
SOCKET.on("timerFinish", () => {
	endTimer();
});

/// --- PRESENTING --- ///
// Start presenting mode
SOCKET.on("startPresenting", () => {
	// Update DOM
	hide(["gameplay", "status"]);
	show(["present", "download"]);
	byId("wait").close();

	// Update round state
	ROUND.page = undefined;
	ROUND.book = undefined;
	ROUND.mode = "Presenting";

	// Add books to DOM for presenting
	updateBooks();
	updatePresentList();
});

SOCKET.on("presentBook", (data) => {
	show("presentWindow");
	hide("presentMenu");
	byId("inputPresentForward").disabled = false;
	byId("inputPresentBack").disabled = true;
	byId("inputPresentFinish").disabled = true;
	byId("presentBlurb").style.height = "100%";

	// Keep track of presentation
	ROUND.book = BOOKS[data.book];
	ROUND.page = -1;
	ROOM.presenter = data.presenter;

	// Get book title and authors
	let _title = ROUND.book.title;
	let _presenter = getName(ROOM.presenter);
	let _authors = [];
	ROUND.book.book.forEach((_page) => {
		let _author = getName(_page.author);
		if (_authors.indexOf(_author) === -1) {
			_authors.push(_author);
		}
	});

	// Show book information
	byId("presentTitle").textContent = _title;
	byId("authors").textContent = "Created by " + _authors.join(", ");
	byId("presenter").textContent = "Presented by " + _presenter;

	// If you're the presenter, enable controls
	if (ID === ROOM.presenter) {
		show("presentControls");
	} else if (ID === ROOM.host) {
		// Otherwise, enable override if client is the host
		show("presentOverride");
	}

	// Cross out book into present menu
	let _row = byId("p" + data.book.toString());
	_row.style.textDecoration = "line-through";
	_row.style.opacity = "60%";
});

SOCKET.on("presentForward", () => {
	// Go to next page
	byId("inputPresentBack").disabled = false;
	byId("presentBlurb").style.height = "";
	ROUND.page += 1;

	// Add page to window
	let _page = ROUND.book.book[ROUND.page];
	let _div = document.createElement("div");
	_div.classList.add("page");

	// Add attribution to page
	let _attr = document.createElement("div");
	let _author = document.createElement("span");
	let _num = document.createElement("span");
	_attr.classList.add("attribution");
	_author.textContent = getName(_page.author) + ":";
	_num.textContent = (ROUND.page + 1).toString() + "/" + ROOM.settings.pageCount.toString();
	_attr.appendChild(_author);
	_attr.appendChild(_num);
	_div.appendChild(_attr);

	// Add data to page
	switch (_page.mode) {
		case "Write":
			let _p = document.createElement("p");
			_p.textContent = _page.value;
			_p.classList.add("presentWrite");
			_div.appendChild(_p);
			break;
		case "Draw":
			let _img = document.createElement("img");
			_img.src = _page.value;
			_img.classList.add("presentDraw");
			_img.addEventListener("load", () => {
				let _window = byId("presentWindow");
				_window.scrollTop = _window.scrollHeight;
			});
			_div.appendChild(_img);
			break;
	}

	// Add page to window
	let _window = byId("presentWindow");
	_window.appendChild(_div);
	_window.scrollTop = _window.scrollHeight;

	// Last page
	if (ROUND.page === parseInt(ROOM.settings.pageCount) - 1) {
		byId("inputPresentForward").disabled = true;

		if (ID === ROOM.presenter) {
			byId("inputPresentFinish").disabled = false;
		}
	}
});

SOCKET.on("presentBack", () => {
	// Go to previous page
	byId("inputPresentForward").disabled = false;
	ROUND.page -= 1;

	// Remove last added page
	let _pages = document.querySelectorAll(".page");
	_pages[_pages.length - 1].remove();

	// First page
	if (ROUND.page === -1) {
		byId("inputPresentBack").disabled = true;
		byId("presentBlurb").style.height = "100%";
	}
});

SOCKET.on("presentOverride", () => {
	// Update presenter
	ROOM.presenter = ROOM.host;

	// Update UI buttons
	if (ID === ROOM.host) {
		show("presentControls");
		if (ROUND.page === parseInt(ROOM.settings.pageCount) - 1) {
			byId("inputPresentFinish").disabled = false;
		}
		hide("presentOverride");
	} else {
		hide("presentControls");
	}

	// Display new presenter of book
	byId("presenter").textContent = "Presented by " + getName(ROOM.host);
});

SOCKET.on("presentFinish", () => {
	// Return to present lobby
	show("presentMenu");
	hide(["presentWindow", "presentControls", "presentOverride"]);

	// Clear pages from presentWindow
	document.querySelectorAll(".page").forEach((e) => {
		e.remove();
	});

	// Keep track of book being presented
	ROUND.book.presented = true;

	// If all books have been presented, allow host to return to lobby
	let _done = true;
	Object.keys(BOOKS).forEach((e) => {
		_done = _done && BOOKS[e].presented;
	});
	byId("finish").disabled = !_done;
});

/// --- END --- ///
// Game finish event
SOCKET.on("finish", () => {
	console.log("Started new game");

	// Reset game data
	for (let _ in BOOKS) {
		delete BOOKS[_];
	}
	for (let _ in ROUND) {
		delete ROUND[_];
	}

	// Reset layout
	show(["title", "setup", "invite"]);
	hide(["present", "books", "download", "previous", "previousDraw", "previousWrite"]);
	byId("previousDraw").textContent = "";
	byId("previousWrite").src = "";
	byId("statusPage").textContent = "1";
	byId("finish").disabled = true;

	// Force Update DOM
	updatePlayers();
	updateHost();
	updateSettings();
});

// Disconnect from the server
SOCKET.on("kick", (data) => {
	switch (data) {
		case "server full":
			alert("Server full! Can't connect.");
			break;
		case "invalid room code":
			alert("Invalid room code!");
			break;
		case "invalid settings":
			alert("Invalid settings!");
			break;
	}
});

SOCKET.on("disconnect", (data) => {
	// Determine which disconnect has occurred and display relevant error
	switch (data) {
		case "io server disconnect":
			window.location.reload(true);
			break;
		case "ping timeout":
			alert("Timed out from server.");
			window.location.reload(true);
			break;
		case "transport close":
			if (ROOM.code) {
				alert("Lost connection to server.");
				window.location.reload(true);
			}
			break;
		default:
			alert("Disconnected due to an unknown error.");
			window.location.reload(true);
	}
});

///// ----- SYNCHRONOUS FUNCTIONS ----- /////
// Restrict inputs with a filter function
// Get name from ID
function getName(id) {
	if (id) {
		return USERS[id].name;
	} else {
		console.error("ID is undefined");
	}
}

// Decode strings to html
function htmlDecode(input) {
	if (input) {
		let _doc = new DOMParser().parseFromString(input, "text/html");
		return _doc.documentElement.textContent;
	} else {
		return "";
	}
}

// Copy text to clipboard
function copyToClipboard(text) {
	// Copy using the navigator API
	if (navigator.clipboard && window.isSecureContext) {
		navigator.clipboard.writeText(text).then();
	} else {
		// If not supported, create a textarea to copy from
		let textArea = document.createElement("textarea");
		textArea.value = text;
		textArea.style.top = "0";
		textArea.style.left = "0";
		textArea.style.position = "fixed";

		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		return new Promise((res, req) => {
			document.execCommand("copy") ? res() : req();
			textArea.remove();
		});
	}
	return false;
}

/// --- UPDATE DOM --- ///
// Lobby: Update settings
function updateSettings() {
	// First page
	document.querySelectorAll("input[name=firstPage]").forEach((elem) => {
		elem.checked = elem.value === ROOM.settings.firstPage;
	});
	byId("firstPageDisplay").value = ROOM.settings.firstPage;

	// Pages per book
	byId("pageCount").value = byId("pageCountDisplay").textContent = ROOM.settings.pageCount;

	// Page assignment
	document.querySelectorAll("input[name=pageOrder]").forEach((elem) => {
		elem.checked = elem.value === ROOM.settings.pageOrder;
	});
	byId("pageOrderDisplay").value = ROOM.settings.pageOrder;

	// Color palette
	document.querySelector('#colorPalette [value="' + ROOM.settings.palette + '"]').selected = true;
	byId("colorPaletteDisplay").value = ROOM.settings.palette;

	// Write time limit
	byId("timeWrite").value = ROOM.settings.timeWrite;
	byId("timeWriteDisplay").value = parseInt(ROOM.settings.timeWrite)
		? ROOM.settings.timeWrite + " min"
		: "None";

	// Draw time limit
	byId("timeDraw").value = ROOM.settings.timeDraw;
	byId("timeDrawDisplay").value = parseInt(ROOM.settings.timeDraw)
		? ROOM.settings.timeDraw + " min"
		: "None";
}

// Sidebar: Update host information on the page
function updateHost() {
	// Update the host name in the DOM
	document.querySelectorAll(".hostName").forEach((elem) => {
		elem.textContent = "Host: " + getName(ROOM.host);
	});

	// Allow the client to edit settings if they're the host
	document.querySelectorAll(".host").forEach((elem) => {
		ID === ROOM.host ? show(elem) : hide(elem);
	});
	document.querySelectorAll(".notHost").forEach((elem) => {
		ID === ROOM.host ? hide(elem) : show(elem);
	});
}

// Sidebar: Update player list on the page
function updatePlayers() {
	let _playerList = byId("playersList");
	_playerList.innerHTML = "";

	// Add everyone to player list
	for (let _id in USERS) {
		let nameElem = document.createElement("li");
		nameElem.textContent = getName(_id);
		if (_id === ID) {
			nameElem.title = "You!";
			nameElem.style.fontWeight = "bold";
		}
		_playerList.appendChild(nameElem);
	}

	// Increment player count
	byId("playersCount").textContent = "(" + Object.keys(USERS).length.toString() + "/10)";

	// Show/hide start button/minimum player warning depending on player count
	if (Object.keys(USERS).length > 1 || DEBUG) {
		show("inputStart");
		hide("inputStartWarning");
	} else {
		hide("inputStart");
		show("inputStartWarning");
	}
}

// Sidebar: Update book list on the page
function updateBooks() {
	show("books");

	let _bookList, _id, _book, _bookTitle, _bookAuthor, _bookDL;
	_bookList = byId("booksList");
	_bookList.innerHTML = "";

	// Update the list of books
	for (_id in BOOKS) {
		// Create elements
		_book = document.createElement("li");
		_bookTitle = document.createElement("span");
		_bookAuthor = document.createElement("span");
		_bookDL = document.createElement("input");

		// Assign the correct classes for styling
		_bookAuthor.className = "author";
		_bookAuthor.id = "b" + _id;

		// Display who's working on the current page of the book
		if (ROUND.mode === "Presenting") {
			_bookTitle.textContent = BOOKS[_id].title;
			_bookAuthor.textContent = "by\u00a0" + BOOKS[_id].author;
		} else {
			let _num, _page, _author;
			_num = (ROUND.page + 1).toString();
			_page = BOOKS[_id].book[ROUND.page];
			_author = getName(_page.author ?? _page);
			_bookTitle.textContent = BOOKS[_id].title;
			_bookAuthor.textContent = "Pg\u00a0" + _num + "\u00a0-\u00a0" + _author;

			// Indicate whether page has been completed or not
			if (_page.value) {
				_bookAuthor.classList.add("done");
			}
		}

		if (ROUND.mode === "Presenting") {
			// Add download buttons
			_bookDL.type = "button";
			_bookDL.value = "Download";
			_bookDL.classList.add("download");
			(function (i) {
				_bookDL.addEventListener("click", () => {
					download([i]);
				});
			})(_id);

			// Add to DOM
			_book.appendChild(_bookTitle);
			_book.appendChild(_bookDL);
			_book.appendChild(_bookAuthor);
			_bookList.appendChild(_book);
		} else {
			// Add to DOM
			_book.appendChild(_bookTitle);
			_book.appendChild(_bookAuthor);
			_bookList.appendChild(_book);
		}
	}
}

// Game: Update previous page display
function updatePrevious() {
	hide("title");
	show("previous");

	let _previousDraw = byId("previousDraw");
	let _previousWrite = byId("previousWrite");
	let _previousPage = ROUND.book.book[ROUND.page - 1].value;

	switch (ROUND.mode) {
		case "Write":
			// Current mode is write, so the previous page is draw
			_previousDraw.src = _previousPage ? _previousPage : "img/placeholder.png";
			hide(_previousWrite);
			show(_previousDraw);
			break;

		case "Draw":
			// Current mode is draw, so the previous page is write
			_previousWrite.textContent = htmlDecode(_previousPage);
			hide(_previousDraw);
			show(_previousWrite);
			break;
	}
}

// Game: Update input mode
function updateInput() {
	// Change input mode
	switch (ROUND.mode) {
		case "Write":
			// Change to writing mode
			hide("draw");
			show("write");

			// Reset writing input
			byId("inputWrite").value = "";
			byId("inputWrite").focus();
			break;

		case "Draw":
			// Change to drawing mode
			hide("write");
			show("draw");

			// Reset drawing inputs
			CANVAS.clear();
			//console.log(CANVAS.getObjects());  todo: consider cleaning up/destroying objects at end of each round?
			DRAW.undo = [];
			byId("toolUndo").disabled = true;
			byId("toolRedo").disabled = true;
			updatePalette();
			changeColor();
			resizeCanvas();
			break;
	}

	// Round timer
	if (
		(ROUND.mode === "Write" && +ROOM.settings.timeWrite) ||
		(ROUND.mode === "Draw" && +ROOM.settings.timeDraw)
	) {
		// If timer is already enabled, reset it
		if (ROUND.timer) {
			clearInterval(ROUND.timer);
			ROUND.timer = undefined;
		}

		// Enable the timer
		show("statusTimer");
		let time = ROUND.mode === "Write" ? +ROOM.settings.timeWrite : +ROOM.settings.timeDraw;
		ROUND.timeLeft = parseInt(time * 60);
		ROUND.timer = setInterval(() => {
			if (--ROUND.timeLeft >= 0) {
				updateTimer();
			} else {
				endTimer();
			}
		}, 1000);
		updateTimer();
	} else {
		hide("statusTimer");
	}

	// Enable submit button
	byId("inputSubmit").disabled = false;
}

// Game: Timers
function updateTimer() {
	// Update timer text
	let min, sec;
	min = Math.floor(ROUND.timeLeft / 60).toString();
	sec = Math.floor(ROUND.timeLeft - min * 60).toString();
	byId("timer").textContent = min + ":" + sec.padStart(2, "0");

	// Need to alternate between two identical animations,
	// 	since there's no native way to restart it with js
	byId("timer").style.animationName =
		byId("timer").style.animationName === "tick-1" ? "tick-2" : "tick-1";

	// Upon timer finishing, alert user and submit page automatically
	if (ROUND.timeLeft === 0) {
		byId("timer").textContent = "Time's up!";
	}
}

function endTimer() {
	if (ROUND.timer) {
		// Reset timer
		clearInterval(ROUND.timer);
		ROUND.timer = undefined;

		// Submit page
		byId("inputSubmit").click();
	}
}

// Update color input/palette
function updatePalette() {
	// Clear divs
	byId("colorHistory").innerHTML = "";
	byId("colorRadio").innerHTML = "";

	// Change which drawing inputs are available depending on the palette
	if (ROOM.settings.palette in PALETTES) {
		// Give the player a specific palette
		hide(["colorContainer", "colorHistory"]);
		show("colorRadio");

		// Generate palette buttons
		for (let _color of PALETTES[ROOM.settings.palette]) {
			let _elem = document.createElement("input");
			_elem.classList.add("color");
			_elem.style.backgroundColor = _color;
			_elem.type = "radio";
			_elem.name = "palette";
			_elem.id = _color;
			(function (c) {
				_elem.addEventListener("click", () => {
					changeColor(c);
				});
			})(_color);
			byId("colorRadio").appendChild(_elem);
		}
	} else if (ROOM.settings.palette === "Random") {
		// Give the player a random selection of colors
		hide(["colorContainer", "colorHistory"]);
		show("colorRadio");
	} else {
		// No palette, let users select whatever colors they want
		hide("colorRadio");
		show(["colorContainer"]);

		// Keep track of color history
		if (DRAW.colorHistory[0]) {
			show(["colorHistory"]);
		}
		for (let i = 0; i < 12; i++) {
			let _elem = document.createElement("input");
			_elem.classList.add("color");
			_elem.type = "button";
			if (DRAW.colorHistory[i]) {
				_elem.style.backgroundColor = DRAW.colorHistory[i];
				(function (c) {
					_elem.addEventListener("click", () => {
						changeColor(c);
					});
				})(DRAW.colorHistory[i]);
			} else {
				hide(_elem);
			}
			byId("colorHistory").appendChild(_elem);
		}
	}
}

// Update presenting page
function updatePresentList() {
	let _presentTable;
	_presentTable = byId("presentTable");
	_presentTable.innerHTML = "";

	// Present event (for binding to buttons)
	const _presentBook = function (args) {
		SOCKET.emit("presentBook", args);
	};

	// Update list of books
	for (let _id in BOOKS) {
		let _tr = document.createElement("tr");
		_tr.id = "p" + _id;

		// Create book title + author
		let _bookTD = document.createElement("td");
		let _titleElem = document.createElement("span");
		let _authorElem = document.createElement("span");
		_titleElem.textContent = BOOKS[_id].title;
		_authorElem.textContent = "by " + getName(_id);
		_authorElem.className = "author";
		_bookTD.appendChild(_titleElem);
		_bookTD.appendChild(_authorElem);

		// Create present button
		let _presentTD = document.createElement("td");
		let _presentInput = document.createElement("input");
		_presentInput.value = "Present";
		_presentInput.type = "button";
		_presentInput.addEventListener(
			"click",
			_presentBook.bind(this, {
				book: _id,
				key: SESSION_KEY,
			})
		);
		_presentTD.appendChild(_presentInput);

		// Append elements to DOM
		_presentTable.appendChild(_tr);
		_tr.appendChild(_bookTD);
		_tr.appendChild(_presentTD);
	}
}

// Change which color is selected
function changeColor(color) {
	// If no color value is passed in, reset color
	if (color === undefined) {
		if (PALETTES[ROOM.settings.palette]) {
			color = PALETTES[ROOM.settings.palette][0];
		} else {
			color = "#000000";
		}
	}

	// Update draw color
	let _oldColor = DRAW.color;
	DRAW.color = color;

	// Update everything to use new color
	byId("toolColor").value = color;
	if (DRAW.tool !== TOOL.ERASE) {
		MOUSE_CURSOR.set({ fill: color });

		if (DRAW.tool !== TOOL.FILL) {
			CANVAS.freeDrawingBrush.color = color;
		}
	} else {
		// Automatically switch to brush if using eraser
		byId("toolPaint").click();
	}

	// History/selection
	if (ROOM.settings.palette === "No palette") {
		// If there's no palette, keep track of history
		DRAW.colorHistory.unshift(_oldColor); // add previous color to history
		DRAW.colorHistory = DRAW.colorHistory.filter((i) => i !== color); // remove new color (if in history)
		DRAW.colorHistory.slice(0, 12); // limit length
		updatePalette();

		// Also invert overlay if color is black
		if (color === "#000000") {
			byId("colorContainer").classList.add("alt");
		} else {
			byId("colorContainer").classList.remove("alt");
		}
	} else {
		// Otherwise, ensure input element button is selected
		byId(color).checked = true;
	}
}

// Change which tool is selected
function changeTool(id) {
	document.querySelectorAll(".selected").forEach((e) => {
		e.classList.remove("selected");
	});
	id.classList.add("selected");
}

// Change size of the tool
function changeSize(size) {
	// Validate size
	size = size ? Math.min(Math.max(size, 1), 99) : 4;
	DRAW.width = size;

	// Update brush size
	CANVAS.freeDrawingBrush.width = size;
	MOUSE_CURSOR.set({ radius: size / 2, top: 300, left: 400 })
		.setCoords()
		.canvas.renderAll();
}

// Hide an element in the DOM
function hide(e) {
	function hideElem(e) {
		if (typeof e === "string") {
			e = byId(e);
		}
		e.classList.add("hidden");
		e.hidden = true;
	}

	if (Array.isArray(e)) {
		for (let i of e) {
			hideElem(i);
		}
	} else {
		hideElem(e);
		return e;
	}
}

// Show an element in the DOM
function show(e) {
	function showElem(e) {
		if (typeof e === "string") {
			e = byId(e);
		}
		e.classList.remove("hidden");
		e.hidden = false;
	}

	if (Array.isArray(e)) {
		for (let i of e) {
			showElem(i);
		}
	} else {
		showElem(e);
		return e;
	}
}

// Download books in a simple HTML file
function download(bookIDs) {
	// Generate contents for each book
	let filename = "picturephone_" + Date.now() + ".html";
	let html =
		'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Picturephone Storybooks</title><style>*{font-family:sans-serif;} body{font-size:20px;} li{width:800px;} img{display:block;border:2px ridge;} .write{padding:1em 0;}</style></head><body>';
	for (let _id of bookIDs) {
		// Iterate over each book and generate HTML for it
		let _book = document.createElement("article");

		// Book header information
		let _bookHeader = document.createElement("header");
		let _title = document.createElement("h1");
		let _authors = document.createElement("h4");
		let _names = [];
		_title.textContent = BOOKS[_id].title;
		BOOKS[_id].book.forEach((_page) => {
			let _n = getName(_page.author);
			if (_names.indexOf(_n) === -1) {
				_names.push(_n);
			}
		});
		_authors.textContent = "by " + _names.join(", ");
		_bookHeader.appendChild(_title);
		_bookHeader.appendChild(_authors);

		// Book content / pages
		let _pages = document.createElement("ol");
		BOOKS[_id].book.forEach((_p) => {
			// Create page
			let _page = document.createElement("li");
			switch (_p.mode) {
				case "Write":
					_page.textContent = _p.value;
					_page.classList.add("write");
					break;
				case "Draw":
					let _img = document.createElement("img");
					_img.src = _p.value;
					_page.appendChild(_img);
					_page.classList.add("draw");
					break;
			}
			_pages.appendChild(_page);
		});

		// Add book to HTML
		_book.appendChild(_bookHeader);
		_book.appendChild(_pages);
		html += _book.outerHTML;
		html += "<hr>";
	}
	html += "</body></html>";

	// Add to hidden dom element in the body
	let _element = document.createElement("a");
	_element.setAttribute("href", "data:text/html;charset=utf-8," + encodeURIComponent(html));
	_element.setAttribute("download", filename);
	_element.style.display = "none";

	// Save as file
	document.body.appendChild(_element);
	_element.click();
	document.body.removeChild(_element);
}

/// --- INPUTS --- ///
{
	// Prefill name field with cookie
	if (Cookies.get("name")) {
		byId("inputName").value = Cookies.get("name");
	}

	// Prefill room ID field with URL parameters
	let _url = window.location.href;
	let _params = new URLSearchParams(_url.slice(_url.indexOf("?") + 1));
	if (_params.has("room")) {
		byId("inputRoom").value = _params
			.get("room")
			.replace(/[^a-zA-Z0-9-_]/g, "")
			.substr(0, 12);
	}

	/// JOIN
	// Join: Input filter
	function setInputFilter(textBox, inputFilter) {
		["input", "keydown", "keyup", "mousedown", "mouseup", "select", "contextmenu", "drop"].forEach(
			(event) => {
				textBox.addEventListener(event, function () {
					if (inputFilter(this.value)) {
						this.oldValue = this.value;
						this.oldSelectionStart = this.selectionStart;
						this.oldSelectionEnd = this.selectionEnd;
					} else if (this.hasOwnProperty("oldValue")) {
						this.value = this.oldValue;
						this.setSelectionRange(this.oldSelectionStart, this.oldSelectionEnd);
					} else {
						this.value = "";
					}
				});
			}
		);
	}

	setInputFilter(byId("inputRoom"), function (value) {
		return /^[a-zA-Z0-9_-]*$/i.test(value);
	});

	// Join: Join button
	byId("inputJoin").addEventListener("click", (e) => {
		// Receive and validate inputs
		let _inputName = byId("inputName");
		let _inputRoom = byId("inputRoom");

		if (_inputName.reportValidity() && _inputRoom.reportValidity()) {
			USERS[ID] = { name: _inputName.value.substr(0, 32) };
			ROOM.code = _inputRoom.value.substr(0, 12);

			_inputName.disabled = true;
			_inputRoom.disabled = true;
			e.target.disabled = true;
			show("loading");

			window.history.pushState({ roomCode: ROOM.code }, "", "?room=" + ROOM.code);

			SOCKET.emit("joinRoom", {
				id: ID,
				name: getName(ID),
				roomCode: ROOM.code,
				key: SESSION_KEY,
			});
		}
	});

	/// SETUP
	// Setup: Send settings to the server
	function emitSettings() {
		ID === ROOM.host
			? SOCKET.emit("settings", { settings: ROOM.settings, key: SESSION_KEY })
			: SOCKET.disconnect();
		updateSettings();
	}

	// Setup: First page
	document.querySelectorAll("input[name=firstPage]").forEach((elem) => {
		elem.addEventListener("input", (e) => {
			if (ROOM.settings) {
				ROOM.settings.firstPage = e.target.value;
				emitSettings();
			}
		});
	});

	// Setup: Pages per book
	let _pageCount = byId("pageCount");
	_pageCount.addEventListener("input", (e) => {
		byId("pageCountDisplay").textContent = e.target.value;
	});
	_pageCount.addEventListener("change", (e) => {
		if (ROOM.settings) {
			ROOM.settings.pageCount = e.target.value;
			emitSettings();
		}
	});

	// Setup: Page assignment
	document.querySelectorAll("input[name=pageOrder]").forEach((elem) => {
		elem.addEventListener("input", (e) => {
			if (ROOM.settings) {
				ROOM.settings.pageOrder = e.target.value;
				emitSettings();
			}
		});
	});

	// Setup: Color palette
	byId("colorPalette").addEventListener("input", (e) => {
		if (ROOM.settings) {
			ROOM.settings.palette = e.target.value;
			emitSettings();
		}
	});

	// Setup: Write time limit
	let _timeWrite = byId("timeWrite");
	_timeWrite.addEventListener("input", (e) => {
		byId("timeWriteDisplay").value = parseInt(e.target.value) ? e.target.value + " min" : "None";
	});
	_timeWrite.addEventListener("change", (e) => {
		if (ROOM.settings) {
			ROOM.settings.timeWrite = e.target.value;
			emitSettings();
		}
	});

	// Setup: Draw time limit
	let _timeDraw = byId("timeDraw");
	_timeDraw.addEventListener("input", (e) => {
		byId("timeDrawDisplay").value = parseInt(e.target.value) ? e.target.value + " min" : "None";
	});
	_timeDraw.addEventListener("change", (e) => {
		if (ROOM.settings) {
			ROOM.settings.timeDraw = e.target.value;
			emitSettings();
		}
	});

	// Setup: Start game button
	byId("inputStart").addEventListener("click", () => {
		if (ROOM.settings) {
			SOCKET.emit("startGame", { settings: ROOM.settings, key: SESSION_KEY });
		}
	});

	// Setup: Room code toggle
	byId("roomCode").addEventListener("mousedown", (e) => {
		e.target.classList.remove("blurred");
	});
	byId("roomCode").addEventListener("mouseup", (e) => {
		e.target.classList.add("blurred");
	});

	// Setup: Invite button
	byId("inviteButton").addEventListener("click", (e) => {
		// Disable button and show confirmation
		e.target.disabled = true;
		show("inviteButtonStatus");

		// Add room code to clipboard
		copyToClipboard(window.location.href);

		// Disappear after 2 seconds and re-enable button
		setTimeout(() => {
			hide("inviteButtonStatus");
			e.target.disabled = false;
		}, 2200);
	});

	/// GAME
	// Game: Let player change their title
	byId("inputTitle").addEventListener("input", (e) => {
		let _title = e.target.value.substr(0, 40);
		if (_title.length === 0) {
			_title = getName(ID) + "'s book";
		}
		byId("statusTitle").textContent = _title;
	});
	byId("inputTitle").addEventListener("change", (e) => {
		let _title = e.target.value.substr(0, 40);
		if (_title.length === 0) {
			_title = getName(ID) + "'s book";
		}
		SOCKET.emit("updateTitle", { title: _title, key: SESSION_KEY });
	});

	// Game: Write textarea resizing
	byId("inputWrite").addEventListener("input", (e) => {
		e.target.style.height = "auto";
		if (e.target.scrollHeight) {
			e.target.style.height = e.target.scrollHeight + "px";
		} else {
			e.target.style.height = "1em";
		}
	});

	// Game: Submit page
	byId("inputSubmit").addEventListener("click", (e) => {
		// Get round data
		let _value = undefined;
		switch (ROUND.mode) {
			case "Write":
				// Writing round
				_value = byId("inputWrite").value.substr(0, 140);
				break;

			case "Draw":
				// Drawing round - Export canvas to base64
				// Resize and render canvas
				VIEWPORT.width = CANVAS_REGL.width = 800;
				VIEWPORT.height = CANVAS_REGL.height = 600;
				CANVAS.renderAll();
				_value = CANVAS_REGL.toDataURL();
				break;
		}

		// Send data to server
		SOCKET.emit("submitPage", {
			mode: ROUND.mode,
			value: _value,
			key: SESSION_KEY,
		});

		// Put client in waiting state
		e.target.disabled = true;
		byId("wait").showModal();
	});

	// Game: Waiting dialog
	let _wait = byId("wait");
	dialogPolyfill.registerDialog(_wait);
	_wait.addEventListener("cancel", (e) => {
		e.preventDefault();
	});

	/// DRAW
	// Draw: Paint tool
	byId("toolPaint").addEventListener("click", (e) => {
		// Change to paint tool
		DRAW.tool = TOOL.PAINT;
		changeTool(e.target);
		hide("optionsFill");
		show("optionsBrush");

		// Draw with so many beautiful colors
		CANVAS.freeDrawingBrush.color = DRAW.color;
		CANVAS.freeDrawingBrush.width = DRAW.width;
		CANVAS.set({ freeDrawingCursor: "none" });
		MOUSE_CURSOR.set({ radius: DRAW.width / 2, fill: DRAW.color, stroke: "black" });
	});

	// Draw: Erase tool
	byId("toolErase").addEventListener("click", (e) => {
		// Change to erase tool
		DRAW.tool = TOOL.ERASE;
		changeTool(e.target);
		hide("optionsFill");
		show("optionsBrush");

		// Erasing is just drawing white
		CANVAS.freeDrawingBrush.color = "#FFFFFF";
		CANVAS.freeDrawingBrush.width = DRAW.width;
		CANVAS.set({ freeDrawingCursor: "none" });
		MOUSE_CURSOR.set({ radius: DRAW.width / 2, fill: "white", stroke: "grey" });
	});

	// Draw: Fill tool
	byId("toolFill").addEventListener("click", (e) => {
		// Change to fill tool
		DRAW.tool = TOOL.FILL;
		changeTool(e.target);
		hide("optionsBrush");
		show("optionsFill");

		// Disable drawing and change cursor
		CANVAS.freeDrawingBrush.color = "rgba(0,0,0,0)";
		CANVAS.freeDrawingBrush.width = 0;
		CANVAS.set({ freeDrawingCursor: "crosshair" });
		MOUSE_CURSOR.set({ radius: 0, fill: "rgba(0,0,0,0)", stroke: "rgba(0,0,0,0)" });
	});

	// Draw: Undo tool
	byId("toolUndo").addEventListener("click", (e) => {
		// Undo last thingy
		if (DRAW.undo.length) {
			// Get last command and undo it
			let _command = DRAW.undo.pop();
			switch (_command.type) {
				case "path:created":
				case "floodfill:created":
					if (CANVAS.contains(_command.object)) {
						CANVAS.remove(_command.object);
						DRAW.redo.push(_command);
						byId("toolRedo").disabled = false;
					}
					break;
			}

			// If there's nothing left to undo, disable button
			if (DRAW.undo.length === 0) {
				e.target.disabled = true;
			}
		} else {
			e.target.disabled = true;
		}
	});

	// Draw: Redo tool
	byId("toolRedo").addEventListener("click", (e) => {
		// Redo last undo
		if (DRAW.redo.length) {
			// Get last command and redo it
			let _command = DRAW.redo.pop();
			switch (_command.type) {
				case "path:created":
				case "floodfill:created":
					CANVAS.add(_command.object);
					DRAW.undo.push(_command);
					byId("toolUndo").disabled = false;
					break;
			}

			// If there's nothing left to undo, disable button
			if (DRAW.redo.length === 0) {
				e.target.disabled = true;
			}
		} else {
			e.target.disabled = true;
		}
	});

	// Draw: Use tools with keyboard
	document.addEventListener("keydown", (e) => {
		if (ROUND.mode === "Draw" && document.activeElement !== byId("inputTitle")) {
			switch (e.code) {
				case "KeyD":
					byId("toolPaint").click();
					break;
				case "KeyE":
					byId("toolErase").click();
					break;
				case "KeyF":
					byId("toolFill").click();
					break;
				case "KeyZ":
					byId("toolUndo").click();
					break;
				case "KeyY":
					byId("toolRedo").click();
					break;
			}
		}
	});

	// Draw: Color picker
	byId("toolColor").addEventListener("change", (e) => {
		changeColor(e.target.value);
	});

	// Draw: Brush size
	byId("brushSize").addEventListener("input", (e) => {
		// Update brush width
		changeSize(parseInt(e.target.value));

		// Update range input
		byId("brushSizeRange").value = Math.round(Math.sqrt(DRAW.width) * 10) / 10;
	});
	byId("brushSizeRange").addEventListener("input", (e) => {
		// Update brush width
		changeSize(Math.round(parseFloat(e.target.value) ** 2));

		// Update text input
		byId("brushSize").value = DRAW.width;
	});

	// Draw: Fill Threshold
	byId("fillThreshold").addEventListener("input", (e) => {
		// Update fill threshold
		DRAW.flow = parseInt(e.target.value);
		byId("fillThresholdRange").value = DRAW.flow;
	});
	byId("fillThresholdRange").addEventListener("input", (e) => {
		// Update fill threshold
		DRAW.flow = parseInt(e.target.value);
		byId("fillThreshold").value = DRAW.flow;
	});

	/// PRESENT
	// Present: Next page
	byId("inputPresentForward").addEventListener("click", () => {
		if (ID === ROOM.presenter) {
			if (ROUND.page < parseInt(ROOM.settings.pageCount) - 1) {
				SOCKET.emit("presentForward", { key: SESSION_KEY });
			}
		}
	});

	// Present: Previous page
	byId("inputPresentBack").addEventListener("click", () => {
		if (ID === ROOM.presenter) {
			if (ROUND.page > -1) {
				SOCKET.emit("presentBack", { key: SESSION_KEY });
			}
		}
	});

	// Present: Hijack presentation
	byId("inputPresentOverride").addEventListener("click", () => {
		if (ID === ROOM.host) {
			SOCKET.emit("presentOverride", { key: SESSION_KEY });
		}
	});

	// Present: Finished
	byId("inputPresentFinish").addEventListener("click", () => {
		if (ID === ROOM.presenter) {
			SOCKET.emit("presentFinish", { key: SESSION_KEY });
		}
	});

	// Present: Finish game, return to lobby
	byId("finish").addEventListener("click", () => {
		// Ensure user is host
		if (ID === ROOM.host) {
			// Confirm the host really wants to end the game
			if (window.confirm("Are you sure you want to end this game and return to the lobby?")) {
				// Finish game
				SOCKET.emit("finish", { key: SESSION_KEY });
			}
		}
	});

	// Download: Download all books
	byId("download").addEventListener("click", () => {
		download(Object.keys(BOOKS));
	});
}

/// --- CANVAS --- ///
// Canvas
const CANVAS = new fabric.Canvas("cBase", {
	isDrawingMode: true,
	freeDrawingCursor: "none",
});
CANVAS.freeDrawingBrush.width = DRAW.width;
CANVAS.freeDrawingBrush.color = DRAW.color;

// REGL canvas for WebGL rendering
const CANVAS_REGL = byId("cRegl");
const REGL = wrapREGL({
	canvas: CANVAS_REGL,
	pixelRatio: 1,
	attributes: { antialias: false, preserveDrawingBuffer: true },
});
byId("cBase").after(CANVAS_REGL);
hookREGL(CANVAS);

// Cursor canvas for custom drawing cursors
const CANVAS_CURSOR = new fabric.StaticCanvas("cCursor");
const MOUSE_CURSOR = new fabric.Circle({
	left: -100,
	top: -100,
	radius: DRAW.width / 2,
	fill: DRAW.color,
	stroke: "black",
	originX: "center",
	originY: "center",
});
CANVAS_CURSOR.add(MOUSE_CURSOR);
CANVAS.on("mouse:move", (obj) => {
	let mouse = obj.absolutePointer;
	MOUSE_CURSOR.set({ top: mouse.y, left: mouse.x }).setCoords().canvas.renderAll();
});
CANVAS.on("mouse:out", () => {
	MOUSE_CURSOR.set({ top: -100, left: -100 }).setCoords().canvas.renderAll();
});

// Resize the drawing canvas
function resizeCanvas() {
	// Get base image of canvas
	let _base = byId("canvasBase");
	_base.style.height = "";

	// Make dimensions and ensure ratio is correct (sometimes gets weird in chrome)
	let _w = _base.scrollWidth,
		_h = _base.scrollHeight;
	let _ratio = ((_h / _w) * 3) / 4;
	if (_ratio <= 0.99 || _ratio >= 1.01) {
		// disproportionate, change height to compensate
		_h = Math.floor((_w * 3) / 4);
	}

	// Resize canvas
	if (_w) {
		let zoom = CANVAS.getZoom() * (_w / CANVAS.getWidth());

		// Update viewport
		VIEWPORT.width = _w;
		VIEWPORT.height = _h;

		// Resize canvases
		CANVAS.setDimensions(VIEWPORT);
		CANVAS_CURSOR.setDimensions(VIEWPORT);
		CANVAS_REGL.width = VIEWPORT.width;
		CANVAS_REGL.height = VIEWPORT.height;

		// Update canvas zoom
		CANVAS.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		CANVAS_CURSOR.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);

		// Reheight html elements
		_base.style.height = _h + "px";
		byId("previousWrite").style.maxWidth = _w + "px";
	}
}

window.addEventListener("resize", resizeCanvas);

// Undo/redo stack
function record(type, object) {
	// Get previous command (if any)
	let _last;
	if (DRAW.undo.length) {
		_last = DRAW.undo[DRAW.undo.length - 1];
	}

	// Ensure commands aren't doubled up
	if (_last === undefined || type !== _last.type || object !== _last.object) {
		// Add to undo stack
		DRAW.undo.push({ type: type, object: object });
		byId("toolUndo").disabled = false;

		// Clear redo stack
		DRAW.redo = [];
		byId("toolRedo").disabled = true;
	}
}

CANVAS.on("path:created", (obj) => {
	if (DRAW.tool !== TOOL.FILL) {
		let path = new ShaderPath(obj.path);
		record("path:created", path);
		CANVAS.add(path);
	}
	CANVAS.remove(obj.path);
});

// Flood fill function
CANVAS.on("mouse:up", (obj) => {
	if (DRAW.tool === TOOL.FILL) {
		let mouse = obj.absolutePointer;
		if (mouse.x >= 0 && mouse.x >= 0 && mouse.x < DRAW.WIDTH && mouse.y < DRAW.HEIGHT) {
			fill({ x: Math.floor(mouse.x), y: Math.floor(mouse.y) });
		}
	}
});

function fill(pos) {
	/// FLOOD FILL ALGORITHM
	let xMin, yMin, xMax, yMax;

	// Get position from coords (and vice versa)
	const getPos = (x, y) => {
		return (y * DRAW.WIDTH + x) * 4;
	};
	const getCoords = (pos) => {
		let p = pos / 4;
		let x = p % DRAW.WIDTH;
		let y = (p - x) / DRAW.WIDTH;
		return { x: x, y: y };
	};

	// Get difference between two colors
	const diff = (data, pos, col) => {
		// comparison algorithm from here https://www.compuphase.com/cmetric.htm
		let rAvg = (data[pos] + col.r) / 2;
		let r = data[pos] - col.r;
		let g = data[pos + 1] - col.g;
		let b = data[pos + 2] - col.b;
		return (
			Math.sqrt((((512 + rAvg) * r * r) >> 8) + 4 * g * g + (((767 - rAvg) * b * b) >> 8)) >> 3
		); // between 0 and ~95.5
	};

	const check = (data, pos, col) => {
		// Check if pos hasn't been visited (alpha = 0) and has similar color
		if (data[pos + 3] === 0 && diff(data, pos, col) <= DRAW.flow) {
			return true;
		}
	};

	// Change color of pixel
	const colorPixel = (data, pos, col) => {
		// color pixels with the draw color
		data[pos] = col.r;
		data[pos + 1] = col.g;
		data[pos + 2] = col.b;
		data[pos + 3] = 255;

		// track colored pixel bounds
		let coords = getCoords(pos);
		xMin = Math.min(xMin, coords.x);
		yMin = Math.min(yMin, coords.y);
		xMax = Math.max(xMax, coords.x);
		yMax = Math.max(yMax, coords.y);
	};

	// Crop the canvas (for after the flood has been done)
	const cropCanvas = (source, left, top, width, height) => {
		let dest = document.createElement("canvas");
		dest.width = width;
		dest.height = height;
		dest.getContext("2d").drawImage(source, left, top, width, height, 0, 0, width, height);
		return dest;
	};

	/// Flood fill
	if (pos.x >= 0 && pos.x <= DRAW.WIDTH && pos.y >= 0 && pos.y <= DRAW.HEIGHT) {
		// Variables to keep track of flood fill dimensions
		xMin = xMax = pos.x;
		yMin = yMax = pos.y;

		// Colour to flood fill with
		let _source = fabric.Color.fromHex(DRAW.color)._source;
		let drawColor = { r: _source[0], g: _source[1], b: _source[2] };

		// Create a temporary canvas to calculate flood fill
		let canvas = document.createElement("canvas");
		canvas.width = DRAW.WIDTH;
		canvas.height = DRAW.HEIGHT;

		// Put current canvas data into image
		let img = new Image(DRAW.WIDTH, DRAW.HEIGHT);
		img.src = CANVAS.toDataURL({
			format: "png",
			multiplier: DRAW.WIDTH / CANVAS.getWidth(),
		});
		img.onload = () => {
			// Draw image on temp canvas
			let ctx = canvas.getContext("2d");
			ctx.drawImage(img, 0, 0, DRAW.WIDTH, DRAW.HEIGHT);
			let imgData = ctx.getImageData(0, 0, DRAW.WIDTH, DRAW.HEIGHT);
			let data = imgData.data;

			// Change all pixels to alpha 0
			for (let i = 0; i < DRAW.WIDTH * DRAW.HEIGHT; i++) {
				data[4 * i + 3] = 0;
			}

			// Get fill start
			let startPos = getPos(pos.x, pos.y);
			let startColor = {
				r: data[startPos],
				g: data[startPos + 1],
				b: data[startPos + 2],
			};

			// Run flood fill algorithm on the temp canvas
			let todo = [[pos.x, pos.y]];
			let n = 0;
			while (todo.length) {
				let pos = todo.pop();
				let x = pos[0];
				let y = pos[1];
				let currentPos = getPos(x, y);

				while (y-- >= 0 && check(data, currentPos, startColor)) {
					currentPos -= DRAW.WIDTH * 4;
				}

				currentPos += DRAW.WIDTH * 4;
				++y;
				let reachLeft = false;
				let reachRight = false;

				while (y++ < DRAW.HEIGHT - 1 && check(data, currentPos, startColor)) {
					colorPixel(data, currentPos, drawColor);

					if (x > 0) {
						if (check(data, currentPos - 4, startColor)) {
							if (!reachLeft) {
								todo.push([x - 1, y]);
								reachLeft = true;
							}
						} else if (reachLeft) {
							reachLeft = false;
						}
					}

					if (x < DRAW.WIDTH - 1) {
						if (check(data, currentPos + 4, startColor)) {
							if (!reachRight) {
								todo.push([x + 1, y]);
								reachRight = true;
							}
						} else if (reachRight) {
							reachRight = false;
						}
					}

					currentPos += DRAW.WIDTH * 4;

					if (++n > DRAW.WIDTH * DRAW.HEIGHT) {
						// Automatically break if the code gets stuck in an infinite loop
						// THIS SHOULD NEVER HAPPEN
						console.error("PICTUREPHONE ERROR: Infinite loop in flood fill algorithm");
						todo = [];
						break;
					}
				}
			}

			// Place filled shape back onto the original canvas
			ctx.putImageData(imgData, 0, 0);
			fabric.Image.fromURL(
				cropCanvas(canvas, xMin, yMin, xMax - xMin + 1, yMax - yMin + 1).toDataURL(),
				(e) => {
					CANVAS.add(e);
					e.set({ left: xMin, top: yMin, width: xMax - xMin + 1, height: yMax - yMin + 1 });
					e.bringToFront();
					CANVAS.renderAll();

					// also add to undo stack
					record("floodfill:created", e);

					// delete temp data
					img = null;
					imgData = null;
					canvas.remove();
				}
			);
		};
	}
}
