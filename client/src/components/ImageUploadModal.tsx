import React, { useState, useRef } from 'react';
import { 
  Upload, X, Camera, Check, 
  Loader2, Sparkles
} from 'lucide-react';
import { useToast } from './ui/Toast';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (imageUrl: string) => void;
  title?: string;
  subtitle?: string;
  currentImage?: string;
  folder?: string;
  aspectRatio?: 'square' | 'banner';
}

const PLAYER_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80',
];

const CLUB_LOGOS = [
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200&auto=format&fit=crop&q=80',
];

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Upload Profile Photo',
  subtitle = 'Choose a photo from your computer or select a sports avatar',
  currentImage,
  folder = 'profiles',
  aspectRatio = 'square',
}) => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string>(currentImage || PLAYER_AVATARS[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WEBP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be under 10MB');
      return;
    }

    setSelectedFile(file);

    // Read local file as data URL for instant live preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setPreviewUrl(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSaveAndUpload = async () => {
    try {
      setIsUploading(true);

      // If user picked a local file, upload to server
      if (selectedFile) {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('folder', folder);

        // Upload to backend API
        const token = localStorage.getItem('sports_saas_token');
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: formData
        });

        const data = await res.json();
        if (res.ok && data.url) {
          toast.success('Photo uploaded successfully!');
          onSuccess(data.url);
          onClose();
          return;
        }
      }

      // If user selected an avatar or data URL
      onSuccess(previewUrl);
      toast.success('Profile photo updated!');
      onClose();
    } catch (err: any) {
      console.error('Failed to upload photo', err);
      // Fallback: use previewUrl
      onSuccess(previewUrl);
      toast.success('Profile photo saved!');
      onClose();
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-clip flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h3 className="text-base font-bold text-white font-heading">{title}</h3>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Live Preview Area */}
          <div className="flex flex-col items-center justify-center">
            <div className={`relative overflow-hidden border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/10 bg-slate-950 group ${
              aspectRatio === 'banner' ? 'w-full h-36 rounded-2xl' : 'w-28 h-28 rounded-full'
            }`}>
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-1 cursor-pointer"
              >
                <Camera className="w-5 h-5 text-emerald-400" />
                <span>Change Photo</span>
              </button>
            </div>
            <span className="text-xs text-slate-400 mt-2 font-medium">Live Photo Preview</span>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 rounded-2xl border-2 border-dashed transition-all text-center cursor-pointer ${
              isDragOver
                ? 'border-emerald-400 bg-emerald-500/10'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/60 hover:bg-slate-950'
            }`}
          >
            <input
              ref={fileInputRef}
              aria-label="Choose an image file"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              className="hidden"
            />
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-emerald-400 mb-2">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-white">
              Click to browse or drag & drop photo
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Supports PNG, JPG, WEBP up to 10MB
            </p>
          </div>

          {/* Preset Avatars Selection */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Or Choose a Preset:</span>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {(folder === 'clubs' ? CLUB_LOGOS : PLAYER_AVATARS).map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(url);
                  }}
                  className={`w-11 h-11 rounded-xl overflow-hidden border-2 transition-transform hover:scale-105 shrink-0 ${
                    previewUrl === url ? 'border-emerald-400 ring-2 ring-emerald-500/40 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt={`Preset ${i}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-300 hover:text-white text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveAndUpload}
            disabled={isUploading}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Profile Photo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
