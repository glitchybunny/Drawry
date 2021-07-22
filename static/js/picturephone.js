/*
    picturephone.js
    a multiplayer art experiment by Riley Taylor (rtay.io)
*/

/// --- SOCKET CONSTANTS --- ///
let array = new Uint32Array(1);
window.crypto.getRandomValues(array);
const ID = array[0].valueOf() + 1;
const SOCKET = io.connect(document.documentURI);
const USERS = {};

/// --- VARIABLES --- ///
var name = undefined;
var room = undefined;
var roomSettings = {};
var host = undefined;
var isHost = false;

// Ensure browser compatibility
if (!('getContext' in document.createElement('canvas'))) {
    let message = 'Sorry, it looks like your browser does not support canvas! This game depends on canvas to be playable.';
    alert(message);
    console.error(message);
}
var byId = function( id ) { return document.getElementById( id ); };


///// ----- ASYNC FUNCTIONS ----- /////
// Establish connection
SOCKET.on('connect', () => {
    console.log("Established connection to the server");
    console.log("ID is " + ID);
});

// Let client know they've joined the room successfully
SOCKET.on('joined', async (data) => {
    console.log("Joined room '" + data.room + "'");
    document.body.style.cursor = '';

    // set cookies so game remembers room for session (in case user accidentally closes tab and needs to rejoin)

    // clear join UI and replace it with game UI
    let main = document.querySelector('main');
    main.innerHTML = '';
    main.className = 'game';
    await updateUI(main, '/game.html');

    // setup game settings
    initSettings();

    // add self and already connected players to players list
    let nameElem = document.createElement('li');
    nameElem.innerText = name;
    nameElem.title = "You!";
    byId('playerList').appendChild(nameElem);

    for (let id in USERS) {
        let nameElem = document.createElement('li');
        nameElem.innerText = USERS[id].name;
        nameElem.id = id;
        byId('playerList').appendChild(nameElem);
    }

    // Increment player count
    byId('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
})

// Alert client to another user joining the room
SOCKET.on('userJoin', (data) => {
    // Add user data
    console.log(data.name, "joined");
    USERS[data.id] = {
        name: htmlDecode(data.name)
    }

    let playerList = byId('playerList');
    if (playerList !== undefined && playerList !== null) {
        // Add to player list
        let nameElem = document.createElement('li');
        nameElem.innerText = htmlDecode(data.name);
        nameElem.id = data.id;
        playerList.appendChild(nameElem);

        // Increment player count
        byId('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
    }
});

// Alert client to another user leaving the room
SOCKET.on('userLeave', (userID) => {
    // Remove from player list
    byId(userID).remove();

    // Clear user data
    if (USERS[userID] !== undefined) {
        console.log(USERS[userID].name, "disconnected");
        delete USERS[userID];
    } else {
        console.log(userID, "disconnected");
    }

    // Decrease player count
    byId('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
});

// Alert client to host assignment
SOCKET.on('userHost', (userID) => {
    // Update host
    if (userID === ID) {
        host = name;
        isHost = true;
        console.log("You are the host");
    } else {
        host = USERS[userID].name;
        isHost = false;
        console.log(host, "is the host");
    }
    updateHostInfo();
});

// If client is disconnected unexpectedly (i.e. booted from server or server connection lost)
SOCKET.on('disconnect', (data) => {
    // Determine which disconnect has occurred and display relevant error
    switch (data) {
        case("io server disconnect"):
            alert("Kicked from server!");
            break;
        case("ping timeout"):
            alert("Timed out from server.");
            break;
        case("transport close"):
            alert("Lost connection to server.");
            break;
        case("server full"):
            alert("Server full! Can't connect.");
            break;
        default:
            alert("Disconnected due to an unknown error.\nPlease reconnect.");
    }
});


// Update UI (load from other HTML file instead of having code inline in js - it's just cleaner ok)
async function updateUI(e, url) {
    document.body.style.cursor = "wait";

    let response = await fetch(url).catch(function (err) {
        console.warn('Something went wrong', err);
        alert("Failed to connect to server");
    });
    e.innerHTML = await response.text();

    document.body.style.cursor = "";
    return 1;
}


///// ----- SYNCHRONOUS FUNCTIONS ----- /////
// Join button
let _inputSubmit = byId('inputSubmit');
_inputSubmit.addEventListener('click', () => {
    // Receive and validate inputs
    let _nameInput = byId('nameInput');
    let _roomInput = byId('roomInput');

    if (_nameInput.reportValidity() && _roomInput.reportValidity()) {
        name = _nameInput.value.substr(0, 32);
        room = _roomInput.value.substr(0, 8);

        _nameInput.disabled = true;
        _roomInput.disabled = true;
        _inputSubmit.disabled = true;
        document.body.style.cursor = 'wait';

        SOCKET.emit("joinRoom", {
            id: ID,
            name: name,
            room: room
        });
    }
});


// Restrict inputs for a textbox to the given inputFilter.
// If you're reading this, I'm aware you can bypass the restrictions - there's serverside checks too, ya bozo
function setInputFilter(textbox, inputFilter) {
    ["input", "keydown", "keyup", "mousedown", "mouseup", "select", "contextmenu", "drop"].forEach(function (event) {
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

// Install input filters.
setInputFilter(byId("roomInput"), function (value) {
    return /^[a-zA-Z0-9_-]*$/i.test(value);
});

// Decode names to html
function htmlDecode(input) {
    let doc = new DOMParser().parseFromString(input, "text/html");
    return doc.documentElement.textContent;
}


// Game settings
function initSettings() {
    // Whether the first page is a writing (text) or drawing page
    for (let _elem of document.querySelectorAll('input[name=firstPage]')) {
        _elem.addEventListener('input', (e) => {
            roomSettings.firstPage = e.target.value;
            updateSettings();
        });
    }
    roomSettings.firstPage = document.querySelector('input[name=firstPage]:checked').value;

    // How many pages are in each book
    let _pageCount = byId('pageCount');
    _pageCount.addEventListener('input', (e) => {
        byId('pageCountDisplay').innerText = e.target.value;
    });
    _pageCount.addEventListener('change', (e) => {
        roomSettings.pageCount = e.target.value;
        updateSettings();
    });
    roomSettings.pageCount = _pageCount.value;

    // How pages are assigned to players
    for (let _elem of document.querySelectorAll('input[name=pageOrder]')) {
        _elem.addEventListener('input', (e) => {
            roomSettings.pageOrder = e.target.value;
            updateSettings();
        });
    }
    roomSettings.pageOrder = document.querySelector('input[name=pageOrder]:checked').value;

    // Whether there are colour pallete restrictions for the storybook
    let _colourPalette = byId('colourPalette')
    _colourPalette.addEventListener('input', (e) => {
        roomSettings.palette = e.target.value;
        updateSettings();
    })
    roomSettings.palette = _colourPalette.value;

    // Time limit per writing page (in minutes)
    let _timeWrite = byId('timeWrite');
    _timeWrite.addEventListener('input', (e) => {
        byId('timeWriteDisplay').value = parseInt(e.target.value) ? e.target.value + " min" : "None";
    });
    _timeWrite.addEventListener('change', (e) => {
        roomSettings.timeWrite = e.target.value;
        updateSettings();
    })
    roomSettings.timeWrite = _timeWrite.value;

    // Time limit per drawing page (in minutes)
    let _timeDraw = byId('timeDraw');
    _timeDraw.addEventListener('input', (e) => {
        byId('timeDrawDisplay').value = parseInt(e.target.value) ? e.target.value + " min" : "None";
    });
    _timeDraw.addEventListener('change', (e) => {
        roomSettings.timeDraw = e.target.value;
        updateSettings();
    })
    roomSettings.timeDraw = _timeDraw.value;

    // Update host information
    updateHostInfo();
}

// Update host information on the page
function updateHostInfo() {
    let _elem;

    // Update the host name
    _elem = byId('hostName');
    if (_elem !== undefined && _elem !== null) {
        _elem.innerText = host;
    }
    _elem = byId('host');
    if (_elem !== undefined && _elem !== null) {
        _elem.title = "Host: " + host;
    }

    // Allow editing if the client is the host, otherwise only show the settings
    _elem = byId('gameSection');
    if (_elem !== undefined && _elem !== null) {
        _elem.style.minWidth = isHost ? "500px" : "400px";
    }
    for (_elem of document.querySelectorAll('.isHost')) {
        if (isHost) {
            _elem.classList.remove('hidden');
        } else {
            _elem.classList.add('hidden');
        }
    }
    for (_elem of document.querySelectorAll('.isNotHost')) {
        if (isHost) {
            _elem.classList.add('hidden');
        } else {
            _elem.classList.remove('hidden');
        }
    }
}

// Update settings values
function updateSettings() {
    if (isHost) {
        SOCKET.emit("updateSettings", roomSettings);
    } else {
        console.error("Non-host user attempting to update settings somehow. Self destructing in 3... 2... 1...");
    }
}