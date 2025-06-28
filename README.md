# Fisqos Server

This project contains the backend and frontend assets for a WebSocket-based chat application with voice capabilities using mediasoup.

## Prerequisites

- **Node.js** 20 or later
- **MongoDB** running instance
- `.env` file at the project root defining:
  - `MONGODB_URI` – MongoDB connection string
  - `PORT` – (optional) server port, defaults to `3000`
  - `CORS_ORIGIN` – (optional) allowed origin for cross-origin HTTP requests.
    Leave blank to permit all origins.
  - `ANNOUNCED_IP` – (optional) public IP for mediasoup
  - `TURN_USERNAME` and `TURN_CREDENTIAL` – credentials for the bundled TURN
    servers. If omitted the TURN servers are skipped and only a public STUN
    server is used.
  - `SOCKET_URL` – (optional) base URL for the Socket.IO server. Defaults to
    `window.location.origin` if omitted.
  - `JWT_SECRET` – secret key used for signing JSON Web Tokens. **Must** be set
    to a strong value.

Example `.env`:

```bash
MONGODB_URI=mongodb://localhost:27017/test
PORT=3000
CORS_ORIGIN=
ANNOUNCED_IP=
TURN_USERNAME=
TURN_CREDENTIAL=
SOCKET_URL=
JWT_SECRET=S3cureJWTs3cretKey_Sh0uldBeLong!
```
    
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
   This script runs `npm ci` and `npm --prefix frontend ci` to fetch
   backend and frontend Node packages, including the `socket.io-client`
   dependency used by the React Socket provider. It is also executed in CI before
   running the tests.
2. Copy `.env.example` to `.env` and update the values.
3. Build the bundled client files by running:
    ```bash
   npm run build
   ```
   This invokes Webpack and generates both `public/libs/mediasoup-client.min.js`
   and `public/bundle.js`. The application will not start correctly without
   these files present. Because the generated files under `public/*.js` and the
   `public/libs/` directory are ignored in Git, make sure to run this command
   after cloning the repository so they are recreated.
4. Build the React front-end:
    ```bash
   npm run build:react
   ```
   This compiles the Vite project under `frontend/` and copies the resulting
   `frontend/dist/app.js` bundle into the `public/` directory as
   `public/app.js` using a Node-based copy command.
   The React application uses a `SocketProvider` component which creates the
   Socket.IO client with `socket.io-client` and assigns it to `window.socket` so
   the scripts under `public/` can reuse the same connection.
5. Start the application:
```bash
npm start
```
Alternatively run the server under PM2:

```bash
pm2 start ecosystem.config.js
```
The application now uses an in-memory store only, so simply run `npm start`.

## Testing

A minimal `.env` file with sample values is included for running the test suite. The `npm test` command checks for `.env` and falls back to `.env.example` when calling Node with `--env-file`. Install the dependencies and execute the test suite with:

```bash
./setup.sh     # installs backend and frontend Node packages
npm test       # installs frontend test deps and runs all tests
```

## Login flow

Clients may connect to the Socket.IO server without providing a token. In this
case `socket.user` will be `null` and only public events can be used. When a
valid JWT is supplied either in the `auth` object or `Authorization` header,
`socket.user` contains the decoded payload. Invalid tokens still cause an
`auth_error` during the handshake.

After connecting, call the `login` event to obtain a token or send
`set-username` to register the username on the server. Authenticated events
verify that a user is known through `socket.user` or the stored username before
processing.

### Front-end Modules

The client-side code under `public/js` is organized into small ES modules:

- **auth.js** – login and registration helpers
- **webrtc.js** – creation of mediasoup transports and SFU handling
- **socketEvents.js** – registration of all Socket.IO events
- **audioUtils.js** – volume analysis and audio state utilities
- **uiEvents.js** – sets up DOM event listeners

### Module Style

The Node.js backend uses the CommonJS module system with `require` and
`module.exports`. Browser code in `public/js` is written as ES modules and is
loaded using `<script type="module">`.

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

## Troubleshooting

An empty rooms list usually indicates that the `groups` collection is empty or
that `MONGODB_URI` in your `.env` file does not point to a valid MongoDB
instance. Verify that your database contains the expected data and that the
connection string is correct.

Use the MongoDB shell to list your existing groups and channels:

```javascript
db.groups.find().pretty()
db.channels.find().pretty()
```

If API calls return `401 Unauthorized`, ensure your requests include the JWT token
from a successful login using the `Authorization: Bearer <token>` header. The
front-end saves this token in `localStorage` after logging in.
