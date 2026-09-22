import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const publicId = (await params).id;
  if (!/^c[a-z0-9]{20,40}$/.test(publicId)) return NextResponse.json({ error: 'Invalid lot' }, { status: 400 });
  const batch = await prisma.batch.findUnique({ where: { publicId }, include: { product: { include: { supplier: true } } } });
  if (!batch || (!batch.isPublic && !batch.everPublished)) return NextResponse.json({ error: 'Lot QR not issued' }, { status: 404 });
  const target = `${(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3010').replace(/\/$/, '')}/lot/${publicId}`;
  const query = new URL(request.url).searchParams;
  const format = query.get('format') === 'svg' ? 'svg' : 'png';
  const disposition = query.get('download') === '1' ? 'attachment' : 'inline';
  if (format === 'svg') {
    const svg = await QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'H', margin: 2, width: 1024 });
    return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `${disposition}; filename="SUNFOOD-LOT-${publicId}.svg"`, 'X-QR-Target': target } });
  }
  const png = await QRCode.toBuffer(target, { type: 'png', errorCorrectionLevel: 'H', margin: 2, width: 1024 });
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `${disposition}; filename="SUNFOOD-LOT-${publicId}.png"`, 'X-QR-Target': target } });
}
