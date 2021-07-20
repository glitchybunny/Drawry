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
var connected = true;
var name = undefined;
var room = undefined;

// Ensure browser compatibility
if (!('getContext' in document.createElement('canvas'))) {
    let message = 'Sorry, it looks like your browser does not support canvas! This game depends on canvas to be playable.';
    alert(message);
    console.error(message);
}


///// ----- ASYNC FUNCTIONS ----- /////
// Establish connection
SOCKET.on('connect', () => {
    console.log("Established connection to the server");
    console.log("ID is " + ID);
    connected = true;
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
    initSetup();

    // add self and already connected players to players list
    let nameElem = document.createElement('li');
    nameElem.innerText = name;
    nameElem.style.fontWeight = "bold";
    document.getElementById('playerList').appendChild(nameElem);

    for (let id in USERS) {
        let nameElem = document.createElement('li');
        nameElem.innerText = USERS[id].name;
        nameElem.id = id;
        document.getElementById('playerList').appendChild(nameElem);
    }

    // Increment player count
    document.getElementById('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
})

// Alert client to another user joining the room
SOCKET.on('userJoin', (data) => {
    // Add user data
    console.log(data.name, "has joined the room");
    USERS[data.id] = {
        name: data.name
    }

    let playerList = document.getElementById('playerList');
    if (playerList !== undefined && playerList !== null) {
        // Add to player list
        let nameElem = document.createElement('li');
        nameElem.innerText = htmlDecode(data.name);
        nameElem.id = data.id;
        playerList.appendChild(nameElem);

        // Increment player count
        document.getElementById('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
    }
});

// Alert client to another user leaving the room
SOCKET.on('userLeave', (userID) => {
    // Remove from player list
    document.getElementById(userID).remove();

    // Clear user data
    if (USERS[userID] !== undefined) {
        console.log(USERS[userID].name, "has disconnected");
        delete USERS[userID];
    } else {
        console.log(userID, "has disconnected");
    }

    // Decrease player count
    document.getElementById('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
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
let inputSubmit = document.getElementById('inputSubmit');
inputSubmit.addEventListener('click', () => {
    // Receive and validate inputs
    let nameInput = document.getElementById('nameInput');
    let roomInput = document.getElementById('roomInput');

    if (nameInput.reportValidity() && roomInput.reportValidity()) {
        name = nameInput.value.substr(0, 32);
        room = roomInput.value.substr(0, 8);

        nameInput.disabled = true;
        roomInput.disabled = true;
        inputSubmit.disabled = true;
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
setInputFilter(document.getElementById("roomInput"), function (value) {
    return /^[a-zA-Z0-9_-]*$/i.test(value);
});

// Decode names to html
function htmlDecode(input) {
    let doc = new DOMParser().parseFromString(input, "text/html");
    return doc.documentElement.textContent;
}


// Game setup functions
function initSetup() {
    let pageCount = document.getElementById('pageCount');
    pageCount.addEventListener('input', () => {
        document.getElementById('pageCountDisplay').value = pageCount.value;
    });

    let timeWrite = document.getElementById('timeWrite');
    timeWrite.addEventListener('input', () => {
        let timeWriteDisplay = document.getElementById('timeWriteDisplay');
        if (timeWrite.value == 0) {
            timeWriteDisplay.value = "none";
        } else {
            timeWriteDisplay.value = timeWrite.value + " min";
        }
    });

    let timeDraw = document.getElementById('timeDraw');
    timeDraw.addEventListener('input', () => {
        let timeDrawDisplay = document.getElementById('timeDrawDisplay');
        if (timeDraw.value == 0) {
            timeDrawDisplay.value = "none";
        } else {
            timeDrawDisplay.value = timeDraw.value + " min";
        }
    });
}
