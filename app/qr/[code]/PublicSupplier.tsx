'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

type Language = 'vi' | 'en';
type TabKey = 'source' | 'lots' | 'legal';
type Doc = { id: number; title: string; titleEn: string | null; category: string; fileUrl: string; issuedAt: string | null; expiresAt: string | null };
type PublicBatch = { publicId: string; code: string; name: string | null; receivedAt: string | null; expiresAt: string | null };
type PublicProduct = { id: number; name: string; batches: PublicBatch[] };
type Supplier = {
  code: string;
  name: string;
  nameEn: string | null;
  productName: string | null;
  productNameEn: string | null;
  address: string | null;
  addressEn: string | null;
  taxCode: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  description: string | null;
  descriptionEn: string | null;
  status: string;
  verificationStatus: string;
  updatedAt: string;
  documents: Doc[];
  products: PublicProduct[];
};

const LANGUAGE_STORAGE_KEY = 'sunfood-public-language';
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const legalCategories = ['BUSINESS_LICENSE', 'FOOD_SAFETY', 'CONTRACT', 'OTHER', 'TESTING', 'VIETGAP', 'HACCP', 'ISO'];
const tabKeys: TabKey[] = ['source', 'lots', 'legal'];
const categoryLabels = {
  vi: { BUSINESS_LICENSE: 'Đăng ký kinh doanh', FOOD_SAFETY: 'An toàn thực phẩm', CONTRACT: 'Hợp đồng', TESTING: 'Phiếu kiểm nghiệm', VIETGAP: 'VietGAP', HACCP: 'HACCP', ISO: 'ISO', OTHER: 'Hồ sơ khác' },
  en: { BUSINESS_LICENSE: 'Business registration', FOOD_SAFETY: 'Food safety', CONTRACT: 'Contract', TESTING: 'Test report', VIETGAP: 'VietGAP', HACCP: 'HACCP', ISO: 'ISO', OTHER: 'Other document' },
} as const;
const copy = {
  vi: {
    tagline: 'Minh bạch từ nguồn — An tâm mỗi bữa', verified: '✓ Đã xác minh', pending: '◷ Đang đối chiếu', system: 'HỆ THỐNG TRUY XUẤT NGUỒN GỐC',
    productFallback: 'Thông tin sản phẩm đang được đối chiếu', supplierCode: 'Mã nhà cung cấp', supplier: 'NHÀ CUNG CẤP', active: 'Đang hợp tác', inactive: 'Tạm ngừng công khai',
    tabs: { source: 'Thông tin', lots: 'Lô nhập hàng', legal: 'Hồ sơ pháp lý' },
    tabList: 'Nội dung truy xuất nguồn gốc', language: 'Chọn ngôn ngữ', address: 'Địa chỉ nhà cung cấp', tax: 'Mã số thuế', phone: 'Hotline', website: 'Website', email: 'Email',
    description: 'Giới thiệu công ty', missing: 'Chưa cập nhật',
    addressMissing: 'Chưa có dữ liệu — cần đối chiếu hồ sơ nội bộ', descriptionFallback: 'Thông tin giới thiệu về nhà cung cấp đang được cập nhật.',
    issued: 'Cấp', expires: 'Hết hạn', notRecorded: 'Không ghi nhận', open: 'Mở ↗',
    noDocs: 'Chưa có hồ sơ công khai', legalEmpty: 'Sunfood chưa công bố tệp pháp lý được phép lưu trữ cho nhà cung cấp này.',
    trust: 'Cam kết minh bạch', trustText: 'Thông tin do Sunfood Tây Đô quản lý và cập nhật. Hồ sơ chỉ được công khai khi có quyền lưu trữ và công bố.',
    translationNote: 'Nội dung này đang hiển thị theo hồ sơ gốc tiếng Việt.', aiUnavailable: 'Trợ lý tạm thời không khả dụng.',
  },
  en: {
    tagline: 'Transparent sourcing — Confidence in every meal', verified: '✓ Verified', pending: '◷ Under review', system: 'PRODUCT TRACEABILITY SYSTEM',
    productFallback: 'Product information is under review', supplierCode: 'Supplier code', supplier: 'SUPPLIER', active: 'Active supplier', inactive: 'Public display paused',
    tabs: { source: 'Information', lots: 'Inbound lots', legal: 'Legal documents' },
    tabList: 'Traceability content', language: 'Choose language', address: 'Supplier address', tax: 'Tax identification number', phone: 'Hotline', website: 'Website', email: 'Email',
    description: 'About the company', missing: 'Not available',
    addressMissing: 'No verified English data is available yet', descriptionFallback: 'A company introduction is being prepared.',
    issued: 'Issued', expires: 'Expires', notRecorded: 'Not recorded', open: 'Open ↗',
    noDocs: 'No public documents', legalEmpty: 'Sunfood has not published any authorized legal documents for this supplier.',
    trust: 'Transparency commitment', trustText: 'Information is managed and updated by Sunfood Tây Đô. Documents are published only when storage and disclosure are authorized.',
    translationNote: 'This field is shown from the original Vietnamese record.', aiUnavailable: 'The assistant is temporarily unavailable.',
  },
} as const;

