import encodeQR from 'qr';
import { useEffect, useState } from 'react';

export const QRCode = ({ value }: { value: string }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    const qr = encodeQR(value, 'svg');
    const blob = new Blob([qr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    setDataUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [value]);

  return <img src={dataUrl} alt="QR Code" className=" w-full h-full" />;
};
