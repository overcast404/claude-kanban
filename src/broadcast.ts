import { WsMessage } from './types';

let _broadcast: ((msg: WsMessage) => void) | null = null;

export function setBroadcast(fn: (msg: WsMessage) => void): void {
  _broadcast = fn;
}

export function broadcast(msg: WsMessage): void {
  _broadcast?.(msg);
}
