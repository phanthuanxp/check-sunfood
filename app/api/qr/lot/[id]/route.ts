import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { findBatchByLotIdentifier } from '@/lib/trace-publish';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identifier = decodeURIComponent((await params).id);
  const batch = await findBatchByLotIdentifier(identifier);
  if (!batch || (!batch.isPublic && !batch.everPublished)) return NextResponse.json({ error: 'Lot QR not issued' }, { status: 404 });
  // Always encode the short, human-readable code — even when this endpoint was reached via the
  // older opaque publicId — so every newly generated/downloaded QR uses the shorter canonical URL.
  const target = `${(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3010').replace(/\/$/, '')}/lot/${encodeURIComponent(batch.code)}`;
  const query = new URL(request.url).searchParams;
  const format = query.get('format') === 'svg' ? 'svg' : 'png';
  const disposition = query.get('download') === '1' ? 'attachment' : 'inline';
  if (format === 'svg') {
    const svg = await QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'H', margin: 2, width: 1024 });
    return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `${disposition}; filename="SUNFOOD-LOT-${batch.code}.svg"`, 'X-QR-Target': target } });
  }
  const png = await QRCode.toBuffer(target, { type: 'png', errorCorrectionLevel: 'H', margin: 2, width: 1024 });
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `${disposition}; filename="SUNFOOD-LOT-${batch.code}.png"`, 'X-QR-Target': target } });
}
