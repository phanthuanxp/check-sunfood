'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import styles from './HomePage.module.css';

export type SupplierDirectoryItem = {
  code: string;
  name: string;
  productName: string | null;
  status: string;
  verificationStatus: string;
};

type SupplierDirectoryProps = {
  suppliers: SupplierDirectoryItem[];
};

type DirectoryFilter = 'ALL' | 'VERIFIED' | 'REVIEWING';

const filters: Array<{ value: DirectoryFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'VERIFIED', label: 'Đã xác minh' },
  { value: 'REVIEWING', label: 'Đang đối chiếu' },
];

function normalizeSearchValue(value: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .trim();
}

function isVerified(supplier: SupplierDirectoryItem) {
  return supplier.status === 'ACTIVE' && supplier.verificationStatus === 'VERIFIED';
}

export function SupplierDirectory({ suppliers }: SupplierDirectoryProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DirectoryFilter>('ALL');

  const counts = useMemo(() => ({
    ALL: suppliers.length,
    VERIFIED: suppliers.filter(isVerified).length,
    REVIEWING: suppliers.filter((supplier) => !isVerified(supplier)).length,
  }), [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query);

    return suppliers.filter((supplier) => {
      const matchesStatus = filter === 'ALL'
        || (filter === 'VERIFIED' ? isVerified(supplier) : !isVerified(supplier));
      if (!matchesStatus) return false;
      if (!normalizedQuery) return true;

      const searchableText = normalizeSearchValue(
        `${supplier.code} ${supplier.name} ${supplier.productName ?? ''}`,
      );
      return searchableText.includes(normalizedQuery);
    });
  }, [filter, query, suppliers]);

  return (
    <section className={styles.directory} id="danh-sach-ncc" aria-labelledby="directory-title">
      <div className={styles.directoryHeading}>
        <div>
          <p className={styles.eyebrow}>DANH BẠ NHÀ CUNG CẤP</p>
          <h2 id="directory-title">{suppliers.length} nguồn cung đang được quản lý</h2>
          <p className={styles.directoryLead}>
            Tìm theo mã, tên đơn vị hoặc sản phẩm; trạng thái hiển thị đúng theo dữ liệu Sunfood đã duyệt.
          </p>
        </div>
        <span className={styles.directoryCount}>{suppliers.length} mã truy xuất</span>
      </div>

      <form className={styles.directoryControls} role="search" onSubmit={(event) => event.preventDefault()}>
        <div className={styles.searchField}>
          <label htmlFor="supplier-search">Tìm nhà cung cấp</label>
          <div className={styles.searchInputWrap}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              id="supplier-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ví dụ: NCC-01, rau củ, tên đơn vị…"
              autoComplete="off"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Xóa nội dung tìm kiếm">
                Xóa
              </button>
            ) : null}
          </div>
        </div>

        <fieldset className={styles.filterGroup}>
          <legend>Lọc theo trạng thái xác minh</legend>
          <div>
            {filters.map((item) => (
              <button
                type="button"
                key={item.value}
                className={filter === item.value ? styles.filterActive : undefined}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label} <span>{counts[item.value]}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </form>

      <p className={styles.resultSummary} aria-live="polite" aria-atomic="true">
        Hiển thị <strong>{filteredSuppliers.length}</strong> trên {suppliers.length} nhà cung cấp
      </p>

      {filteredSuppliers.length > 0 ? (
        <ul className={styles.supplierGrid}>
          {filteredSuppliers.map((supplier) => {
            const verified = isVerified(supplier);
            return (
              <li key={supplier.code}>
                <Link
                  className={styles.supplierCard}
                  href={`/qr/${supplier.code}`}
                  aria-label={`Xem thông tin truy xuất ${supplier.code}, ${supplier.name}`}
                >
                  <span className={styles.supplierCode}>{supplier.code}</span>
                  <span className={styles.supplierInfo}>
                    <span className={verified ? styles.verifiedBadge : styles.reviewBadge}>
                      <i aria-hidden="true" />
                      {verified ? 'Đã xác minh' : 'Đang đối chiếu'}
                    </span>
                    <strong>{supplier.productName || 'Sản phẩm đang được cập nhật'}</strong>
                    <small>{supplier.name}</small>
                  </span>
                  <svg className={styles.cardArrow} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.emptyState} role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4M8.5 11h5" />
          </svg>
          <div>
            <strong>Chưa tìm thấy nhà cung cấp phù hợp</strong>
            <p>Thử một mã NCC, tên đơn vị hoặc trạng thái khác.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('ALL');
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      )}
    </section>
  );
}
