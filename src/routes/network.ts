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
