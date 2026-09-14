import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!(await prisma.supplier.findUnique({ where: { code }, select: { id: true } }))) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  const searchParams = new URL(request.url).searchParams;
  const format = searchParams.get('format') === 'svg' ? 'svg' : 'png';
  const disposition = searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const target = `${siteUrl}/qr/${code}`;
  if (format === 'svg') {
    const svg = await QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'H', margin: 2, width: 1024 });
    return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `${disposition}; filename="${code}.svg"`, 'Cache-Control': 'public, max-age=3600', 'X-QR-Target': target } });
  }
  const png = await QRCode.toBuffer(target, { type: 'png', errorCorrectionLevel: 'H', margin: 2, width: 1024 });
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `${disposition}; filename="${code}.png"`, 'Cache-Control': 'public, max-age=3600', 'X-QR-Target': target } });
}
