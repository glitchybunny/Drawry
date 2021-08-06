/*
    picturephone
    client.js
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
const BOOKS = {};

/// --- VARIABLES --- ///
var name = undefined;
var room = undefined;
var roomSettings = undefined;
var round = undefined;
var host = undefined;
var isHost = false;

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
/// --- LOBBY --- ///
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
    byId('roomCode').textContent = room;
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

// Update which user is the host
SOCKET.on('userHost', (userID) => {
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


/// --- GAME --- ///
// Start the game
SOCKET.on('startGame', (data) => {
    // Update DOM
    hide(byId('setupSection'));
    hide(byId('inviteSection'));
    show(byId('gameSection'));
    show(byId('bookSection'));

    // Set round info
    round = {
        number: 0,
        book: ID,
        type: data.start
    };

    // Load book page information
    for (let _id in data.books) {
        BOOKS[_id] = {
            title: (_id === ID ? name : USERS[_id].name) + "'s book",
            author: _id === ID ? name : USERS[_id].name,
            book: data.books[_id]
        }
    }
    updateBookList();

    // Load start page
    switch (data.start) {
        case("Write"):
            show(byId('gameWrite'));
            byId('pageType').textContent = "Writing";
            break;
        case("Draw"):
            show(byId('gameDraw'));
            byId('pageType').textContent = "Drawing";
            resizeCanvas();
            break;
    }
    byId('pageCurrent').textContent = (round.number + 1).toString();
});

// Update book title
SOCKET.on('bookTitle', (data) => {
    BOOKS[data.id].title = htmlDecode(data.title);
    updateBookList();
});

// Get page info
SOCKET.on('page', (data) => {
    // Update local book variables
    BOOKS[data.id].book[data.page] = {value: data.value, author: data.author};
});

// Go to next page in books
SOCKET.on('nextPage', () => {
    // Update DOM
    document.body.style.cursor = '';
    byId('inputPageSubmit').disabled = false;
    hide(byId('gameTitle'));
    show(byId('gamePrevious'));

    // Increment page number
    round.number += 1;
    byId('pageCurrent').textContent = (round.number + 1).toString();

    // Figure out book and previous page
    for (let _id in BOOKS) {
        if (BOOKS[_id].book[round.number] === ID) {
            round.book = _id;
        }
    }
    let _previousPage = BOOKS[round.book].book[round.number - 1];
    byId('gamePreviousTitle').textContent = BOOKS[round.book].title;

    // Change drawing <=> writing mode
    if (round.type === "Write") {
        // Change to drawing mode
        round.type = "Draw";
        byId('pageType').textContent = "Drawing";
        show(byId('gameDraw'));
        hide(byId('gameWrite'));

        // Show previous page
        byId('previousWrite').textContent = htmlDecode(_previousPage.value);
        show(byId('previousWrite'));
        hide(byId('previousDraw'));

        // Reset and clear inputs
        resizeCanvas();
        CANVAS.clear();
        CANVAS.setBackgroundColor('#FFFFFF');
        CANVAS.isDrawingMode = true;
        CANVAS.selection = true;

    } else if (round.type === "Draw") {
        // Change to writing mode
        round.type = "Write";
        byId('pageType').textContent = "Writing";
        byId('writePrompt').textContent = "What happens next?";
        show(byId('gameWrite'));
        hide(byId('gameDraw'));

        // Show previous page
        byId('previousDrawImg').src = _previousPage.value ? _previousPage.value : "img/placeholder.png"; /* decoded image here */
        show(byId('previousDraw'));
        hide(byId('previousWrite'));

        // Reset and clear inputs
        byId('inputWrite').disabled = false;
        byId('inputWrite').value = "";
    }

    // Update book list info
    updateBookList();

    // Set timer

    // Done?
});


/// --- PRESENTING --- ///
// Start presenting mode
SOCKET.on('startPresenting', () => {
    // Update DOM
    document.body.style.cursor = '';
    hide(byId('gameSection'));
    show(byId('presentSection'));

    // Update round state
    round = {number: undefined, book: undefined, type: "Presenting"}

    // Add books to DOM for presenting
    updateBookList();
    updatePresentList();
});


