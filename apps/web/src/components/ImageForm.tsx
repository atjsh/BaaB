import React, { useEffect, useState, useRef } from 'react';
import { blobToWebP } from 'webp-converter-browser';

type Props = {
  setImageAsset: (dataUrl: string) => void;
};

export const ImageForm: React.FC<Props> = ({ setImageAsset }) => {
  const [imageDraft, setImageDraft] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (imageDraft) {
      setImageAsset(imageDraft);
    }
  }, [imageDraft, setImageAsset]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const originalDim = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.src = URL.createObjectURL(file);
    });

    const maxWidth = 1000;
    const maxHeight = 1000;
    let targetWidth = originalDim.width;
    let targetHeight = originalDim.height;

    if (originalDim.width > maxWidth || originalDim.height > maxHeight) {
      const widthRatio = maxWidth / originalDim.width;
      const heightRatio = maxHeight / originalDim.height;
      const minRatio = Math.min(widthRatio, heightRatio);
      targetWidth = Math.floor(originalDim.width * minRatio);
      targetHeight = Math.floor(originalDim.height * minRatio);
    }

    setDimensions({ width: targetWidth, height: targetHeight });

    const webpBlob = await blobToWebP(file, { quality: 0.5, width: targetWidth, height: targetHeight });
    const reader = new FileReader();
    reader.onloadend = () => setImageDraft(reader.result as string);
    reader.readAsDataURL(webpBlob);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label htmlFor="imageUpload" className="font-bold text-sm">
          Upload Image
        </label>
      </div>

      <label
        htmlFor="imageUpload"
        className="border-2 border-dashed border-gray-300 rounded-lg p-24 text-sm text-gray-600 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition"
      >
        <div className="flex flex-col items-center gap-2">
          <span className="font-semibold">Click to choose or drag an image</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          id="imageUpload"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </label>

      {imageDraft && (
        <div className="flex gap-4 items-start bg-white border rounded-lg p-3 ">
          <img src={imageDraft} alt="Thumbnail Preview" className="w-32 h-32 object-contain rounded" />
          <div className="text-xs text-gray-700 flex flex-col gap-1">
            {fileName && <div className="font-semibold">{fileName}</div>}
            {dimensions && (
              <div className="text-gray-500">
                Output size: {dimensions.width} × {dimensions.height}px
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setImageDraft(null);
              setFileName('');
              setDimensions(null);
              setImageAsset('');
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="ml-auto text-red-500 text-xs underline"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
};
