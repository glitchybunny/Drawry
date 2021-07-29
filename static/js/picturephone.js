/*
    picturephone
    picturephone.js
    a multiplayer art experiment by Riley Taylor (rtay.io)
*/
"use strict";

/// --- SOCKET CONSTANTS --- ///
let array = new Uint32Array(3);
window.crypto.getRandomValues(array);
const ID = Cookies.get('id') | 0 ? Cookies.get('id') : (array[0].valueOf() + 1).toString();
const SESSION_KEY = array[1].valueOf().toString(16) + array[2].valueOf().toString(16); // currently unused
const SOCKET = io.connect(document.documentURI);
const USERS = {};

/// --- VARIABLES --- ///
var name = undefined;
var room = undefined;
var roomSettings = undefined;
var host = undefined;
var isHost = false;
var books = undefined;
var round = undefined;

// Ensure browser compatibility
if (!('getContext' in document.createElement('canvas'))) {
    let message = 'Sorry, it looks like your browser does not support canvas! This game depends on canvas to be playable.';
    console.error(message);
    alert(message);
}
var byId = function (id) {
    return document.getElementById(id);
};
Cookies.defaults = {
    expires: 600,
    sameSite: 'Strict'
};


///// ----- ASYNC FUNCTIONS ----- /////
// Establish connection
SOCKET.on('connect', () => {
    console.log("Established connection to the server");
    console.log("ID is " + ID);
});

// Let client know they've joined the room successfully
SOCKET.on('joined', (data) => {
    console.log("Joined room '" + data.room + "'");
    document.body.style.cursor = '';

    // update local game values
    room = data.room;
    roomSettings = data.settings;
    data.users.forEach((o) => {
        USERS[o.id] = {name: htmlDecode(o.name)}
    })
    isHost = (data.host === ID);
    host = isHost ? name : USERS[data.host].name;

    // switch to game screen
    hide(byId('mainJoin'));
    show(byId('mainGame'));

    // update DOM
    updatePlayerList();
    updateHost();
    updateSettings();

    // set cookies so game remembers the session (in case user accidentally closes tab and needs to rejoin)
    Cookies.set('name', name);
    Cookies.set('room', room);
    Cookies.set('id', ID);
})

// Add another user to the room
SOCKET.on('userJoin', (data) => {
    // Add user data
    console.log(data.name, "joined");
    USERS[data.id] = {name: htmlDecode(data.name)};
    updatePlayerList();
});

// Remove user from room
SOCKET.on('userLeave', (userID) => {
    // Clear user data
    console.log(USERS[userID].name, "disconnected");
    delete USERS[userID];
    updatePlayerList();
});

// Update host assignment
SOCKET.on('host', (userID) => {
    isHost = (userID === ID);
    host = isHost ? name : USERS[userID].name;
    updateHost();
});

// Update settings
SOCKET.on('settings', (data) => {
    // Update the settings on the client to reflect the new settings
    roomSettings = data;
    updateSettings();
})

// Start the game
SOCKET.on('gameStart', (data) => {
    hide(byId('setupSection'));
    show(byId('gameSection'));

    // Load book page information
    books = {};
    Object.keys(data.books).forEach((id) => {
        books[id] = {
            title: (id === ID ? name : USERS[id].name) + "'s book",
            author: id === ID ? name : USERS[id].name,
            book: data.books[id]
        }
    });
    updateBookList();

    // Load start page
    switch (data.start) {
        case("Write"):
            show(byId('gameWrite'));
            byId('pageType').innerText = "Writing";
            break;
        case("Draw"):
            show(byId('gameDraw'));
            byId('pageType').innerText = "Drawing";
            break;
    }
    byId('pageCurrent').innerText = 1;

    // Set round number
    round = 0;
});

// Disconnect from the server
SOCKET.on('disconnect', (data) => {
    // Determine which disconnect has occurred and display relevant error
    switch (data) {
        case("io server disconnect"):
            alert("Kicked from server!");
            window.location.reload(true);
            break;
        case("ping timeout"):
            alert("Timed out from server.");
            window.location.reload(true);
            break;
        case("transport close"):
            //alert("Lost connection to server.");
            break;
        case("server full"):
            alert("Server full! Can't connect.");
            break;
        default:
            alert("Disconnected due to an unknown error.\nPlease reconnect.");
            window.location.reload(true);
    }
});

