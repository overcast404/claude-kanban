# QR Code Intranet Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a QR code button to the sidebar so mobile devices on the same LAN can scan and access the kanban board.

**Architecture:** Server exposes LAN IPs via a new `/api/network-info` endpoint (using `os.networkInterfaces()`). Frontend fetches this data and renders a QR code via the `qrcode` npm package in a modal, triggered from a sidebar button.

**Tech Stack:** Express (server route), React + `qrcode` npm (client-side QR rendering), os.networkInterfaces (built-in Node)

---

### Task 1: Backend — Network Info API

**Files:**
- Create: `src/routes/network.ts`
- Modify: `src/index.ts:29-29`

- [ ] **Step 1: Create the network route file**

Write `src/routes/network.ts`:

```typescript
import { Router, Request, Response } from 'express';
import os from 'os';

export const networkRouter = Router();

networkRouter.get('/', (_req: Request, res: Response) => {
  const interfaces = os.networkInterfaces();
  const port = _req.socket.localPort || 14567;
  const lanUrls: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        lanUrls.push(`http://${addr.address}:${port}`);
      }
    }
  }

  res.json({ lanUrls, port });
});
```

- [ ] **Step 2: Register the route in src/index.ts**

Add import at line 9 (after `filesystemRouter`):

```typescript
import { networkRouter } from './routes/network';
```

Add route mount at line 33 (after `filesystemRouter`):

```typescript
app.use('/api/network-info', networkRouter);
```

The route uses `req.socket.localPort` to get the port, so no additional setup needed.

- [ ] **Step 3: Verify server compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/network.ts src/index.ts
git commit -m "feat: add /api/network-info endpoint for LAN IP discovery"
```

---

### Task 2: Frontend — QR Code Modal Component

**Files:**
- Create: `client/src/components/QrCodeModal.tsx`
- Modify: `client/src/api.ts`

- [ ] **Step 1: Add API function to api.ts**

Append to `client/src/api.ts`:

```typescript
// Network
export interface NetworkInfo {
  lanUrls: string[];
  port: number;
}
export const fetchNetworkInfo = () => request<NetworkInfo>('/network-info');
```

- [ ] **Step 2: Create QrCodeModal component**

Write `client/src/components/QrCodeModal.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { fetchNetworkInfo, NetworkInfo } from '../api';

interface Props {
  onClose: () => void;
}

export function QrCodeModal({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchNetworkInfo()
      .then(data => setInfo(data))
      .catch(err => setError(err.message));
  }, []);

  const selectedUrl = info?.lanUrls[selectedIndex] ?? '';

  useEffect(() => {
    if (selectedUrl && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, selectedUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#3d2b1f', light: '#faf7f2' },
      });
    }
  }, [selectedUrl]);

  const copyUrl = () => {
    navigator.clipboard.writeText(selectedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-warm-card rounded-xl p-6 shadow-xl border border-warm-border max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-warm-brown">手机扫码连接</h2>
          <button onClick={onClose} className="text-warm-text-secondary hover:text-warm-brown text-xl leading-none">&times;</button>
        </div>

        {error ? (
          <p className="text-warm-danger text-sm">无法获取局域网信息: {error}</p>
        ) : !info ? (
          <p className="text-warm-text-secondary text-sm">正在检测网络...</p>
        ) : info.lanUrls.length === 0 ? (
          <p className="text-warm-text-secondary text-sm">未检测到局域网连接</p>
        ) : (
          <>
            {info.lanUrls.length > 1 && (
              <select
                value={selectedIndex}
                onChange={e => setSelectedIndex(Number(e.target.value))}
                className="w-full mb-3 px-3 py-1.5 text-sm border border-warm-border rounded-lg bg-warm-bg text-warm-brown focus:outline-none"
              >
                {info.lanUrls.map((url, i) => (
                  <option key={url} value={i}>{url}</option>
                ))}
              </select>
            )}
            <div className="flex justify-center mb-3">
              <canvas ref={canvasRef} className="rounded-lg" />
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={selectedUrl}
                className="flex-1 px-3 py-1.5 text-xs border border-warm-border rounded-lg bg-warm-bg text-warm-brown truncate"
              />
              <button
                onClick={copyUrl}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-warm-brown text-white hover:opacity-90 whitespace-nowrap"
              >
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/QrCodeModal.tsx client/src/api.ts
git commit -m "feat: add QR code modal component"
```

---

### Task 3: Frontend — Add QR Button to Sidebar

**Files:**
- Modify: `client/src/components/Sidebar.tsx`

- [ ] **Step 1: Modify Sidebar to include QR button and embed the modal**

Replace the entire content of `client/src/components/Sidebar.tsx`:

```typescript
import { useState } from 'react';
import { NavItem } from './NavItem';
import { QrCodeModal } from './QrCodeModal';
import { STATUS_ICON, STATUS_LABEL, STATUS_ORDER } from '../status';
import type { TaskStatus } from '../../../src/types';

interface Props {
  activeTab: 'projects' | TaskStatus;
  counts: Record<string, number>;
  onSelectTab: (tab: 'projects' | TaskStatus) => void;
}

export function Sidebar({ activeTab, counts, onSelectTab }: Props) {
  const [showQr, setShowQr] = useState(false);

  return (
    <>
      <aside className="w-14 flex-shrink-0 flex flex-col items-center gap-1 py-3 border-r border-warm-border bg-warm-card">
        {STATUS_ORDER.map(status => (
          <NavItem
            key={status}
            icon={STATUS_ICON[status]}
            label={STATUS_LABEL[status]}
            count={counts[status]}
            dangerBadge={status === 'deciding'}
            active={activeTab === status}
            onClick={() => onSelectTab(status)}
          />
        ))}
        <div className="mt-auto">
          <NavItem
            icon="📁"
            label="项目"
            active={activeTab === 'projects'}
            onClick={() => onSelectTab('projects')}
          />
          <NavItem
            icon="📱"
            label="扫码"
            active={false}
            onClick={() => setShowQr(true)}
          />
        </div>
      </aside>
      {showQr && <QrCodeModal onClose={() => setShowQr(false)} />}
    </>
  );
}
```

- [ ] **Step 2: Verify client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Sidebar.tsx
git commit -m "feat: add QR code button to sidebar"
```

---

### Task 4: Install Dependency & Integration Test

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install qrcode package**

Run: `npm install qrcode`
Expected: qrcode added to dependencies in package.json.

No `@types/qrcode` needed — the library ships its own TypeScript declarations.

- [ ] **Step 2: Full build verification**

Run: `npm run build`
Expected: tsc compiles src/ to dist/, vite builds client/ to dist/public/. No errors.

- [ ] **Step 3: Manual smoke test plan**

Start the dev server: `npm run dev`
- Server should print `http://localhost:14567`
- Open browser to the page
- Click the 📱 "扫码" button at sidebar bottom
- Modal should appear with QR code
- If on LAN, the URL should show the LAN IP (e.g., `http://192.168.x.x:14567`)
- "复制" button should copy the URL to clipboard
- Close button / overlay click should dismiss modal
- If multiple LAN IPs, dropdown should switch between them

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add qrcode dependency"
```