function formatDate(value: string | null, lang: Language) {
  if (!value) return copy[lang].notRecorded;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy[lang].notRecorded;
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { timeZone: VIETNAM_TIME_ZONE }).format(date);
}

function localized(value: string | null, english: string | null, lang: Language, fallback: string) {
  return lang === 'en' ? (english || value || fallback) : (value || fallback);
}

function websiteHref(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function subscribeToHydration() {
  return () => {};
}

function readStoredLanguage(): Language | null {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'vi' || stored === 'en' ? stored : null;
  } catch {
    return null;
  }
}

function TranslationNote({ show, lang }: { show: boolean; lang: Language }) {
  return show ? <small className="field-note">{copy[lang].translationNote}</small> : null;
}

function DocumentList({ documents, lang, empty, emptyTitle }: { documents: Doc[]; lang: Language; empty: string; emptyTitle: string }) {
  const t = copy[lang];
  return <div className="public-docs">{documents.length ? documents.map(document => <a href={document.fileUrl} target="_blank" rel="noreferrer" className="public-doc" key={document.id}>
    <span className="file-icon">▤</span><span><b>{lang === 'en' ? (document.titleEn || document.title) : document.title}</b>
      <TranslationNote show={lang === 'en' && !document.titleEn} lang={lang} />
      <small>{categoryLabels[lang][document.category as keyof typeof categoryLabels.vi] || document.category} · {t.issued}: {formatDate(document.issuedAt, lang)} · {t.expires}: {formatDate(document.expiresAt, lang)}</small>
    </span><strong>{t.open}</strong>
  </a>) : <div className="empty-state"><span>◎</span><b>{emptyTitle}</b><p>{empty}</p></div>}</div>;
}

