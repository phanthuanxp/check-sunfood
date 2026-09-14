import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const suppliers=await prisma.supplier.findMany({select:{code:true},orderBy:{code:'asc'}});
  const siteUrl=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'');
  const zip=new JSZip();
  await Promise.all(suppliers.map(async supplier=>{
    const image=await QRCode.toBuffer(`${siteUrl}/qr/${supplier.code}`,{type:'png',errorCorrectionLevel:'H',margin:2,width:1024});
    zip.file(`${supplier.code}.png`,image);
  }));
  zip.file('README.txt',`QR Sunfood Tây Đô\r\nNội dung theo mẫu: ${siteUrl}/qr/NCC-xx\r\nTổng số: ${suppliers.length}`);
  const archive=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  return new NextResponse(new Uint8Array(archive),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="sunfood-qr-all.zip"','Cache-Control':'no-store'}});
}
