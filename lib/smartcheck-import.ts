import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';

export type ImportedSupplierFields = Partial<Record<'name' | 'productName' | 'address' | 'taxCode' | 'storage' | 'shelfLife', string>>;

const clean = (text: string) => text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

export function validatedSmartCheckUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'truyxuat.smartcheck.vn' || url.port || !/^\/check\/\d+\/?$/.test(url.pathname) || url.search || url.hash) {
    throw new Error('Chỉ hỗ trợ URL SmartCheck dạng https://truyxuat.smartcheck.vn/check/<mã>.');
  }
  return url.toString();
}

export function extractSmartCheck(html: string): ImportedSupplierFields {
  const $ = cheerio.load(html);
  const fields: ImportedSupplierFields = {};
  const title = clean($('h4').first().text() || $('title').first().text().replace(/^.*? - /, ''));
  if (title) fields.productName = title;
  let supplierRow = -1;
  const rows = $('table tr').toArray().map(row => clean($(row).text()));
  rows.forEach((row, index) => {
    const name = row.match(/^Nguồn gốc nhà cung cấp\s*:\s*(.+)$/i);
    if (name && !fields.name) { fields.name = clean(name[1]); supplierRow = index; }
    const storage = row.match(/^Bảo quản\s*:\s*(.+)$/i);
    if (storage && !fields.storage) fields.storage = clean(storage[1]);
    const shelfLife = row.match(/^Hạn sử dụng\s*:\s*(.+)$/i);
    if (shelfLife && !fields.shelfLife) fields.shelfLife = clean(shelfLife[1]);
  });
  // Only the address immediately after the supplier row is a supplier address.
  // Later addresses on the page may belong to the distributor (Sunfood).
  const address = rows[supplierRow + 1]?.match(/^Địa chỉ\s*:\s*(.+)$/i);
  if (address) fields.address = clean(address[1]);
  // Other SmartCheck templates use free-form markup rather than table rows.
  $('script, style, nav, footer').remove();
  const body = clean($('body').text());
  const beforeDistributor = body.split(/Nhà phân phối\s*:|Xem chi tiết|Thông tin truy xuất|Thông tin chứng nhận sản phẩm|Thông tin doanh nghiệp/i)[0];
  const supplierSection = beforeDistributor.match(/(?:Nguồn gốc nhà cung cấp|Nhà cung cấp|Nhà sản xuất)\s*:\s*(.+?)(?=Địa chỉ\s*:|Mã số thuế\s*:|Thông tin truy xuất|Xem chi tiết|$)/i)?.[1];
  if (!fields.name && supplierSection) fields.name = clean(supplierSection);
  const afterSupplier = beforeDistributor.match(/(?:Nguồn gốc nhà cung cấp|Nhà cung cấp|Nhà sản xuất)\s*:[\s\S]*?Địa chỉ\s*:\s*(.+?)(?=Mã số thuế\s*:|Hạn sử dụng\s*:|Bảo quản\s*:|$)/i)?.[1];
  if (!fields.address && afterSupplier) fields.address = clean(afterSupplier);
  const tax = supplierSection && beforeDistributor.match(/Mã số thuế\s*:\s*(\d{10,13})/i)?.[1];
  if (tax) fields.taxCode = tax;
  const storage = beforeDistributor.match(/Bảo quản\s*:\s*(.+?)(?=Nhà cung cấp\s*:|Nguồn gốc nhà cung cấp\s*:|Nhà sản xuất\s*:|Hạn sử dụng\s*:|$)/i)?.[1];
  if (!fields.storage && storage) fields.storage = clean(storage);
  const shelf = beforeDistributor.match(/Hạn sử dụng\s*:\s*(.+?)(?=Bảo quản\s*:|Nhà cung cấp\s*:|Nguồn gốc nhà cung cấp\s*:|Nhà sản xuất\s*:|$)/i)?.[1];
  if (!fields.shelfLife && shelf) fields.shelfLife = clean(shelf);
  // A few legacy pages concatenate unrelated blocks without separators. Do not
  // offer contaminated values as selectable legal/safety information.
  if (fields.name && (fields.name.length > 120 || /\b(?:Thôn|Phường|chuyên sản xuất và cung cấp)\b/i.test(fields.name))) delete fields.name;
  if (fields.address && (fields.address.length > 180 || /(?:Nhà cung cấp|Nhà phân phối|SĐT|https?:|Thông tin)/i.test(fields.address))) delete fields.address;
  if (fields.storage && (fields.storage.length > 180 || /(?:Nhà cung cấp|Nhà phân phối|Địa chỉ\s*:|https?:)/i.test(fields.storage))) delete fields.storage;
  if (fields.shelfLife && (fields.shelfLife.length > 180 || /(?:Nhà cung cấp|Nhà phân phối|Địa chỉ\s*:|Hợp tác xã|https?:)/i.test(fields.shelfLife))) delete fields.shelfLife;
  return fields;
}

export async function fetchSmartCheckDraft(sourceUrl: string) {
  const url = validatedSmartCheckUrl(sourceUrl);
  const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { 'Accept': 'text/html' } });
  if (!response.ok || response.status >= 300) throw new Error(`Nguồn trả HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Nguồn không phải trang HTML.');
  const length = Number(response.headers.get('content-length'));
  if (length > 3_000_000) throw new Error('Trang nguồn vượt giới hạn 3 MB.');
  const html = await response.text();
  if (Buffer.byteLength(html) > 3_000_000) throw new Error('Trang nguồn vượt giới hạn 3 MB.');
  const fields = extractSmartCheck(html);
  if (!fields.name && !fields.productName) throw new Error('Không đọc được tên nhà cung cấp/sản phẩm từ trang nguồn.');
  return { sourceUrl: url, sourceHash: createHash('sha256').update(html).digest('hex'), fields };
}
