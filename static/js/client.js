/*
	picturephone
	client.js
	a multiplayer art experiment by Riley Taylor (rtay.io)
*/
"use strict";

/// --- SOCKET CONSTANTS --- ///
let array = new Uint32Array(3);
window.crypto.getRandomValues(array);
const ID = Cookies.get("id") ? Cookies.get("id") : (array[0].valueOf() + 1).toString();
const SESSION_KEY = array[1].valueOf().toString(16) + array[2].valueOf().toString(16); // currently unused
const SOCKET = io.connect(document.documentURI);

/// --- ENUMS --- ///
const TOOL = {
	PAINT: 0,
	ERASE: 1,
	FILL: 2,
	STICKER: 3,
};

/// --- GAME CONSTANTS --- ///
const ROOM = {};
const USERS = {};
const BOOKS = {};
const ROUND = {};
const DRAW = {
	tool: TOOL.PAINT,
	brush: undefined,
	color: "#000000",
	colorHistory: [],
	width: 6,
	undo: [],
	redo: [],
};

/// --- VARIABLES --- ///
var name = undefined;

// Ensure browser compatibility
if (!("getContext" in document.createElement("canvas"))) {
	let message =
		"Sorry, it looks like your browser does not support canvas! This game depends on canvas to be playable.";
	console.error(message);
	alert(message);
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
	Cookies.set("name", name);
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
			p: false,
		};
	}

	// Set round info
	ROUND.page = 0;
	ROUND.book = BOOKS[ID];
	ROUND.mode = data.start;

	// Update DOM
	hide("setup");
	hide("invite");
	show("gameplay");

	// Update round status
	show("status");
	byId("statusTitle").textContent = byId("inputTitle").value = BOOKS[ID].title;
	byId("waitDisplay").textContent = (Object.keys(USERS).length + 1).toString();

	// Show first round input
	updateInput();
	updateBooks();
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
	byId("waitDisplay").textContent = (parseInt(byId("waitDisplay").textContent) - 1).toString();
});

// Go to next page in books
SOCKET.on("pageForward", () => {
	byId("wait").close();

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

	// Update previous page, input mode, book list
	updatePrevious();
	updateInput();
	updateBooks();

	// Show how many pages are left
	byId("waitDisplay").textContent = Object.keys(USERS).length + 1;

	// Set timer
	// TODO: timers
});