/// GAME EVENTS ///
SOCKET.on('bookTitle', (data) => {
    let _title = htmlDecode(data.title);

    // update title
    books[data.id].title = _title;
    updateBookList();
});


///// ----- SYNCHRONOUS FUNCTIONS ----- /////
// Restrict inputs with a filter function
function setInputFilter(textbox, inputFilter) {
    ["input", "keydown", "keyup", "mousedown", "mouseup", "select", "contextmenu", "drop"].forEach((event) => {
        textbox.addEventListener(event, function () {
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
    });
}

setInputFilter(byId("inputRoom"), function (value) {
    return /^[a-zA-Z0-9_-]*$/i.test(value);
});

// Decode strings to html
function htmlDecode(input) {
    let _doc = new DOMParser().parseFromString(input, "text/html");
    return _doc.documentElement.textContent;
}

// Send settings to the server
function emitSettings() {
    isHost ? SOCKET.emit("settings", {settings: roomSettings}) : SOCKET.disconnect();
}

// Update settings in the DOM
function updateSettings() {
    // First page
    document.querySelectorAll('input[name=firstPage]').forEach((elem) => {
        elem.checked = (elem.value === roomSettings.firstPage);
    });
    byId('firstPageDisplay').value = roomSettings.firstPage;

    // Pages per book
    byId('pageCount').value = roomSettings.pageCount;
    byId('pageCountDisplay').value = roomSettings.pageCount;
    byId('pageMax').innerText = roomSettings.pageCount;

    // Page assignment
    document.querySelectorAll('input[name=pageOrder]').forEach((elem) => {
        elem.checked = (elem.value === roomSettings.pageOrder);
    });
    byId('pageOrderDisplay').value = roomSettings.pageOrder;

    // Color palette
    document.querySelector('#colourPalette [value="' + roomSettings.palette + '"]').selected = true;
    byId('colourPaletteDisplay').value = roomSettings.palette;

    // Write time limit
    byId('timeWrite').value = roomSettings.timeWrite;
    byId('timeWriteDisplay').value = parseInt(roomSettings.timeWrite) ? roomSettings.timeWrite + " min" : 'None';

    // Draw time limit
    byId('timeDraw').value = roomSettings.timeDraw;
    byId('timeDrawDisplay').value = parseInt(roomSettings.timeDraw) ? roomSettings.timeDraw + " min" : 'None';
}

// Update host information on the page
function updateHost() {
    // Update the host name in the DOM
    let _hostName = byId('hostName');
    _hostName.title = _hostName.innerText = "Host: " + host;

    // Allow the client to edit settings if they're the host
    byId('setupSection').style.minWidth = isHost ? "500px" : "400px";
    document.querySelectorAll('.isHost').forEach((elem) => {
        isHost ? show(elem) : hide(elem);
    });
    document.querySelectorAll('.isNotHost').forEach((elem) => {
        isHost ? hide(elem) : show(elem);
    });
}

// Update player list on the page
function updatePlayerList() {
    let _playerList = byId('playerList');
    _playerList.innerHTML = '';

    // Add self to player list
    let nameElem = document.createElement('li');
    nameElem.innerText = name;
    nameElem.title = "You!";
    _playerList.appendChild(nameElem);

    // Add other players to player list
    for (let id in USERS) {
        let nameElem = document.createElement('li');
        nameElem.innerText = USERS[id].name;
        _playerList.appendChild(nameElem);
    }

    // Increment player count
    byId('playerCount').innerText = (Object.keys(USERS).length + 1).toString();

    // Show/hide start button/minimum player warning depending on player count
    if (Object.keys(USERS).length) {
        show(byId('inputStart'));
        hide(byId('inputStartWarning'));
    } else {
        hide(byId('inputStart'));
        show(byId('inputStartWarning'));
    }
}

// Update book list on the page
function updateBookList() {
    let _bookList = byId('bookList');
    _bookList.innerHTML = '';

    // Update the list of books
    for (let _id in books) {
        // Create elements
        let _book = document.createElement('li');
        let _bookTitle = document.createElement('span');
        let _bookAuthor = document.createElement('span');

        // Change their values
        _bookTitle.innerText = books[_id].title;
        _bookTitle.className = "bookTitle";
        _bookAuthor.innerText = "by " + books[_id].author;
        _bookAuthor.className = "bookAuthor";

        // Add to DOM
        _book.appendChild(_bookTitle);
        _book.appendChild(_bookAuthor);
        _bookList.appendChild(_book);
    }
}

// Hide an element in the DOM
function hide(e) {
    e.classList.add("hidden");
    e.hidden = true;
}

// Show an element in the DOM
function show(e) {
    e.classList.remove("hidden");
    e.hidden = false;
}


///// ----- INPUTS AND INTERACTIONS ----- /////
{
    // Prefill name field with cookie
    if (Cookies.get('name')) {
        byId('inputName').value = Cookies.get('name');
    }

    // Prefill room ID field with URL parameters
    let _url = window.location.href;
    let _params = new URLSearchParams(_url.slice(_url.indexOf('?') + 1));
    if (_params.has("room")) {
        byId('inputRoom').value = _params.get("room").replace(/[^a-zA-Z0-9-_]/g, '').substr(0, 8);
    }

    // Join button
    byId('inputJoin').addEventListener('click', (e) => {
        // Receive and validate inputs
        let _inputName = byId('inputName');
        let _inputRoom = byId('inputRoom');

        if (_inputName.reportValidity() && _inputRoom.reportValidity()) {
            name = _inputName.value.substr(0, 32);
            room = _inputRoom.value.substr(0, 8);

            _inputName.disabled = true;
            _inputRoom.disabled = true;
            e.target.disabled = true;
            document.body.style.cursor = 'wait';

            window.history.pushState({room: room}, '', '?room=' + room);

            SOCKET.emit("joinRoom", {
                id: ID,
                name: name,
                room: room
            });
        }
    });

    // Setup: First page
    document.querySelectorAll('input[name=firstPage]').forEach((elem) => {
        elem.addEventListener('input', (e) => {
            roomSettings.firstPage = e.target.value;
            emitSettings();
        })
    });

    // Setup: Pages per book
    let _pageCount = byId('pageCount');
    _pageCount.addEventListener('input', (e) => {
        byId('pageCountDisplay').innerText = e.target.value;
    });
    _pageCount.addEventListener('change', (e) => {
        roomSettings.pageCount = e.target.value;
        emitSettings();
    });

    // Setup: Page assignment
    document.querySelectorAll('input[name=pageOrder]').forEach((elem) => {
        elem.addEventListener('input', (e) => {
            roomSettings.pageOrder = e.target.value;
            emitSettings();
        });
    });

    // Setup: Colour palette
    byId('colourPalette').addEventListener('input', (e) => {
        roomSettings.palette = e.target.value;
        emitSettings();
    });

    // Setup: Write time limit
    let _timeWrite = byId('timeWrite');
    _timeWrite.addEventListener('input', (e) => {
        byId('timeWriteDisplay').value = parseInt(e.target.value) ? e.target.value + " min" : "None";
    });
    _timeWrite.addEventListener('change', (e) => {
        roomSettings.timeWrite = e.target.value;
        emitSettings();
    });

    // Setup: Draw time limit
    let _timeDraw = byId('timeDraw');
    _timeDraw.addEventListener('input', (e) => {
        byId('timeDrawDisplay').value = parseInt(e.target.value) ? e.target.value + " min" : "None";
    });
    _timeDraw.addEventListener('change', (e) => {
        roomSettings.timeDraw = e.target.value;
        emitSettings();
    });

    // Setup: Start game button
    byId('inputStart').addEventListener('click', () => {
        SOCKET.emit('startGame', {settings: roomSettings});
    })

    // Game: Let player change their title
    byId('inputTitle').addEventListener('change', (e) => {
        SOCKET.emit('updateBookTitle', e.target.value);
        books[ID].title = e.target.value;
        updateBookList();
    })
}
