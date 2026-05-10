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
