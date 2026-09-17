import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, Share2, Copy, Check, QrCode } from 'lucide-react';

interface Props {
  tournamentName: string;
  url: string;
  fileSlug?: string;
  onClose: () => void;
}

/** Shareable QR card for a public registration link: share as image, download PNG, or copy the link. */
export function RegistrationQrModal({ tournamentName, url, fileSlug, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const fileName = `${fileSlug || 'tournament'}-registration-qr.png`;
  const shareText = `🏆 Register your team for ${tournamentName}! Scan the QR or open: ${url}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: 'M' })
      .then(setDataUrl)
      .catch(() => setDataUrl(''));
  }, [url]);

  const handleShare = async () => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: tournamentName, text: shareText });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: tournamentName, text: shareText, url });
        return;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>Registration QR</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <div className="rounded-2xl bg-white p-3">
            {dataUrl ? (
              <img src={dataUrl} alt={`Registration QR for ${tournamentName}`} className="w-full h-auto block" />
            ) : (
              <div className="aspect-square" />
            )}
          </div>
          <p className="text-center text-sm font-bold text-white">{tournamentName}</p>
          <p className="text-center text-[11px] font-mono text-slate-400 break-all">{url}</p>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!dataUrl}
              onClick={handleShare}
              className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
            <a
              href={dataUrl || undefined}
              download={fileName}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save</span>
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Link'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
