'use client';
import { useState } from 'react';

/* eslint-disable @next/next/no-img-element -- generated QR pixels, not a Next-optimizable asset. */

export default function SupplierQrThumbnail({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const identifier = encodeURIComponent(code);
  const src = `/api/qr/${identifier}?format=png`;
  return <>
    <button type="button" className="lot-hero-qr" onClick={() => setOpen(true)} aria-label={`Phóng to mã QR nhà cung cấp ${code}`}>
      <img src={src} alt={`Mã QR nhà cung cấp ${code}`} />
      <span className="lot-hero-qr-label">Xem mã QR</span>
    </button>
    {open && <div className="lot-qr-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="lot-qr-modal" onClick={event => event.stopPropagation()}>
        <button type="button" className="lot-qr-modal-close" onClick={() => setOpen(false)} aria-label="Đóng">×</button>
        <img src={src} alt={`Mã QR nhà cung cấp ${code}`} />
        <p>Mã NCC {code}</p>
        <div className="lot-qr-modal-actions">
          <a className="lot-qr-print-link" href={`/api/qr/${identifier}?format=png&download=1`} download>⬇ Tải xuống</a>
        </div>
      </div>
    </div>}
  </>;
}
