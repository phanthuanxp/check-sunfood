import * as cheerio from 'cheerio';

export type HcTraceStep = {
  index: number;
  code: string | null;
  title: string | null;
  performedBy: string | null;
  performedByRole: string | null;
  address: string | null;
  note: string | null;
};

export type HcTraceEmployee = {
  name: string;
  position: string | null;
  certificates: string[];
};

export type HcTraceAttachment = { name: string; url: string };

export type HcTraceDetail = {
  verified: boolean;
  productName: string | null;
  foodCode: string | null;
  traceCode: string | null;
  supplierName: string | null;
  category: string | null;
  batchName: string | null;
  batchCode: string | null;
  importedAt: string | null;
  origin: string | null;
  purchaseAddress: string | null;
  gtin: string | null;
  standardFoodCode: string | null;
  processName: string | null;
  producedAt: string | null;
  expiresAt: string | null;
  warehouseName: string | null;
  facilityName: string | null;
  subSupplierName: string | null;
  coverImageUrl: string | null;
  attachments: HcTraceAttachment[];
  steps: HcTraceStep[];
  employees: HcTraceEmployee[];
  footerNote: string | null;
};

const clean = (text: string) => text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const dash = (value: string | undefined) => {
  const text = clean(value ?? '');
  return text && text !== '—' ? text : null;
};

export function validatedHanoiCheckTraceUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'tracuu.hanoicheck.com.vn' || url.port) {
    throw new Error('Chỉ hỗ trợ URL truy xuất HanoiCheck dạng https://tracuu.hanoicheck.com.vn/...');
  }
  if (!/^\/[A-Za-z0-9_-]+\/truy-xuat\/san-pham\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    throw new Error('Đường dẫn không đúng định dạng trang truy xuất sản phẩm HanoiCheck.');
  }
  return `https://tracuu.hanoicheck.com.vn${url.pathname}`;
}

export function extractHanoiCheckTrace(html: string): HcTraceDetail {
  const $ = cheerio.load(html);
  const kv: Record<string, string> = {};
  $('.kv').each((_, el) => {
    const label = clean($(el).find('.label').text());
    const value = clean($(el).find('.value').text());
    if (label) kv[label] = value;
  });

  const steps: HcTraceStep[] = [];
  $('.timeline-item').each((index, el) => {
    const $el = $(el);
    const title = dash(clean($el.find('.step-card-title').text()));
    let performedBy: string | null = null;
    let performedByRole: string | null = null;
    let address: string | null = null;
    let note: string | null = null;
    $el.find('.info-row').each((_, row) => {
      const $row = $(row);
      const label = clean($row.find('.info-label').text());
      const $value = $row.find('.info-value').clone();
      const sub = clean($value.find('.info-value-sub').text());
      $value.find('.info-value-sub').remove();
      const value = clean($value.text());
      if (label === 'Người thực hiện') {
        performedBy = dash(value);
        performedByRole = sub ? sub.replace(/^\(|\)$/g, '') : null;
      } else if (label === 'Địa chỉ') address = dash(value);
      else if (label === 'Ghi chú') note = dash(value);
    });
    steps.push({ index: index + 1, code: $el.attr('data-step-code') || null, title, performedBy, performedByRole, address, note });
  });

  const employees: HcTraceEmployee[] = [];
  $('.employee-card').each((_, el) => {
    const $el = $(el);
    const name = clean($el.find('.name').text());
    const position = dash(clean($el.find('.position').text()));
    const certificates = $el.find('.cert-line').toArray().map(item => clean($(item).text()));
    if (name) employees.push({ name, position, certificates });
  });

  const attachments: HcTraceAttachment[] = [];
  $('.trace-attachment-image').each((_, el) => {
    const $el = $(el);
    const url = $el.attr('data-lightbox-src') || $el.find('img').attr('src') || '';
    const name = $el.attr('data-lightbox-name') || clean($el.find('span').last().text()) || 'Tệp đính kèm';
    if (url) attachments.push({ name, url });
  });

  return {
    verified: /đã xác thực/i.test(clean($('.badge').first().text())),
    productName: dash($('.invoice-code').first().text()),
    foodCode: dash(kv['Mã thực phẩm']),
    traceCode: dash(kv['Mã truy xuất']),
    supplierName: dash(kv['Nhà cung cấp']),
    category: dash(kv['Danh mục']),
    batchName: dash(kv['Tên lô']),
    batchCode: dash(kv['Mã lô']),
    importedAt: dash(kv['Ngày nhập lô']),
    origin: dash(kv['Xuất xứ']),
    purchaseAddress: dash(kv['Nơi thu mua']),
    gtin: dash(kv['Mã GTIN']),
    standardFoodCode: dash(kv['Mã thực phẩm chuẩn']),
    processName: dash(kv['Quy trình sản xuất']),
    producedAt: dash(kv['Ngày sản xuất']),
    expiresAt: dash(kv['Hạn sử dụng']),
    warehouseName: dash(kv['Kho lưu trữ']),
    facilityName: dash(kv['Cơ sở sản xuất']),
    subSupplierName: dash(kv['NCC nguyên liệu']),
    coverImageUrl: $('.product-cover-button').attr('data-lightbox-src') || $('.product-cover-button img').attr('src') || null,
    attachments,
    steps,
    employees,
    footerNote: dash($('.footer-note').first().text()),
  };
}

export async function fetchHanoiCheckTracePage(sourceUrl: string) {
  const url = validatedHanoiCheckTraceUrl(sourceUrl);
  const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/html' } });
  if (!response.ok || response.status >= 300) throw new Error(`Trang truy xuất HanoiCheck trả HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Nguồn không phải trang HTML.');
  const length = Number(response.headers.get('content-length'));
  if (length > 3_000_000) throw new Error('Trang truy xuất vượt giới hạn 3 MB.');
  const html = await response.text();
  if (Buffer.byteLength(html) > 3_000_000) throw new Error('Trang truy xuất vượt giới hạn 3 MB.');
  const detail = extractHanoiCheckTrace(html);
  if (!detail.traceCode) throw new Error('Không đọc được mã truy xuất từ trang nguồn.');
  return { sourceUrl: url, html, detail };
}
