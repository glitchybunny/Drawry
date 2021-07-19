/*
    picturephone.js
    a multiplayer art experiment by Riley Taylor (rtay.io)
*/

/// --- SOCKET CONSTANTS --- ///
let array = new Uint32Array(1); window.crypto.getRandomValues(array);
const ID = array[0].valueOf()+1;
const SOCKET = io.connect(document.documentURI);
const USERS = {};

/// --- VARIABLES --- ///
var connected = true;
var name = undefined;
var room = undefined;

// Ensure browser compatibility
if (!('getContext' in document.createElement('canvas'))) {
    let message = 'Sorry, it looks like your browser does not support canvas! This game depends on canvas to be playable.';
    alert(message); console.error(message);
}


///// ----- ASYNC FUNCTIONS ----- /////
// Establish connection
SOCKET.on('connect', () => {
    console.log("Established connection to the server");
    console.log("ID is " + ID);
    connected = true;
});

// Let client know they've joined the room successfully
SOCKET.on('joined', (data) => {
    console.log("Joined room '" + data.room + "'");
    document.body.style.cursor = '';

    // set cookies so game remembers room for session (in case user accidentally closes tab and needs to rejoin)

    // clear join UI and replace it with game UI
    let main = document.querySelector('main');
    main.innerHTML = '<section id="playerSection">\n' +
        '        <h1>Players <span style="float:right">(<span id="playerCount">1</span>/10)</span></h1>\n' +
        '        <ul id="playerList"></ul>\n' +
        '    </section>\n' +
        '    <section>\n' +
        '        <h1>Game Setup</h1>\n' +
        '    </section>\n' +
        '    <section>\n' +
        '        <h1>Books</h1>\n' +
        '    </section>';
    main.className = 'game';

    // add self to players list
    let nameElem = document.createElement('li');
    nameElem.innerText = name;
    nameElem.style.fontWeight = "bold";
    document.getElementById('playerList').appendChild(nameElem);
})

// Alert client to another user joining the room
SOCKET.on('userJoin', (data) => {
    // Add user data
    console.log(data.name, "has joined the room");
    USERS[data.id] = {
        name: data.name
    }

    // Add to player list
    let nameElem = document.createElement('li');
    nameElem.innerText = htmlDecode(data.name);
    nameElem.id = data.id;
    document.getElementById('playerList').appendChild(nameElem);

    // Increase player count
    document.getElementById('playerCount').innerText = (Object.keys(USERS).length + 1).toString();
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
    switch(data) {
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



///// ----- SYNCHRONOUS FUNCTIONS ----- /////
// Join button
let inputSubmit = document.getElementById('inputSubmit');
inputSubmit.addEventListener('click', () => {
    // Receive and validate inputs
    let nameInput = document.getElementById('nameInput');
    let roomInput = document.getElementById('roomInput');

    if (nameInput.reportValidity() && roomInput.reportValidity()) {
        name = nameInput.value.substr(0, 32);
        room = roomInput.value.substr(0, 16);

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