import { NextResponse } from 'next/server';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { loadUpload } from '@/lib/storage';

const mime:Record<string,string>={'.pdf':'application/pdf','.jpg':'image/jpeg','.png':'image/png'};

export async function GET(_:Request,{params}:{params:Promise<{filename:string}>}){
  const {filename}=await params;
  if(!/^[A-Za-z0-9.-]+\.(pdf|jpg|png)$/i.test(filename))return NextResponse.json({error:'Invalid filename'},{status:400});
  const fileUrl=`/api/files/${filename}`;
  const document=await prisma.document.findFirst({where:{fileUrl},select:{isPublic:true}});
  const productImage=document?null:await prisma.product.findFirst({where:{imageUrl:fileUrl,isPublic:true},select:{id:true}});
  const archivedVersion=(document||productImage)?null:await prisma.documentVersion.findFirst({where:{fileUrl},select:{id:true}});
  if(!document&&!productImage&&!archivedVersion)return NextResponse.json({error:'File not found'},{status:404});
  const isPublicFile=Boolean(document?.isPublic||productImage);
  if((archivedVersion||!isPublicFile)&&!(await isAdmin()))return NextResponse.json({error:'Unauthorized'},{status:401});
  try{
    const bytes=await loadUpload(filename);
    const contentType=mime[path.extname(filename).toLowerCase()]||'application/octet-stream';
    return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':contentType,'Content-Disposition':`inline; filename="${filename}"`,'Cache-Control':isPublicFile?'public, max-age=3600':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return NextResponse.json({error:'File not found'},{status:404});}
}
