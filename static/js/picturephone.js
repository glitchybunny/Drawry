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
var roomSettings = undefined;
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

    // update local game values
    room = data.room;
    roomSettings = data.settings;
    data.users.forEach((o) => {
        USERS[o.id] = {name: htmlDecode(o.name)}
    })
    isHost = (data.host === ID);
    host = isHost ? name : USERS[data.host].name;

    // remove join UI and replace it with game UI
    let main = document.querySelector('main');
    main.innerHTML = '';
    main.className = 'game';
    await downloadUI(main, '/game.html');

    // setup game
    initSettings();
    updateSettings();
    updateHost();
    updatePlayerList();

    // set cookies so game remembers the session (in case user accidentally closes tab and needs to rejoin)
    // TODO
})

// Add another user to the room
SOCKET.on('userJoin', (data) => {
    // Add user data
    console.log(data.name, "joined");
    USERS[data.id] = {name: htmlDecode(data.name)};
    updatePlayerList();
});

// Alert client to another user leaving the room
SOCKET.on('userLeave', (userID) => {
    // Remove from player list
    byId(userID).remove();

    // Clear user data
    console.log(USERS[userID].name, "disconnected");
    delete USERS[userID];

    // Decrease player count
    byId('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
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
    window.location.reload(true);
});


// Update UI (load from other HTML file instead of having code inline in js - it's just cleaner ok)
async function downloadUI(e, url) {
    document.body.style.cursor = "wait";

    let _response = await fetch(url).catch(function (err) {
        console.warn('Something went wrong', err);
        alert("Failed to connect to server");
    });
    e.innerHTML = await _response.text();

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

// Install input filters.
setInputFilter(byId("roomInput"), function (value) {
    return /^[a-zA-Z0-9_-]*$/i.test(value);
});

// Decode names to html
function htmlDecode(input) {
    let _doc = new DOMParser().parseFromString(input, "text/html");
    return _doc.documentElement.textContent;
}


// Game settings
function initSettings() {
    // First page
    document.querySelectorAll('input[name=firstPage]').forEach((elem) => {
        elem.addEventListener('input', (e) => {
            roomSettings.firstPage = e.target.value;
            emitSettings();
        })
    });

    // Pages per book
    let _pageCount = byId('pageCount');
    _pageCount.addEventListener('input', (e) => {
        byId('pageCountDisplay').innerText = e.target.value;
    });
    _pageCount.addEventListener('change', (e) => {
        roomSettings.pageCount = e.target.value;
        emitSettings();
    });

    // Page assignment
    document.querySelectorAll('input[name=pageOrder]').forEach((elem) => {
        elem.addEventListener('input', (e) => {
            roomSettings.pageOrder = e.target.value;
            emitSettings();
        });
    });

    // Colour palette
    byId('colourPalette').addEventListener('input', (e) => {
        roomSettings.palette = e.target.value;
        emitSettings();
    });

    // Write time limit
    let _timeWrite = byId('timeWrite');
    _timeWrite.addEventListener('input', (e) => {
        byId('timeWriteDisplay').value = parseInt(e.target.value) ? e.target.value + " min" : "None";
    });
    _timeWrite.addEventListener('change', (e) => {
        roomSettings.timeWrite = e.target.value;
        emitSettings();
    });

    // Draw time limit
    let _timeDraw = byId('timeDraw');
    _timeDraw.addEventListener('input', (e) => {
        byId('timeDrawDisplay').value = parseInt(e.target.value) ? e.target.value + " min" : "None";
    });
    _timeDraw.addEventListener('change', (e) => {
        roomSettings.timeDraw = e.target.value;
        emitSettings();
    });

    // Send settings to the server
    function emitSettings() {
        isHost ? SOCKET.emit("settings", roomSettings) : SOCKET.disconnect();
    }
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
    if (_hostName) {
        _hostName.innerText = "Host: " + host;
        _hostName.title = _hostName.innerText;
    }

    // Allow the client to edit settings if they're the host
    let _gameSection = byId('gameSection');
    if (_gameSection) {
        _gameSection.style.minWidth = isHost ? "500px" : "400px";
    }

    document.querySelectorAll('.isHost').forEach((elem) => {
        isHost ? elem.classList.remove('hidden') : elem.classList.add('hidden');
    });

    document.querySelectorAll('.isNotHost').forEach((elem) => {
        isHost ? elem.classList.add('hidden') : elem.classList.remove('hidden');
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
        nameElem.id = id;
        _playerList.appendChild(nameElem);
    }

    // Increment player count
    byId('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
}