/// --- END --- ///
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
    if (input) {
        let _doc = new DOMParser().parseFromString(input, "text/html");
        return _doc.documentElement.textContent;
    } else {
        return "";
    }
}


/// --- UPDATE DOM --- ///
// Update settings
function updateSettings() {
    // First page
    document.querySelectorAll('input[name=firstPage]').forEach((elem) => {
        elem.checked = (elem.value === roomSettings.firstPage);
    });
    byId('firstPageDisplay').value = roomSettings.firstPage;

    // Pages per book
    byId('pageCount').value = roomSettings.pageCount;
    byId('pageCountDisplay').value = roomSettings.pageCount;
    byId('pageMax').textContent = roomSettings.pageCount;

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
    document.querySelectorAll('.hostName').forEach((elem) => {
        elem.textContent = host;
    })

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
    nameElem.textContent = name;
    nameElem.title = "You!";
    _playerList.appendChild(nameElem);

    // Add other players to player list
    for (let id in USERS) {
        let nameElem = document.createElement('li');
        nameElem.textContent = USERS[id].name;
        _playerList.appendChild(nameElem);
    }

    // Increment player count
    byId('playerCount').textContent = (Object.keys(USERS).length + 1).toString();

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
    let _bookList, _id, _book, _bookTitle, _bookAuthor;
    _bookList = byId('bookList');
    _bookList.innerHTML = '';

    // Update the list of books
    for (_id in BOOKS) {
        // Create elements
        _book = document.createElement('li');
        _bookTitle = document.createElement('span');
        _bookAuthor = document.createElement('span');

        // Assign the correct classes for styling
        _bookTitle.className = "bookTitle";
        _bookAuthor.className = "bookAuthor";

        // Display who's working on the current page of the book
        if (round.type === "Presenting") {
            _bookTitle.textContent = BOOKS[_id].title;
            _bookAuthor.textContent = "by\u00a0" + BOOKS[_id].author;
        } else {
            let _num, _page, _authorID, _author;
            _num = (round.number + 1).toString();
            _page = BOOKS[_id].book[round.number];
            _authorID = _page.author ?? _page;
            _author = (_authorID === ID) ? name : USERS[_authorID].name;
            _bookTitle.textContent = BOOKS[_id].title;
            _bookAuthor.textContent = "Pg\u00a0" + _num + "\u00a0-\u00a0" + _author;
        }

        // Add to DOM
        _book.appendChild(_bookTitle);
        _book.appendChild(_bookAuthor);
        _bookList.appendChild(_book);
    }
}