export default function PublicSupplier({ supplier, aiEnabled, initialLanguage }: { supplier: Supplier; aiEnabled: boolean; initialLanguage: Language | null }) {
  const [tab, setTab] = useState<TabKey>('source');
  const [languageOverride, setLanguageOverride] = useState<Language | null>(null);
  const [question, setQuestion] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiAnswer, setAiAnswer] = useState<{ answer: string; sources: { id: string; label: string; href: string }[] } | null>(null);
  const aiRequestId = useRef(0);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const lang = languageOverride || initialLanguage || (hydrated ? readStoredLanguage() : null) || 'vi';
  const t = copy[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    if (hydrated) {
      try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang); } catch { /* Storage can be unavailable in privacy-restricted browsers. */ }
    }
  }, [hydrated, lang]);

  useEffect(() => () => { document.documentElement.lang = 'vi'; }, []);

  function changeLanguage(nextLanguage: Language) {
    if (nextLanguage === lang) return;
    aiRequestId.current += 1;
    setLanguageOverride(nextLanguage);
    setAiAnswer(null);
    setAiError('');
    setAiBusy(false);
    document.documentElement.lang = nextLanguage;
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage); } catch { /* Storage is optional. */ }
    const url = new URL(window.location.href);
    url.searchParams.set('lang', nextLanguage);
    window.history.replaceState(window.history.state, '', url);
  }

  function selectTab(nextTab: TabKey, focus = false) {
    setTab(nextTab);
    if (focus) window.requestAnimationFrame(() => document.getElementById(`trace-tab-${nextTab}`)?.focus());
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, key: TabKey) {
    const current = tabKeys.indexOf(key);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % tabKeys.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabKeys.length) % tabKeys.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabKeys.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabKeys[next], true);
  }

  async function askAi(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aiEnabled || !question.trim()) return;
    const requestId = ++aiRequestId.current;
    setAiBusy(true); setAiError(''); setAiAnswer(null);
    try {
      const response = await fetch('/api/ai/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: supplier.code, question, language: lang }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t.aiUnavailable);
      if (aiRequestId.current === requestId) setAiAnswer(result);
    } catch (error) {
      if (aiRequestId.current === requestId) setAiError(error instanceof Error ? error.message : t.aiUnavailable);
    } finally {
      if (aiRequestId.current === requestId) setAiBusy(false);
    }
  }

  const legalDocs = supplier.documents.filter(document => legalCategories.includes(document.category));
  const isVerified = supplier.verificationStatus === 'VERIFIED';
  const product = localized(supplier.productName, supplier.productNameEn, lang, t.productFallback);
  const supplierName = localized(supplier.name, supplier.nameEn, lang, supplier.name);
  const address = localized(supplier.address, supplier.addressEn, lang, t.addressMissing);
  const description = localized(supplier.description, supplier.descriptionEn, lang, t.descriptionFallback);
  const website = supplier.website ? websiteHref(supplier.website) : null;

  return <main className="trace-page"><header className="trace-header"><Link href="/" className="trace-logo"><span>SF</span><div><b>SUNFOOD TÂY ĐÔ</b><small>{t.tagline}</small></div></Link><div className="trace-header-actions"><div className="language-switch" role="group" aria-label={t.language}>
    <button type="button" className={lang === 'vi' ? 'active' : ''} aria-pressed={lang === 'vi'} onClick={() => changeLanguage('vi')}>VI</button>
    <button type="button" className={lang === 'en' ? 'active' : ''} aria-pressed={lang === 'en'} onClick={() => changeLanguage('en')}>EN</button>
  </div><span className={isVerified ? 'verified' : 'verified pending'}>{isVerified ? t.verified : t.pending}</span></div></header>
    <section className="trace-hero"><div className="hero-glow" /><div className="hero-content"><p>{t.system}</p><h1>{product}</h1>{lang === 'en' && !supplier.productNameEn && supplier.productName && <small className="translation-note">{t.translationNote}</small>}<div className="code-pill">{t.supplierCode} <b>{supplier.code}</b></div></div></section>
    <section className="trace-container"><div className="supplier-heading"><div className="supplier-avatar">{supplier.code.slice(-2)}</div><div><p>{t.supplier}</p><h2>{supplierName}</h2>{lang === 'en' && !supplier.nameEn && <small className="translation-inline">{t.translationNote}</small>}<span className={supplier.status === 'ACTIVE' ? 'active-dot' : 'inactive-dot'}>● {supplier.status === 'ACTIVE' ? t.active : t.inactive}</span></div></div>
      <nav className="public-tabs" role="tablist" aria-label={t.tabList} aria-orientation="horizontal">{tabKeys.map(key => <button
        type="button" role="tab" id={`trace-tab-${key}`} aria-controls={`trace-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        className={tab === key ? 'active' : ''} onClick={() => selectTab(key)} onKeyDown={event => handleTabKeyDown(event, key)} key={key}
      >{t.tabs[key]}</button>)}</nav>
      <div className="tab-content" role="tabpanel" id={`trace-panel-${tab}`} aria-labelledby={`trace-tab-${tab}`} tabIndex={0}>
        {tab === 'source' && <div className="source-grid">
          <article><span>⌖</span><div><label>{t.address}</label><p>{address}</p><TranslationNote show={lang === 'en' && !supplier.addressEn && Boolean(supplier.address)} lang={lang} /></div></article>
          <article><span>▣</span><div><label>{t.tax}</label><p>{supplier.taxCode || t.missing}</p></div></article>
          <article><span>☎</span><div><label>{t.phone}</label>{supplier.phone ? <p><a href={`tel:${supplier.phone.replace(/\s+/g, '')}`}>{supplier.phone}</a></p> : <p>{t.missing}</p>}</div></article>
          <article><span>⊙</span><div><label>{t.website}</label>{website ? <p><a href={website} target="_blank" rel="noreferrer">{supplier.website}</a></p> : <p>{supplier.website || t.missing}</p>}</div></article>
          <article><span>✉</span><div><label>{t.email}</label>{supplier.email ? <p><a href={`mailto:${supplier.email}`}>{supplier.email}</a></p> : <p>{t.missing}</p>}</div></article>
          <article className="wide"><span>i</span><div><label>{t.description}</label><p>{description}</p><TranslationNote show={lang === 'en' && !supplier.descriptionEn && Boolean(supplier.description)} lang={lang} /></div></article>
        </div>}
        {tab === 'lots' && <div className="public-lots">{isVerified && supplier.status === 'ACTIVE' && supplier.products.some(item => item.batches.length) ? supplier.products.flatMap(item => item.batches.map(batch => <Link className="public-lot" href={`/lot/${batch.publicId}?lang=${lang}`} key={batch.publicId}><span><b>{batch.name || item.name}</b><small>{lang === 'vi' ? 'Mã lô' : 'Lot code'}: {batch.code} · {lang === 'vi' ? 'Ngày nhập' : 'Received'}: {formatDate(batch.receivedAt, lang)}</small></span><strong>{lang === 'vi' ? 'Xem lô →' : 'View lot →'}</strong></Link>)) : <div className="empty-state"><span>▣</span><b>{lang === 'vi' ? 'Chưa có lô được công bố' : 'No published lots'}</b><p>{lang === 'vi' ? 'Lô nhập hàng chỉ xuất hiện sau khi thông tin và nhà cung cấp được xác minh.' : 'Inbound lots appear after the supplier and lot data are verified.'}</p></div>}</div>}
        {tab === 'legal' && <DocumentList documents={legalDocs} lang={lang} empty={t.legalEmpty} emptyTitle={t.noDocs} />}
      </div><section className="trace-ai"><div><b>{lang === 'vi' ? 'Hỏi về nguồn gốc' : 'Ask about this source'}</b><p>{aiEnabled ? (lang === 'vi' ? 'Trợ lý chỉ dùng dữ liệu nhà cung cấp đã xác minh và hồ sơ công khai.' : 'Answers use only verified supplier data and public document metadata.') : (lang === 'vi' ? 'Trợ lý sẽ mở khi dữ liệu nhà cung cấp được xác minh và hệ thống AI được cấu hình.' : 'The assistant will open after supplier verification and AI setup.')}</p></div>{aiEnabled && <form onSubmit={askAi}><input value={question} onChange={event => setQuestion(event.target.value)} maxLength={300} placeholder={lang === 'vi' ? 'Ví dụ: Nhà cung cấp này có hồ sơ gì?' : 'For example: Which documents are available?'} aria-label={lang === 'vi' ? 'Câu hỏi về nguồn gốc' : 'Traceability question'} required /><button disabled={aiBusy}>{aiBusy ? '…' : lang === 'vi' ? 'Hỏi AI' : 'Ask AI'}</button></form>}{aiError && <p role="alert">{aiError}</p>}{aiAnswer && <div className="trace-ai-answer"><p>{aiAnswer.answer}</p>{aiAnswer.sources.length > 0 && <div>{aiAnswer.sources.map(source => <a key={source.id} href={source.href} target={source.id === 'supplier' ? undefined : '_blank'} rel="noreferrer">{source.label} ↗</a>)}</div>}</div>}<small>{lang === 'vi' ? 'AI không xác nhận tính thật của giấy tờ hoặc độ an toàn của sản phẩm.' : 'AI does not certify documents or food safety.'}</small></section><div className="trust-note"><span>✓</span><p><b>{t.trust}</b><br />{t.trustText}</p></div>
    </section><footer className="trace-footer"><b>CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ</b><p>{lang === 'vi' ? 'MST 0110716043 · Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội' : 'Tax ID 0110716043 · No. 17-19 Cau 1 Collective Area, Phan Ba Vanh Street, Dong Ngac Ward, Hanoi, Vietnam'}</p><p>tpsunfoodtaydoo@gmail.com · www.sunfoodtaydo.com</p></footer>
  </main>;
}
