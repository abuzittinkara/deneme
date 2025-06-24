# Fisqos Server

This project contains the backend and frontend assets for a WebSocket-based chat application with voice capabilities using mediasoup.

## Prerequisites

- **Node.js** 18 or later
- **MongoDB** running instance
- `.env` file at the project root defining:
  - `MONGODB_URI` – MongoDB connection string
  - `PORT` – (optional) server port, defaults to `3000`
  - `ANNOUNCED_IP` – (optional) public IP for mediasoup
  - `TURN_USERNAME` and `TURN_CREDENTIAL` – credentials for the bundled TURN
    servers. If omitted the TURN servers are skipped and only a public STUN
    server is used.
  - `SOCKET_URL` – (optional) base URL for the Socket.IO server. Defaults to
    `window.location.origin` if omitted.
    
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

1. Install dependencies using the setup script:
   ```bash
   ./setup.sh
   ```
   This script runs `npm ci` to fetch Node packages and is
   also executed in CI before running the tests.
2. Copy `.env.example` to `.env` and update the values.
3. Build the mediasoup client bundle (creates `public/libs/mediasoup-client.min.js`):
    ```bash
    npx webpack
    ```
4. Start the application:
```bash
npm start
```
The application now uses an in-memory store only, so simply run `npm start`.

Before running the tests, install the Node packages:

```bash
./setup.sh     # installs required Node packages
npm test
```

### Front-end Modules

The client-side code under `public/js` is organized into small ES modules:

- **auth.js** – login and registration helpers
- **webrtc.js** – creation of mediasoup transports and SFU handling
- **socketEvents.js** – registration of all Socket.IO events
- **audioUtils.js** – volume analysis and audio state utilities
- **uiEvents.js** – sets up DOM event listeners

### Channel Management

Right-click a channel name in the rooms list to rename or delete it. Selecting
"Kanalın İsmini Değiştir" will immediately update the name for all users, while
"Kanalı Sil" removes the channel from the group.
You can mention other members in a text channel by typing `@` followed by their
username. A dropdown will appear for quick selection.

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

If upgrading from versions prior to attachment support, initialize the new
`attachments` field on existing messages:

```javascript
db.messages.updateMany({ attachments: { $exists: false } }, { $set: { attachments: [] } })
db.dmmessages.updateMany({ attachments: { $exists: false } }, { $set: { attachments: [] } })
```
The `messages` schema also now stores file metadata in this `attachments` array
with objects of the form `{ id, url, type }`. Existing deployments should
ensure these arrays are present for all documents as shown above before running
the updated server.
An `Attachment` sub-schema is defined in `models/Attachment.js` and shared by
both message models.
Messages may now consist solely of attachments without any text content.
Happy coding!

## API

### `POST /api/message`

Send a text message with optional file attachments.

**Body fields**

- `username` – sender's username (or `userId` for legacy clients)
- `channelId` – target channel id
- `content` – plain text message (optional if files are included)
- `files` – one or more files (multipart form data)

Constraints:
- max **10** files per request
- each file up to **25&nbsp;MB**
- combined size up to **100&nbsp;MB**

On success the server responds with the saved message and broadcasts a
`newTextMessage` event to the channel.

## Service Worker

The front‑end registers `public/sw.js` which caches any `/uploads/` assets
referenced in new messages. When the client receives a message containing
attachments it posts those URLs to the worker so they can be fetched and stored
locally. Subsequent requests for the same files are served from the cache when
available.
