# QR Code Intranet Access — Design

**Date:** 2026-05-10
**Status:** Approved

## Overview

Add a QR code button to the web UI so mobile devices on the same LAN can scan and access the kanban board directly via intranet.

## Motivation

The server already binds to `0.0.0.0` and is accessible from other devices on the LAN. However:
- The startup log only prints `http://localhost:<port>`
- There is no way for a mobile user to discover the LAN URL
- Manually typing IP:port on a phone is tedious

A QR code on the desktop web UI solves this — phone scans, taps, done.

## Design

### Backend: `GET /api/network-info`

New route that returns LAN IPs and the server port:

- Uses `os.networkInterfaces()` to enumerate all network interfaces
- Filters to IPv4 only, excludes loopback (`127.x.x.x`)
- Returns `{ lanUrls: string[], port: number }` where each `lanUrl` is `http://<ip>:<port>`
- Registered in `src/index.ts` alongside existing route mounts

### Frontend

**New dependency:** `qrcode` (npm) — lightweight, renders QR to `<canvas>` client-side.

**New component: `QrCodeModal.tsx`**

- Fetches `GET /api/network-info` on mount
- Renders QR code via `QRCode.toCanvas()` into a `<canvas>` element
- Shows the LAN URL as text below the QR code
- "Copy URL" button that writes the URL to clipboard
- If multiple LAN IPs exist (e.g., WiFi + Ethernet), shows a `<select>` dropdown to switch
- Closes via overlay click or close button
- Graceful states: loading spinner while fetching, error message if API fails

**Modified component: `Sidebar.tsx`**

- A QR icon button added at the bottom of the sidebar (below existing nav items)
- Click opens `QrCodeModal`

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/routes/network.ts` | New | `/api/network-info` endpoint |
| `src/index.ts` | Edit | Register network route |
| `client/src/components/QrCodeModal.tsx` | New | QR code modal component |
| `client/src/components/Sidebar.tsx` | Edit | Add QR button at bottom |
| `package.json` | Edit | Add `qrcode` dependency |

### Edge Cases

- **No LAN IP:** If the machine has no LAN connection (only loopback), the API returns empty `lanUrls`. The modal shows a message: "No LAN connection detected" instead of a QR code.
- **Multiple LAN IPs:** Dropdown selector in the modal lets the user pick which IP to encode. Default to the first one.
- **Firewall blocking:** The QR code encodes what the OS reports — if a firewall blocks the port, the phone simply won't connect. No code handles this (it's a network admin concern).

### Non-Goals

- Mobile responsive layout (deferred)
- QR code in terminal output
- Custom QR styling/colors/logos
