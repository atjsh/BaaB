import React, { useRef, useState } from 'react';

import { chat } from '@baab/shared';

interface ChatInputProps {
  onSend: (content: string, contentType: chat.ChatMessageContentType) => void;
  disabled?: boolean;
  quotaExceeded?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled = false, quotaExceeded = false }) => {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim(), chat.ChatMessageContentType.TEXT_PLAIN);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || disabled) return;

    setIsUploading(true);

    try {
      // Convert to WebP and resize if needed
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (event) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Max dimensions
          const maxWidth = 1024;
          const maxHeight = 1024;

          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to WebP base64
          const webpDataUrl = canvas.toDataURL('image/webp', 0.8);
          onSend(webpDataUrl, chat.ChatMessageContentType.WEBP_IMAGE);
          setIsUploading(false);
        };

        img.src = event.target?.result as string;
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to process image:', error);
      setIsUploading(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="border-t p-3 md:p-4 bg-white">
      {quotaExceeded && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 md:p-3 mb-3 text-xs md:text-sm text-red-700">
          <strong>Storage limit reached!</strong> Delete some messages to continue sending.
        </div>
      )}

      {disabled && !quotaExceeded && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 md:p-3 mb-3 text-xs md:text-sm text-yellow-700">
          Cannot send messages. Please wait for connection or check the conversation status.
        </div>
      )}

      <div className="flex gap-2 items-end">
        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send image"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

        {/* Text input */}
        <div className="flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={disabled ? 'Cannot send messages...' : 'Type a message...'}
            className="w-full border rounded-lg px-3 md:px-4 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed text-base min-h-[44px] max-h-[120px]"
            rows={1}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="bg-blue-500 text-white px-3 md:px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          {isUploading ? (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};
