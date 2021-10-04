# drawry

Take turns drawing pictures and writing captions to make fun stories with your friends.

Inspired by drawception, brokenpicturephone, and a plethora of other games in this genre.

:art:

---

### Running your own server
For reference, server.js is the node server, and /static/js/client.js is the main javascript module for the client.

**How to run locally:**
1. Make sure you have npm and nodejs installed - they're required for this.
2. Clone the repo and navigate to the cloned directory.
3. Run `npm install` to download all the dependencies.
4. Run `node server.js` to test the server locally.
5. Connect to the server by going to `localhost` or `127.0.0.1` in your browser.

**How to run on heroku:**
1. Fork this repo
2. Create new heroku instance and connect it to your forked repo.
3. Heroku should automatically detect and choose a buildpack. If not, add the `heroku/nodejs` buildpack in the settings.
4. Start the dyno and you should be good to go :)

---

### Environment Variables

**PORT**
- Changes which port the server runs on
- Default: 80

**RATE_LIMIT**
- Defines the max amount of resource requests from an IP address per minute.
- Default: 50

**VERBOSE**
- Enables verbose logging in the server console
- Default: false