// Update presenting buttons for host
function updatePresentList() {
    let _presentList, _id, _li, _title, _div, _inputHost, _inputUser;
    _presentList = byId('presentList');
    _presentList.innerHTML = '';

    // Update list of books
    for (_id in BOOKS) {
        // Create elements
        _li = document.createElement('li');
        _title = document.createElement('span');
        _div = document.createElement('div');
        _inputHost = document.createElement('input');
        if (_id !== ID) {
            _inputUser = document.createElement('input');
        }

        // Fill in appropriate information
        _div.id = _id;
        _title.textContent = BOOKS[_id].title;
        _inputHost.value = "Present";
        _inputHost.type = "button";
        if (_id !== ID) {
            _inputUser.value = "Let " + USERS[_id].name.substr(0, 12) + (USERS[_id].name.length > 12 ? "…" : "") + " present";
            _inputUser.type = "button";
        }

        // Add to DOM
        _li.appendChild(_title);
        _li.appendChild(_div);
        _div.appendChild(_inputHost);
        if (_id !== ID) {
            _div.appendChild(_inputUser)
        }
        _presentList.appendChild(_li);
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


/// --- CONFIGURE INPUTS --- ///
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
                room: room,
                key: SESSION_KEY
            });
        }
    });

    // Setup: Send settings to the server
    function emitSettings() {
        isHost ? SOCKET.emit("settings", {settings: roomSettings, key: SESSION_KEY}) : SOCKET.disconnect();
        updateSettings();
    }

    // Setup: First page
    document.querySelectorAll('input[name=firstPage]').forEach((elem) => {
        elem.addEventListener('input', (e) => {
            if (roomSettings) {
                roomSettings.firstPage = e.target.value;
                emitSettings();
            }
        })
    });

    // Setup: Pages per book
    let _pageCount = byId('pageCount');
    _pageCount.addEventListener('input', (e) => {
        byId('pageCountDisplay').textContent = e.target.value;
    });
    _pageCount.addEventListener('change', (e) => {
        if (roomSettings) {
            roomSettings.pageCount = e.target.value;
            emitSettings();
        }
    });

    // Setup: Page assignment
    document.querySelectorAll('input[name=pageOrder]').forEach((elem) => {
        elem.addEventListener('input', (e) => {
            if (roomSettings) {
                roomSettings.pageOrder = e.target.value;
                emitSettings();
            }
        });
    });

    // Setup: Colour palette
    byId('colourPalette').addEventListener('input', (e) => {
        if (roomSettings) {
            roomSettings.palette = e.target.value;
            emitSettings();
        }
    });

    // Setup: Write time limit
    let _timeWrite = byId('timeWrite');
    _timeWrite.addEventListener('input', (e) => {
        byId('timeWriteDisplay').value = parseInt(e.target.value) ? e.target.value + " min" : "None";
    });
    _timeWrite.addEventListener('change', (e) => {
        if (roomSettings) {
            roomSettings.timeWrite = e.target.value;
            emitSettings();
        }
    });

    // Setup: Draw time limit
    let _timeDraw = byId('timeDraw');
    _timeDraw.addEventListener('input', (e) => {
        byId('timeDrawDisplay').value = parseInt(e.target.value) ? e.target.value + " min" : "None";
    });
    _timeDraw.addEventListener('change', (e) => {
        if (roomSettings) {
            roomSettings.timeDraw = e.target.value;
            emitSettings();
        }
    });

    // Setup: Start game button
    byId('inputStart').addEventListener('click', () => {
        if (roomSettings) {
            SOCKET.emit('startGame', {settings: roomSettings, key: SESSION_KEY});
        }
    })

    // Game: Let player change their title
    byId('inputTitle').addEventListener('change', (e) => {
        let _title = e.target.value.substr(0, 40);
        SOCKET.emit('updateBookTitle', {title: _title, key: SESSION_KEY});
        BOOKS[ID].title = _title;
        updateBookList();
    })

    // Game: Submit page
    byId('inputPageSubmit').addEventListener('click', (e) => {
        // Get write input if it's a writing round
        if (round.type === "Write") {
            let _inputWrite = byId('inputWrite');
            if (_inputWrite.reportValidity()) {
                // Send page to the server
                let _value = _inputWrite.value.substr(0, 80);
                SOCKET.emit('submitPage', {type: round.type, value: _value, key: SESSION_KEY});

                // Put client in waiting state
                e.target.disabled = true;
                document.body.style.cursor = 'wait';
                _inputWrite.disabled = true;
            }
        }

        // Get draw input if it's a drawing round
        else if (round.type === "Draw") {
            // Export canvas data to base64
            let _value = CANVAS.toDataURL({
                format: 'png',
                multiplier: (800 / CANVAS.getWidth())
            });

            // Send page to the server
            SOCKET.emit('submitPage', {type: round.type, value: _value, key: SESSION_KEY});

            // Put client in waiting state
            e.target.disabled = true;
            document.body.style.cursor = 'wait';

            // Lock canvas from any further drawing/editing
            CANVAS.isDrawingMode = false;
            CANVAS.selection = false;
            CANVAS.forEachObject(function (object) {
                object.selectable = false;
                object.evented = false;
            });
        }
    });
}

/// --- CANVAS --- ///
// Canvas drawing
const CANVAS = new fabric.Canvas('c', {
    isDrawingMode: true
});
CANVAS.setBackgroundColor('#FFFFFF');
CANVAS.freeDrawingBrush.width = 4;

// Resize the drawing canvas
function resizeCanvas() {
    let _base = byId('canvasBase');
    let _w = _base.scrollWidth, _h = _base.scrollHeight;

    if (_w && _h) {
        let zoom = CANVAS.getZoom() * (_w / CANVAS.getWidth());
        CANVAS.setDimensions({width: _w, height: _h});
        CANVAS.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
    }
}

window.addEventListener('resize', resizeCanvas);