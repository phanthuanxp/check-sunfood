'use client';
import { useState } from 'react';

/* eslint-disable @next/next/no-img-element -- generated QR pixels, not a Next-optimizable asset. */

export default function LotQrThumbnail({ batchCode }: { batchCode: string }) {
  const [open, setOpen] = useState(false);
  const identifier = encodeURIComponent(batchCode);
  const src = `/api/qr/lot/${identifier}?format=png`;
  return <>
    <button type="button" className="lot-hero-qr" onClick={() => setOpen(true)} aria-label={`Phóng to mã QR lô ${batchCode}`}>
      <img src={src} alt={`Mã QR lô ${batchCode}`} />
      <span className="lot-hero-qr-label">Xem mã QR</span>
    </button>
    {open && <div className="lot-qr-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="lot-qr-modal" onClick={event => event.stopPropagation()}>
        <button type="button" className="lot-qr-modal-close" onClick={() => setOpen(false)} aria-label="Đóng">×</button>
        <img src={src} alt={`Mã QR lô ${batchCode}`} />
        <p>Mã lô {batchCode}</p>
        <div className="lot-qr-modal-actions">
          <a className="lot-qr-print-link" href={`/api/qr/lot/${identifier}?format=png&download=1`} download>⬇ Tải xuống</a>
          <a className="lot-qr-print-link" href={`/lot/${identifier}/print`} target="_blank" rel="noreferrer">In mã QR</a>
        </div>
      </div>
    </div>}
  </>;
}
