import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSmartCheck, validatedSmartCheckUrl } from '../lib/smartcheck-import';

test('table template keeps supplier address, not distributor address', () => {
  const fields = extractSmartCheck(`<h4>Thịt lợn</h4><table>
    <tr><td>Nguồn gốc nhà cung cấp: C.P. Việt Nam</td></tr>
    <tr><td>Địa chỉ: Phú Nghĩa, Hà Nội</td></tr>
    <tr><td>Nhà phân phối: Sunfood Tây Đô</td></tr>
    <tr><td>Địa chỉ: Đông Ngạc, Hà Nội</td></tr>
  </table>`);
  assert.equal(fields.name, 'C.P. Việt Nam');
  assert.equal(fields.address, 'Phú Nghĩa, Hà Nội');
  assert.equal(fields.productName, 'Thịt lợn');
});

test('free-form template extracts only fields before distributor', () => {
  const fields = extractSmartCheck(`<body><h4>Đậu phụ</h4><div>Nhà sản xuất: Visoy Tofu Việt Nam
    Địa chỉ: Đan Phượng, Hà Nội Mã số thuế: 0107865084 Nhà phân phối: Sunfood Tây Đô
    Địa chỉ: Đông Ngạc, Hà Nội Mã số thuế: 0110716043</div></body>`);
  assert.equal(fields.name, 'Visoy Tofu Việt Nam');
  assert.equal(fields.address, 'Đan Phượng, Hà Nội');
  assert.equal(fields.taxCode, '0107865084');
});

test('unstructured or distributor-only legal fields stay empty', () => {
  const fields = extractSmartCheck('<body><h4>Hàng khô</h4>Thông tin truy xuất Nhà phân phối: Sunfood Mã số thuế: 0110716043</body>');
  assert.deepEqual(fields, { productName: 'Hàng khô' });
});

test('rejects arbitrary external targets and redirects by URL validation', () => {
  assert.equal(validatedSmartCheckUrl('https://truyxuat.smartcheck.vn/check/3312'), 'https://truyxuat.smartcheck.vn/check/3312');
  for (const url of ['http://truyxuat.smartcheck.vn/check/3312', 'https://127.0.0.1/check/3312', 'https://truyxuat.smartcheck.vn.evil.test/check/3312', 'https://truyxuat.smartcheck.vn/admin']) {
    assert.throws(() => validatedSmartCheckUrl(url));
  }
});
