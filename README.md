# Fisqos Server

This project contains the backend and frontend assets for a WebSocket-based chat application with voice capabilities using mediasoup.

## Prerequisites

- **Node.js** 18 or later
- **MongoDB** running instance
- `.env` file at the project root defining:
  - `MONGODB_URI` – MongoDB connection string
  - `PORT` – (optional) server port, defaults to `3000`
  - `ANNOUNCED_IP` – (optional) public IP for mediasoup
  - `TURN_USERNAME` and `TURN_CREDENTIAL` – (optional) credentials for TURN servers

## Folder Structure

```
models/             Mongoose schemas for users, groups, channels and messages
modules/            Socket.IO event handlers (e.g. text channel events)
public/             Static client files (HTML, JS, CSS, bundled libs)
utils/              Utility helpers such as the logger
server.js           Main Express + Socket.IO server
sfu.js              mediasoup based SFU helper
webpack.config.js   Bundles mediasoup-client into `public/libs`
```

### Modules
- **models/** – Defines MongoDB models like `User`, `Group`, `Channel`, `Message` and `DMMessage`.
- **modules/** – Currently contains `textChannel.js` which registers text channel related events on a Socket.IO socket.
- **utils/** – Includes `logger.js` used across the server for logging via Winston.
- **public/** – Holds the web client, including `index.html`, front‑end scripts under `public/js`, styles and bundled libraries.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the mediasoup client bundle (creates `public/libs/mediasoup-client.min.js`):
   ```bash
   npx webpack
   ```
3. Start the application:
 ```bash
 npm start
```
The server will connect to MongoDB using the URL in `MONGODB_URI` and listen on the port specified by `PORT` (default `3000`).

### Front-end Modules

The client-side code under `public/js` is organized into small ES modules:

- **auth.js** – login and registration helpers
- **webrtc.js** – creation of mediasoup transports and SFU handling
- **socketEvents.js** – registration of all Socket.IO events
- **audioUtils.js** – volume analysis and audio state utilities
- **uiEvents.js** – sets up DOM event listeners

### Migration Note

Older versions stored DM messages with fields named `sender` and `receiver`.
The schema now expects `from` and `to`. Convert existing documents with:

```javascript
db.dmmessages.updateMany({}, { $rename: { sender: "from", receiver: "to" } })
```

If your existing `users` collection contains a `blocked` array field, rename it to `blockedUsers` to match the current schema:

```javascript
db.users.updateMany({}, { $rename: { blocked: "blockedUsers" } })
```
```
Happy coding!