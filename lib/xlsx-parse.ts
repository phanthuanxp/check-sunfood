import JSZip from 'jszip';
import * as cheerio from 'cheerio';

function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A';
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

// Reads the first worksheet of a .xlsx file into a rectangular string[][] grid.
// Excel XML omits empty cells entirely, so column position is recovered from
// each cell's `r` attribute (e.g. "C5") rather than assumed from element order.
export async function parseFirstSheet(buffer: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);
  const sheetFile = zip.file(/^xl\/worksheets\/sheet1\.xml$/i)[0];
  if (!sheetFile) throw new Error('Không tìm thấy trang tính đầu tiên trong file Excel.');

  const shared: string[] = [];
  const sharedStringsFile = zip.file(/^xl\/sharedStrings\.xml$/i)[0];
  if (sharedStringsFile) {
    const $shared = cheerio.load(await sharedStringsFile.async('string'), { xmlMode: true });
    $shared('si').each((_, el) => { shared.push($shared(el).text()); });
  }

  const $sheet = cheerio.load(await sheetFile.async('string'), { xmlMode: true });
  const rows: string[][] = [];
  $sheet('row').each((_, rowEl) => {
    const row: string[] = [];
    $sheet(rowEl).find('c').each((_, cellEl) => {
      const $cell = $sheet(cellEl);
      const ref = $cell.attr('r');
      const col = ref ? columnIndex(ref) : row.length;
      const type = $cell.attr('t');
      const raw = $cell.find('v').first().text();
      const value = type === 's' && raw ? (shared[Number(raw)] ?? '') : raw;
      while (row.length < col) row.push('');
      row[col] = value;
    });
    rows.push(row);
  });
  return rows;
}

export function sheetToRecords(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter(row => row.some(cell => cell !== undefined && cell !== ''))
    .map(row => Object.fromEntries(header.map((key, index) => [key.trim(), (row[index] ?? '').trim()])));
}
