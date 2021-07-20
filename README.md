### ***Notice: This project is still very early in development, and as such, there is no playable version yet.***

---

# open-picturephone

Alternate drawing pictures and adding captions to make funny stories with your friends.

Inspired by drawception, brokenpicturephone, and a plethora of other games in this genre.

:art:

### Running your own server
For reference, app.js is the node server, and /static/js/picturephone.js is the main javascript module loaded by the client when they connect.

**How to run locally:**
1. Make sure you have npm and nodejs installed - they're required for this.
2. Clone the repo and navigate to the cloned directory.
3. Run `npm install` to download all the dependencies.
4. Run `node app.js` to test the server locally.
5. Connect to the server by going to `localhost` or `127.0.0.1` in your browser.

**How to run on heroku:**
1. Create new heroku instance and connect it to the repo.
2. Under settings, add the `heroku/nodejs` buildpack.
3. Add a new entry to the Config Vars in the settings. Set KEY to `NODE_ENV` and VALUE to `production node index.js`.
4. Under resources, you'll want to create a new web dyno. A free/hobby dyno should run this fine.
5. Run the dyno with the instructions `npm start`.
