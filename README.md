# Bikroy Inventory (LAN Edition)

A small self-hosted inventory manager built with Express and SQLite, meant to run on a local machine and be reached by anyone on the same network.

## What it does

This is a straightforward stock-tracking tool: log in, add items with a name and category, search and filter the list, and manage everything from a clean admin page. It's built to run on a single computer (a shop PC, a back-office machine) and be opened from any phone or laptop on the same Wi-Fi — no cloud hosting required.

- Cookie-based login gate in front of the admin and search pages
- Add, edit, delete and bulk-clean inventory items
- CSV import via `csv-parser` for bringing in existing stock lists
- Auto-detects the machine's LAN IP on startup so you know exactly what address to share with the team
- SQLite (`inventory.db`) as the data store — no separate database server to install

## Tech stack

Node.js · Express 5 · SQLite3 · Multer (file uploads) · csv-parser · cookie-parser

## Running it

```bash
npm install
npm start
```

The server starts on port 3000. On boot it prints the LAN address (e.g. `http://192.168.1.42:3000`) so you can open it from any device on the same network.

## Security note

The login is a hardcoded username/password pair meant for trusted local-network use only — this is not built to be exposed to the public internet as-is. If you need to deploy it outside a closed LAN, swap the auth middleware in `server.js` for something with proper hashed credentials first.

## Related

A cloud-deployable variant of this same app (env-based port, image uploads, auto-migrating schema) lives in [`bikroyinventory`](https://github.com/roni2026/bikroyinventory).