/// --- PRESENTING --- ///
// Start presenting mode
SOCKET.on("startPresenting", () => {
	// Update DOM
	hide("gameplay");
	hide("status");
	show("present");
	show("download");
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
	ROUND.presenter = data.presenter;

	// Get book title and authors
	let _title = ROUND.book.title;
	let _presenter = getName(ROUND.presenter);
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
	if (ID === ROUND.presenter) {
		show("presentControls");
	} else if (ID === ROOM.host) {
		// Otherwise, enable override if client is the host
		show("presentOverride");
	}

	// Cross out book into present menu
	byId("p" + data.book.toString()).style.textDecoration = "line-through";
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

		if (ID === ROUND.presenter) {
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
	ROUND.presenter = ROOM.host;

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
	hide("presentWindow");
	hide("presentControls");
	hide("presentOverride");

	// Clear pages from presentWindow
	document.querySelectorAll(".page").forEach((e) => {
		e.remove();
	});

	// Keep track of book being presented
	ROUND.book.p = true;

	// If all books have been presented, allow host to return to lobby
	/*
	let _done = true;
	Object.keys(BOOKS).forEach((e) => {
		_done = _done && BOOKS[e].p;
	});
	byId("finish").disabled = !_done;
	 */
});

/// --- END --- ///
// Disconnect from the server
SOCKET.on("disconnect", (data) => {
	// Determine which disconnect has occurred and display relevant error
	switch (data) {
		case "io server disconnect":
			alert("Kicked from server!");
			window.location.reload(true);
			break;
		case "ping timeout":
			alert("Timed out from server.");
			window.location.reload(true);
			break;
		case "transport close":
			alert("Lost connection to server.");
			break;
		case "server full":
			alert("Server full! Can't connect.");
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
		if (id === ID) {
			return name;
		} else {
			return USERS[id].name;
		}
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
		navigator.clipboard.writeText(text);
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
	byId("pageCount").value =
		byId("pageCountDisplay").textContent =
		byId("statusPageMax").textContent =
			ROOM.settings.pageCount;

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

	// Add self to player list
	let nameElem = document.createElement("li");
	nameElem.textContent = name;
	nameElem.id = "you";
	nameElem.title = "you!";
	_playerList.appendChild(nameElem);

	// Add other players to player list
	for (let id in USERS) {
		let nameElem = document.createElement("li");
		nameElem.textContent = getName(id);
		_playerList.appendChild(nameElem);
	}

	// Increment player count
	byId("playersCount").textContent = "(" + (Object.keys(USERS).length + 1).toString() + "/10)";

	// Show/hide start button/minimum player warning depending on player count
	if (Object.keys(USERS).length) {
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
			_bookDL.id = "d" + _id;
			_bookDL.disabled = true;

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

			// Enable/disable timer
			if (+ROOM.settings.timeWrite) {
				show("statusTimer");
			}

			// Reset writing inputs
			byId("inputWrite").disabled = false;
			byId("inputWrite").value = "";
			break;

		case "Draw":
			// Change to drawing mode
			hide("write");
			show("draw");

			// Enable/disable timer
			if (+ROOM.settings.timeDraw) {
				show("statusTimer");
			}

			// Reset drawing inputs
			CANVAS.clear();
			CANVAS.setBackgroundColor("#FFFFFF");
			CANVAS.isDrawingMode = true;
			CANVAS.selection = true;
			DRAW.undo = [];
			byId("toolUndo").disabled = true;
			byId("toolRedo").disabled = true;
			updatePalette();
			resizeCanvas();
			break;
	}

	// Enable submit button
	byId("inputSubmit").disabled = false;
}

// Update color input/palette
function updatePalette() {
	// Change which drawing inputs are available depending on the palette
	switch (ROOM.settings.palette) {
		case "No palette":
		default:
			// No palette, let users select whatever colors they want
			byId("toolColor").disabled = false;
			byId("toolColor").style.display = "block";

			// Keep track of color history
			let _history = byId("colorHistory");
			_history.innerHTML = "";

			for (let i = 0; i < 16; i++) {
				let _elem = document.createElement("input");
				_elem.classList.add("colorSmall");

				if (DRAW.colorHistory[i]) {
					_elem.style.backgroundColor = DRAW.colorHistory[i];
					(function (c) {
						_elem.addEventListener("click", () => {
							changeColor(c);
						});
					})(DRAW.colorHistory[i]);
				} else {
					_elem.disabled = true;
				}
				_history.appendChild(_elem);
			}

			break;
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

		// Create book title
		let _titleTD = document.createElement("td");
		_titleTD.textContent = BOOKS[_id].title;

		// Create button to let the host present
		let _hostTD = document.createElement("td");
		let _hostInput = document.createElement("input");
		_hostInput.value = "Present";
		_hostInput.type = "button";
		_hostInput.addEventListener(
			"click",
			_presentBook.bind(this, {
				book: _id,
				host: true,
				key: SESSION_KEY,
			})
		);
		_hostTD.appendChild(_hostInput);

		// Create button to let the original author present
		let _userTD = document.createElement("td");
		if (ID !== _id) {
			let _userInput = document.createElement("input");
			let _name = getName(_id);
			if (_name.length > 12) {
				_name = _name.substr(0, 12) + "…";
			}
			_userInput.value = "Let " + _name + " present";
			_userInput.type = "button";
			_userInput.addEventListener(
				"click",
				_presentBook.bind(this, {
					book: _id,
					host: false,
					key: SESSION_KEY,
				})
			);
			_userTD.appendChild(_userInput);
		}

		// Append elements to DOM
		_presentTable.appendChild(_tr);
		_tr.appendChild(_titleTD);
		_tr.appendChild(_userTD);
		_tr.appendChild(_hostTD);
	}
}

// Change which color is selected
function changeColor(color) {
	// Update draw color
	let _oldColor = DRAW.color;
	DRAW.color = color;

	// Update everything to use new color
	byId("toolColor").value = color;
	if (DRAW.tool !== TOOL.ERASE) {
		CANVAS.freeDrawingBrush.color = color;
		MOUSE_CURSOR.set({ fill: color });
	}

	// Update history
	DRAW.colorHistory.unshift(_oldColor); // add previous color to history
	DRAW.colorHistory = DRAW.colorHistory.filter((i) => i !== color); // remove new color (if in history)
	DRAW.colorHistory.slice(0, 16); // limit length
	updatePalette();
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
	if (typeof e === "string") {
		e = byId(e);
	}
	e.classList.add("hidden");
	e.hidden = true;
	return e;
}

// Show an element in the DOM
function show(e) {
	if (typeof e === "string") {
		e = byId(e);
	}
	e.classList.remove("hidden");
	e.hidden = false;
	return e;
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
			name = _inputName.value.substr(0, 32);
			ROOM.code = _inputRoom.value.substr(0, 12);

			_inputName.disabled = true;
			_inputRoom.disabled = true;
			e.target.disabled = true;
			show("loading");

			window.history.pushState({ roomCode: ROOM.code }, "", "?room=" + ROOM.code);

			SOCKET.emit("joinRoom", {
				id: ID,
				name: name,
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
		byId("statusTitle").textContent = e.target.value.substr(0, 40);
	});
	byId("inputTitle").addEventListener("change", (e) => {
		let _title = e.target.value.substr(0, 40);
		SOCKET.emit("updateTitle", { title: _title, key: SESSION_KEY });
	});

	// Game: Write textarea resizing
	byId("inputWrite").addEventListener("input", (e) => {
		e.target.style.height = "auto";
		e.target.style.height = e.target.scrollHeight + "px";
	});

	// Game: Submit page
	byId("inputSubmit").addEventListener("click", (e) => {
		let _valid = false;
		switch (ROUND.mode) {
			case "Write":
				// Writing round
				let _inputWrite = byId("inputWrite");
				if (_inputWrite.reportValidity()) {
					_valid = true;

					// Send page to the server
					let _value = _inputWrite.value.substr(0, 140);
					SOCKET.emit("submitPage", {
						mode: ROUND.mode,
						value: _value,
						key: SESSION_KEY,
					});

					// Disable text input
					_inputWrite.disabled = true;
				}
				break;

			case "Draw":
				// Drawing round
				_valid = true;

				// Export canvas to base64 and send to server
				let _value = CANVAS.toDataURL({
					format: "png",
					multiplier: 800 / CANVAS.getWidth(),
				});
				SOCKET.emit("submitPage", {
					mode: ROUND.mode,
					value: _value,
					key: SESSION_KEY,
				});

				// Lock canvas from any further drawing/editing
				CANVAS.isDrawingMode = false;
				CANVAS.selection = false;
				CANVAS.forEachObject(function (object) {
					object.selectable = false;
					object.evented = false;
				});
				break;
		}

		if (_valid) {
			// Put client in waiting state
			e.target.disabled = true;
			byId("inputTitle").disabled = true;
			byId("wait").showModal();
		}
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

		// Draw with so many beautiful colors
		CANVAS.freeDrawingBrush.color = DRAW.color;
		CANVAS.freeDrawingBrush.width = DRAW.width;
		MOUSE_CURSOR.set({ fill: DRAW.color, stroke: "black" });
	});

	// Draw: Erase tool
	byId("toolErase").addEventListener("click", (e) => {
		// Change to erase tool
		DRAW.tool = TOOL.ERASE;
		changeTool(e.target);

		// Erasing is just drawing white
		CANVAS.freeDrawingBrush.color = "#FFFFFF";
		CANVAS.freeDrawingBrush.width = DRAW.width;
		MOUSE_CURSOR.set({ fill: "white", stroke: "grey" });
	});

	// Draw: Fill tool
	byId("toolFill").addEventListener("click", (e) => {
		// Change to fill tool
		DRAW.tool = TOOL.FILL;
		changeTool(e.target);

		// Flood fill tool
		// 1. Get raster image of the canvas
		// 2. Run flood fill algorithm on it
		// 3. Convert newly colored pixels into an image
		// 4. Place image back onto fabric.js canvas
	});

	// Draw: Undo tool
	byId("toolUndo").addEventListener("click", (e) => {
		// Undo last thingy
		if (DRAW.undo.length) {
			// Get last command and undo it
			let _command = DRAW.undo.pop();
			switch (_command.type) {
				case "path:created":
					if (CANVAS.contains(_command.object)) {
						CANVAS.remove(_command.object);
						DRAW.redo.push(_command);
						byId("toolRedo").disabled = false;
					}
					break;

				case "object:modified":
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
					CANVAS.add(_command.object);
					DRAW.undo.push(_command);
					byId("toolUndo").disabled = false;
					break;

				case "object:modified":
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

	/// PRESENT
	// Present: Next page
	byId("inputPresentForward").addEventListener("click", () => {
		if (ID === ROUND.presenter) {
			if (ROUND.page < parseInt(ROOM.settings.pageCount) - 1) {
				SOCKET.emit("presentForward", { key: SESSION_KEY });
			}
		}
	});

	// Present: Previous page
	byId("inputPresentBack").addEventListener("click", () => {
		if (ID === ROUND.presenter) {
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
		if (ID === ROUND.presenter) {
			SOCKET.emit("presentFinish", { key: SESSION_KEY });
		}
	});
}

/// --- CANVAS --- ///
// Canvas drawing
const CANVAS = new fabric.Canvas("c", {
	isDrawingMode: true,
	freeDrawingCursor: "none",
});
CANVAS.setBackgroundColor("#FFFFFF");
CANVAS.freeDrawingBrush.width = DRAW.width;
CANVAS.freeDrawingBrush.color = DRAW.color;

// Add a cursor layer (to show the current brush/tool)
const CURSOR = new fabric.StaticCanvas("cursor");
const MOUSE_CURSOR = new fabric.Circle({
	left: -100,
	top: -100,
	radius: DRAW.width / 2,
	fill: DRAW.color,
	stroke: "black",
	originX: "center",
	originY: "center",
});
CURSOR.add(MOUSE_CURSOR);
CANVAS.on("mouse:move", (obj) => {
	let mouse = obj.absolutePointer;
	MOUSE_CURSOR.set({ top: mouse.y, left: mouse.x }).setCoords().canvas.renderAll();
});
CANVAS.on("mouse:out", () => {
	MOUSE_CURSOR.set({ top: -100, left: -100 }).setCoords().canvas.renderAll();
});

// Resize the drawing canvas
window.addEventListener("resize", resizeCanvas);

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
		_h = (_w * 3) / 4;
	}

	// Resize canvas
	if (_w) {
		let zoom = CANVAS.getZoom() * (_w / CANVAS.getWidth());
		CANVAS.setDimensions({ width: _w, height: _h });
		CANVAS.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		CURSOR.setDimensions({ width: _w, height: _h });
		CURSOR.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
		_base.style.height = _h + "px";
		byId("previousWrite").style.maxWidth = _w + "px"; //"calc(" + _w + "px + 10em)";
	}
}

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

		// Enable undo button
		byId("toolUndo").disabled = false;

		// Clear redo stack
		DRAW.redo = [];
		byId("toolRedo").disabled = true;
	}
}

CANVAS.on("path:created", (obj) => {
	record("path:created", obj.path);
});

CANVAS.on("object:modified", (obj) => {
	record("object:modified", obj);
});
