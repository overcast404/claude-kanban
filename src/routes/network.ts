import { Router, Request, Response } from 'express';
import os from 'os';

export const networkRouter = Router();

networkRouter.get('/', (req: Request, res: Response) => {
  const interfaces = os.networkInterfaces();
  const port = req.socket.localPort || 14567;
  const lanUrls: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    if (/^(docker|vbox|vmnet|Hyper-V)/i.test(name)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        lanUrls.push(`http://${addr.address}:${port}`);
      }
    }
  }

  res.json({ lanUrls, port });
});
