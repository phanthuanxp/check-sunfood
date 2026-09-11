import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';

const urls = [3312,3313,3314,4256,3315,3318,3317,3316,4558,3320,4559,3321,3323,4561,3633,3319,3324,3330,3659,4232,4560,3322,3329]
  .map(id => `https://truyxuat.smartcheck.vn/check/${id}`);

const normalize = s => s.replace(/\s+/g,' ').trim();
const out = [];

for (let i=0;i<urls.length;i++) {
  const url = urls[i];
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);
  const text = normalize($('body').text());
  const title = normalize($('h4').first().text() || $('title').text());
  const drive = $('a[href*="drive.google.com"]').first().attr('href') || null;
  const supplierMatch = text.match(/(?:Nguồn gốc nhà cung cấp|Nhà cung cấp)\s*:?\s*(.+?)(?=Địa chỉ|Nhà phân phối|Thông tin truy xuất)/i);
  const addressMatch = text.match(/Địa chỉ\s*:?\s*(.+?)(?=Nhà phân phối|Xem chi tiết|Thông tin truy xuất)/i);
  out.push({ code:`NCC-${String(i+1).padStart(2,'0')}`, sourceUrl:url, productName:title, supplierName:supplierMatch?.[1]?.trim() ?? null, address:addressMatch?.[1]?.trim() ?? null, legacyDocsUrl:drive });
  console.log(`Imported ${i+1}/${urls.length}`);
}
await fs.writeFile(new URL('../data/imported-smartcheck.json', import.meta.url), JSON.stringify(out,null,2));
console.log('Saved data/imported-smartcheck.json');
