"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Route-handler download links must remain native anchors. */
/* eslint-disable @next/next/no-img-element -- QR and uploaded-document previews are dynamic API resources. */

import { FormEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { DataWarning } from "@/lib/data-warnings";
import TraceWorkspace from "./trace/TraceWorkspace";
import AccountSettingsForm from "./settings/account/AccountSettingsForm";
import AiSettingsForm from "./settings/ai/AiSettingsForm";
import HanoiCheckSettingsForm from "./settings/hanoicheck/HanoiCheckSettingsForm";

type Version = {
  id: number;
  fileUrl: string;
  note: string | null;
  createdAt: string;
};
type DocumentItem = {
  id: number;
  title: string;
  titleEn: string | null;
  category: string;
  fileUrl: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: string;
  isPublic: boolean;
  versions: Version[];
};
type Supplier = {
  id: number;
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
  storage: string | null;
  storageEn: string | null;
  shelfLife: string | null;
  shelfLifeEn: string | null;
  notes: string | null;
  notesEn: string | null;
  status: string;
  verificationStatus: string;
  documents: DocumentItem[];
};
type Audit = { id: number; summary: string; createdAt: string };
type Confidence = "HIGH" | "MEDIUM" | "LOW" | null;
type AiSuggestion = { title: string | null; category: string | null; supplierName: string | null; taxCode: string | null; documentNumber: string | null; issuedAt: string | null; expiresAt: string | null; evidence: string | null; warnings: string[]; confidence: Record<"title" | "category" | "issuedAt" | "expiresAt", Confidence> };
type DocFieldKey = "title" | "category" | "issuedAt" | "expiresAt";
const emptyDocFields: Record<DocFieldKey, string> = { title: "", category: "BUSINESS_LICENSE", issuedAt: "", expiresAt: "" };
const confidenceLabels: Record<NonNullable<Confidence>, string> = { HIGH: "Tin cậy cao", MEDIUM: "Cần kiểm tra", LOW: "Độ tin cậy thấp" };
const docFieldLabels: Record<DocFieldKey, string> = { title: "Tiêu đề", category: "Phân loại", issuedAt: "Ngày cấp", expiresAt: "Ngày hết hạn" };

const emptySupplier = {
  code: "",
  name: "",
  nameEn: "",
  productName: "",
  productNameEn: "",
  address: "",
  addressEn: "",
  taxCode: "",
  phone: "",
  website: "",
  email: "",
  description: "",
  descriptionEn: "",
  storage: "",
  storageEn: "",
  shelfLife: "",
  shelfLifeEn: "",
  notes: "",
  notesEn: "",
  status: "ACTIVE",
  verificationStatus: "PENDING",
};
const categoryLabels: Record<string, string> = {
  BUSINESS_LICENSE: "Đăng ký kinh doanh",
  FOOD_SAFETY: "An toàn thực phẩm",
  CONTRACT: "Hợp đồng",
  TESTING: "Kiểm nghiệm",
  VIETGAP: "VietGAP",
  HACCP: "HACCP",
  ISO: "ISO",
  OTHER: "Hồ sơ khác",
};
const verificationLabels: Record<string, string> = {
  PENDING: "Đang đối chiếu",
  VERIFIED: "Đã xác minh",
  NEEDS_REVIEW: "Cần rà soát",
};

function expiry(expiresAt: string | null) {
  if (!expiresAt)
    return {
      key: "none",
      label: "Không thời hạn",
      days: null as number | null,
    };
  const days = Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / 86400000,
  );
  if (days < 0)
    return { key: "expired", label: `Quá hạn ${Math.abs(days)} ngày`, days };
  if (days <= 30) return { key: "due30", label: `Còn ${days} ngày`, days };
  if (days <= 60) return { key: "due60", label: `Còn ${days} ngày`, days };
  if (days <= 90) return { key: "due90", label: `Còn ${days} ngày`, days };
  return { key: "valid", label: "Còn hiệu lực", days };
}

type AdminView = "overview" | "suppliers" | "qr" | "audit" | "warnings" | "batches" | "settings";
type SettingsTab = "account" | "ai" | "hanoicheck";
const severityLabels: Record<DataWarning["severity"], string> = { critical: "Khẩn cấp", warning: "Cần chú ý", info: "Tham khảo" };

export default function AdminDashboard({
  initialSuppliers,
  auditLogs,
  warnings,
  adminUsername,
  initialView = "overview",
}: {
  initialSuppliers: Supplier[];
  auditLogs: Audit[];
  warnings: DataWarning[];
  adminUsername: string;
  initialView?: AdminView;
}) {
  const router = useRouter();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("admin-sidebar-collapsed") === "1"; } catch { return false; }
  });
  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem("admin-sidebar-collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }
  const [suppliers] = useState(initialSuppliers);
  const [query, setQuery] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] =
    useState<Record<string, string>>(emptySupplier);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentItem | null>(
    null,
  );
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeView, setActiveView] = useState<AdminView>(initialView);
  const documentFormRef = useRef<HTMLFormElement>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [docFields, setDocFields] = useState<Record<DocFieldKey, string>>(emptyDocFields);

  const docs = useMemo(
    () =>
      suppliers.flatMap((s) => s.documents.map((d) => ({ ...d, supplier: s }))),
    [suppliers],
  );
  const stats = useMemo(
    () => ({
      total: suppliers.length,
      valid: docs.filter((d) =>
        ["valid", "none"].includes(expiry(d.expiresAt).key),
      ).length,
      warning: docs.filter((d) => expiry(d.expiresAt).key.startsWith("due"))
        .length,
      expired: docs.filter((d) => expiry(d.expiresAt).key === "expired").length,
      missing: suppliers.filter((s) => s.documents.length === 0).length,
      active: suppliers.filter((s) => s.status === "ACTIVE").length,
      verified: suppliers.filter((s) => s.verificationStatus === "VERIFIED").length,
      publicDocs: docs.filter((d) => d.isPublic).length,
    }),
    [suppliers, docs],
  );

  const filtered = suppliers.filter((s) => {
    const text = `${s.code} ${s.name} ${s.productName || ""}`.toLowerCase();
    if (!text.includes(query.toLowerCase())) return false;
    const categoryMatch =
      categoryFilter === "all" ||
      s.documents.some((d) => d.category === categoryFilter);
    if (!categoryMatch) return false;
    if (expiryFilter === "all") return true;
    if (expiryFilter === "missing") return s.documents.length === 0;
    return s.documents.some((d) => {
      const key = expiry(d.expiresAt).key;
      return expiryFilter === "warning"
        ? key.startsWith("due")
        : key === expiryFilter;
    });
  });

  function editSupplier(s?: Supplier) {
    setSelected(s || null);
    setSupplierForm(
      s
        ? Object.fromEntries(
            Object.keys(emptySupplier).map((key) => [
              key,
              String(s[key as keyof Supplier] ?? ""),
            ]),
          )
        : emptySupplier,
    );
    setShowSupplierForm(true);
    setMessage("");
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(
      selected ? `/api/suppliers/${selected.code}` : "/api/suppliers",
      {
        method: selected ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierForm),
      },
    );
    const data = await response.json();
    setBusy(false);
    if (!response.ok)
      return setMessage(data.error || "Không thể lưu nhà cung cấp.");
    window.location.reload();
  }

  async function archiveSupplier(s: Supplier) {
    if (!confirm(`Tạm ngừng ${s.code}? URL QR và dữ liệu vẫn được giữ nguyên.`))
      return;
    const response = await fetch(`/api/suppliers/${s.code}`, {
      method: "DELETE",
    });
    if (response.ok) window.location.reload();
    else setMessage("Không thể cập nhật trạng thái nhà cung cấp.");
  }

  function openDocuments(s: Supplier) {
    setSelected(s);
    setEditingDocument(null);
    setShowDocumentForm(false);
    setAiSuggestion(null);
    setDocFields(emptyDocFields);
    setMessage("");
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    let fileUrl = editingDocument?.fileUrl || "";
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const upload = new FormData();
      upload.set("file", file);
      const uploaded = await fetch("/api/upload", {
        method: "POST",
        body: upload,
      });
      const result = await uploaded.json();
      if (!uploaded.ok) {
        setBusy(false);
        return setMessage(result.error || "Tải tệp thất bại.");
      }
      fileUrl = result.fileUrl;
    }
    if (!fileUrl) {
      setBusy(false);
      return setMessage("Vui lòng chọn tệp PDF/JPG/PNG.");
    }
    const payload = {
      title: form.get("title"),
      titleEn: form.get("titleEn"),
      category: form.get("category"),
      issuedAt: form.get("issuedAt"),
      expiresAt: form.get("expiresAt"),
      isPublic: form.get("isPublic") === "on",
      fileUrl,
    };
    const response = await fetch(
      editingDocument
        ? `/api/documents/${editingDocument.id}`
        : `/api/suppliers/${selected.code}/documents`,
      {
        method: editingDocument ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setBusy(false);
    if (!response.ok) {
      const result = await response.json();
      return setMessage(result.error || "Không thể lưu hồ sơ.");
    }
    window.location.reload();
  }

  async function analyzeDocument() {
    if (!selected || !documentFormRef.current) return;
    const form = new FormData(documentFormRef.current);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return setMessage('Chọn tệp PDF/JPG/PNG trước khi phân tích.');
    if (form.get('aiConsent') !== 'on') return setMessage('Anh cần xác nhận quyền gửi tệp cho dịch vụ AI trước khi phân tích.');
    const payload = new FormData();
    payload.set('file', file); payload.set('consent', 'yes');
    payload.set('supplierName', selected.name); payload.set('supplierTaxCode', selected.taxCode || '');
    setAiBusy(true); setMessage(''); setAiSuggestion(null);
    try {
      const response = await fetch('/api/admin/ai/extract', { method: 'POST', body: payload });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể phân tích hồ sơ.');
      setAiSuggestion(data.extracted);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể phân tích hồ sơ.'); }
    finally { setAiBusy(false); }
  }

  async function draftTranslation() {
    if (!window.confirm('Gửi các trường mô tả tiếng Việt đang nhập đến dịch vụ AI để tạo bản dịch nháp? Không gửi tệp hồ sơ.')) return;
    setBusy(true); setMessage('Đang tạo bản dịch tiếng Anh để anh kiểm tra…');
    try {
      const response = await fetch('/api/admin/ai/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(supplierForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể dịch.');
      setSupplierForm(current => ({ ...current, ...data.translations }));
      setMessage('Đã điền bản dịch nháp. Anh hãy kiểm tra thuật ngữ và sửa trước khi lưu.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể dịch.'); }
    finally { setBusy(false); }
  }

  function applyField(key: DocFieldKey) {
    if (!aiSuggestion) return;
    const value = aiSuggestion[key];
    if (!value) return;
    setDocFields((current) => ({ ...current, [key]: value }));
    setMessage(`Đã chấp nhận đề xuất AI cho trường "${docFieldLabels[key]}". Anh hãy đối chiếu bản gốc trước khi lưu; AI không tự công khai hồ sơ.`);
  }

  async function removeDocument(document: DocumentItem) {
    if (!confirm(`Xóa hồ sơ “${document.title}”?`)) return;
    const response = await fetch(`/api/documents/${document.id}`, {
      method: "DELETE",
    });
    if (response.ok) window.location.reload();
    else setMessage("Không thể xóa hồ sơ.");
  }

  function exportCsv() {
    const rows = [
      [
        "Mã NCC",
        "Nhà cung cấp",
        "Sản phẩm",
        "Hồ sơ",
        "Phân loại",
        "Ngày hết hạn",
        "Tình trạng",
        "Công khai",
      ],
    ];
    suppliers.forEach((s) => {
      if (!s.documents.length)
        rows.push([
          s.code,
          s.name,
          s.productName || "",
          "",
          "",
          "",
          "Thiếu hồ sơ",
          "",
        ]);
      s.documents.forEach((d) =>
        rows.push([
          s.code,
          s.name,
          s.productName || "",
          d.title,
          categoryLabels[d.category] || d.category,
          d.expiresAt?.slice(0, 10) || "",
          expiry(d.expiresAt).label,
          d.isPublic ? "Có" : "Không",
        ]),
      );
    });
    const csv =
      "\ufeff" +
      rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "sunfood-canh-bao-ho-so.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const viewTitle = {
    overview: ["Tổng quan", "Theo dõi tình trạng nhà cung cấp, hồ sơ và các việc cần xử lý."],
    suppliers: ["Quản lý nhà cung cấp", "Xem, chỉnh sửa, cập nhật hồ sơ và trạng thái từng nhà cung cấp."],
    qr: ["Thư viện QR nhà cung cấp", "Quản lý và tải mã truy xuất cố định của từng nhà cung cấp."],
    audit: ["Nhật ký hoạt động", "Theo dõi các thay đổi dữ liệu gần nhất trong hệ thống."],
    warnings: ["Cảnh báo dữ liệu", "Quy tắc xác định tự động: hồ sơ hết hạn, thiếu dữ liệu, mã số thuế/tên trùng lặp. Không dùng AI cho các quyết định này."],
    batches: ["Quản lý lô nhập hàng", "Đồng bộ, duyệt công khai và in QR cho từng lô nhập hàng từ HanoiCheck."],
    settings: ["Cài đặt", "Tài khoản, cấu hình AI, kết nối HanoiCheck và các tác vụ cấu hình khác của dự án."],
  }[activeView];
  const warningStats = useMemo(() => ({
    critical: warnings.filter((w) => w.severity === "critical").length,
    warning: warnings.filter((w) => w.severity === "warning").length,
    conflicts: warnings.filter((w) => w.rule === "DUPLICATE_TAX_CODE" || w.rule === "DUPLICATE_NAME").length,
  }), [warnings]);

  function openWarning(warning: DataWarning) {
    const supplier = suppliers.find((s) => s.code === warning.code);
    if (!supplier) return;
    if (warning.rule === "MISSING_DOCUMENTS" || warning.rule.startsWith("DOCUMENT_")) openDocuments(supplier);
    else editSupplier(supplier);
  }

  return (
    <main className={`admin-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside
        className={`admin-sidebar${sidebarCollapsed ? " collapsed" : ""}`}
        aria-label="Thanh điều hướng quản trị"
      >
        <a href="/" className="admin-logo" aria-label="Về trang chủ Sunfood Tây Đô">
          <Image src="/brand/sunfood-logo.png" alt="" aria-hidden="true" width={44} height={44} />
          <div><b>Sunfood Tây Đô</b><small>Traceability Console</small></div>
        </a>
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
          aria-label={sidebarCollapsed ? "Mở rộng menu quản trị" : "Thu gọn menu quản trị"}
          aria-controls="admin-primary-navigation"
          aria-expanded={!sidebarCollapsed}
        >
          <span aria-hidden="true">{sidebarCollapsed ? "»" : "«"}</span>
        </button>
        <p className="sidebar-label">QUẢN LÝ</p>
        <nav id="admin-primary-navigation" aria-label="Điều hướng quản trị chính">
          <button type="button" className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")} title="Mở Tổng quan" aria-current={activeView === "overview" ? "page" : undefined}>
            <span aria-hidden="true">⌂</span><b>Tổng quan</b>
          </button>
          <button type="button" className={activeView === "suppliers" ? "active" : ""} onClick={() => setActiveView("suppliers")} title="Mở Quản lý nhà cung cấp" aria-current={activeView === "suppliers" ? "page" : undefined}><span aria-hidden="true">◇</span><b>Nhà cung cấp</b></button>
          <button type="button" className={activeView === "batches" ? "active" : ""} onClick={() => setActiveView("batches")} title="Mở Quản lý lô nhập hàng" aria-current={activeView === "batches" ? "page" : undefined}><span aria-hidden="true">◎</span><b>Lô nhập hàng</b></button>
          <button type="button" className={activeView === "qr" ? "active" : ""} onClick={() => setActiveView("qr")} title="Mở Thư viện QR nhà cung cấp" aria-current={activeView === "qr" ? "page" : undefined}><span aria-hidden="true">▦</span><b>Thư viện QR</b></button>
          <button type="button" className={activeView === "warnings" ? "active" : ""} onClick={() => setActiveView("warnings")} title="Mở Cảnh báo dữ liệu" aria-current={activeView === "warnings" ? "page" : undefined}><span aria-hidden="true">⚠</span><b>Cảnh báo dữ liệu</b>{warningStats.critical > 0 && <em className="nav-badge" aria-label={`${warningStats.critical} cảnh báo khẩn cấp`}>{warningStats.critical}</em>}</button>
          <button type="button" className={activeView === "audit" ? "active" : ""} onClick={() => setActiveView("audit")} title="Mở Nhật ký hoạt động" aria-current={activeView === "audit" ? "page" : undefined}><span aria-hidden="true">◷</span><b>Nhật ký</b></button>
          <button type="button" className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")} title="Mở Cài đặt" aria-current={activeView === "settings" ? "page" : undefined}><span aria-hidden="true">⚙</span><b>Cài đặt</b></button>
        </nav>
        <div className="sidebar-account"><div className="admin-avatar" aria-hidden="true">A</div><div><b>Quản trị viên</b><small>Administrator</small></div><button type="button" onClick={logout} title="Đăng xuất khỏi trang quản trị" aria-label="Đăng xuất khỏi trang quản trị">↪</button></div>
      </aside>
      <section className="admin-content" id="admin-main-content" aria-labelledby="admin-view-title" tabIndex={-1}>
        <header className="admin-top">
          <div>
            <p className="admin-breadcrumb">Trang quản trị <span>/</span> {viewTitle[0]}</p>
            <h1 id="admin-view-title">{viewTitle[0]}</h1>
            <p className="admin-subtitle">{viewTitle[1]}</p>
          </div>
          {(activeView === "overview" || activeView === "suppliers" || activeView === "qr" || activeView === "warnings") && (
            <div className="top-actions" role="group" aria-label={`Hành động cho mục ${viewTitle[0]}`}>
              {activeView === "qr" && (
                <a className="primary-btn" href="/api/qr/bulk" title="Tải toàn bộ mã QR nhà cung cấp dạng ZIP">
                  Tải ZIP toàn bộ QR
                </a>
              )}
              {(activeView === "suppliers" || activeView === "warnings") && (
                <button type="button" className="secondary-btn" onClick={exportCsv} title="Xuất danh sách nhà cung cấp và tình trạng hồ sơ">
                  Xuất danh sách CSV
                </button>
              )}
              {(activeView === "overview" || activeView === "suppliers") && (
                <button type="button" className="primary-btn" onClick={() => editSupplier()} title="Tạo hồ sơ nhà cung cấp mới">
                  + Thêm nhà cung cấp
                </button>
              )}
            </div>
          )}
        </header>
        {message && <div className="notice" role="status" aria-live="polite">{message}</div>}
        <div className={`stat-grid admin-view ${activeView === "overview" ? "" : "is-hidden"}`} id="dashboard" aria-label="Chỉ số tổng quan">
          <button type="button" className="stat-card primary-stat" onClick={() => { setExpiryFilter("all"); setActiveView("suppliers"); }} title="Xem toàn bộ nhà cung cấp">
            <span className="stat-symbol" aria-hidden="true">◇</span><div><span>Nhà cung cấp</span><b>{stats.total}</b><small>{stats.active} đang hoạt động</small></div>
          </button>
          <button type="button" className="stat-card good" onClick={() => { setExpiryFilter("valid"); setActiveView("suppliers"); }} title="Lọc nhà cung cấp có hồ sơ còn hiệu lực">
            <span className="stat-symbol" aria-hidden="true">✓</span><div><span>Hồ sơ hiệu lực</span><b>{stats.valid}</b><small>Đang còn giá trị</small></div>
          </button>
          <button type="button" className="stat-card warn" onClick={() => { setExpiryFilter("warning"); setActiveView("suppliers"); }} title="Lọc hồ sơ hết hạn trong vòng 90 ngày">
            <span className="stat-symbol" aria-hidden="true">!</span><div><span>Sắp hết hạn</span><b>{stats.warning}</b><small>Trong vòng 90 ngày</small></div>
          </button>
          <button type="button" className="stat-card bad" onClick={() => { setExpiryFilter("expired"); setActiveView("suppliers"); }} title="Lọc hồ sơ đã hết hạn">
            <span className="stat-symbol" aria-hidden="true">×</span><div><span>Đã hết hạn</span><b>{stats.expired}</b><small>Cần xử lý ngay</small></div>
          </button>
          <button
            type="button"
            className="stat-card neutral"
            onClick={() => { setExpiryFilter("missing"); setActiveView("suppliers"); }}
            title="Lọc nhà cung cấp chưa có hồ sơ"
          >
            <span className="stat-symbol" aria-hidden="true">＋</span><div><span>Thiếu hồ sơ</span><b>{stats.missing}</b><small>Chưa có tài liệu</small></div>
          </button>
        </div>
        <section className={`overview-detail admin-view ${activeView === "overview" ? "" : "is-hidden"}`} aria-label="Chi tiết tổng quan">
          <article className="panel system-health">
            <div className="panel-head"><div><p className="panel-kicker">DỮ LIỆU QUẢN TRỊ</p><h2>Phạm vi dữ liệu hiện có</h2></div><span className="health-online">Ảnh chụp hiện tại</span></div>
            <div className="health-list">
              <div><span>Nhà cung cấp đang hoạt động</span><b>{stats.active}/{stats.total}</b></div>
              <div><span>Nhà cung cấp đã xác minh</span><b>{stats.verified}/{stats.total}</b></div>
              <div><span>Hồ sơ được công khai</span><b>{stats.publicDocs}/{docs.length}</b></div>
              <div><span>Cảnh báo cần rà soát</span><b>{warnings.length}</b></div>
            </div>
          </article>
          <article className="panel attention-panel">
            <div className="panel-head"><div><p className="panel-kicker">CẦN CHÚ Ý</p><h2>Ưu tiên xử lý</h2></div></div>
            <div className="attention-list">
              <button type="button" onClick={() => { setExpiryFilter("missing"); setActiveView("suppliers"); }} title="Xem nhà cung cấp thiếu hồ sơ"><span className="attention-icon critical" aria-hidden="true">!</span><div><b>{stats.missing} nhà cung cấp thiếu hồ sơ</b><small>Cần bổ sung tài liệu được phép lưu trữ</small></div><strong aria-hidden="true">→</strong></button>
              <button type="button" onClick={() => { setExpiryFilter("expired"); setActiveView("suppliers"); }} title="Xem hồ sơ đã hết hạn"><span className="attention-icon danger" aria-hidden="true">×</span><div><b>{stats.expired} hồ sơ đã hết hạn</b><small>Kiểm tra và cập nhật hồ sơ thay thế</small></div><strong aria-hidden="true">→</strong></button>
              <button type="button" onClick={() => { setExpiryFilter("warning"); setActiveView("suppliers"); }} title="Xem hồ sơ sắp hết hạn"><span className="attention-icon warning" aria-hidden="true">◷</span><div><b>{stats.warning} hồ sơ sắp hết hạn</b><small>Trong khoảng cảnh báo 90 ngày</small></div><strong aria-hidden="true">→</strong></button>
              <button type="button" onClick={() => setActiveView("warnings")} title="Mở danh sách cảnh báo trùng dữ liệu"><span className="attention-icon critical" aria-hidden="true">⚠</span><div><b>{warningStats.conflicts} mã số thuế/tên trùng lặp</b><small>Đối chiếu để loại trừ lỗi ánh xạ dữ liệu</small></div><strong aria-hidden="true">→</strong></button>
            </div>
          </article>
        </section>
        <section className={`panel admin-view ${activeView === "warnings" ? "" : "is-hidden"}`} id="warnings">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">QUY TẮC TỰ ĐỘNG</p>
              <h2>{warnings.length} cảnh báo · {warningStats.critical} khẩn cấp</h2>
            </div>
          </div>
          <div className="warning-list">
            {warnings.map((warning, index) => (
              <button type="button" key={`${warning.code}-${warning.rule}-${index}`} className={`warning-row ${warning.severity}`} onClick={() => openWarning(warning)} title={`Mở hồ sơ ${warning.code} để xử lý cảnh báo`}>
                <span aria-hidden="true" className={`attention-icon ${warning.severity === "critical" ? "danger" : warning.severity === "warning" ? "warning" : "neutral"}`}>
                  {warning.severity === "critical" ? "!" : warning.severity === "warning" ? "◷" : "i"}
                </span>
                <div>
                  <b>{warning.code} · {severityLabels[warning.severity]}</b>
                  <small>{warning.message}</small>
                </div>
                <strong aria-hidden="true">→</strong>
              </button>
            ))}
            {!warnings.length && <p className="empty">Không có cảnh báo dữ liệu nào theo quy tắc hiện có.</p>}
          </div>
        </section>
        <section className={`panel admin-view ${activeView === "suppliers" ? "" : "is-hidden"}`} id="suppliers">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">DANH SÁCH</p><h2>Danh sách nhà cung cấp</h2>
              <p>
                {filtered.length} kết quả · Bộ lọc:{" "}
                {expiryFilter === "all" ? "tất cả" : expiryFilter}
              </p>
            </div>
            <div className="filters">
              <input
                className="search"
                placeholder="Tìm mã, tên, sản phẩm…"
                aria-label="Tìm nhà cung cấp theo mã, tên hoặc sản phẩm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="Lọc theo loại hồ sơ"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Mọi loại hồ sơ</option>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setExpiryFilter("all");
                  setCategoryFilter("all");
                }}
                title="Xóa toàn bộ bộ lọc nhà cung cấp"
              >
                Xóa lọc
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Nhà cung cấp</th>
                  <th>Sản phẩm</th>
                  <th>Đối chiếu</th>
                  <th>Hồ sơ</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Mã NCC"><span className="supplier-code">{s.code}</span></td>
                    <td data-label="Nhà cung cấp"><strong className="supplier-name">{s.name}</strong></td>
                    <td data-label="Sản phẩm"><span className="product-name">{s.productName || "Cần đối chiếu"}</span></td>
                    <td data-label="Đối chiếu">
                      <span
                        className={`review ${s.verificationStatus.toLowerCase()}`}
                      >
                        {verificationLabels[s.verificationStatus] ||
                          s.verificationStatus}
                      </span>
                    </td>
                    <td data-label="Hồ sơ">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => openDocuments(s)}
                        title={`Quản lý hồ sơ của ${s.code}`}
                      >
                        {s.documents.length} hồ sơ
                      </button>
                    </td>
                    <td data-label="Trạng thái">
                      <span className={`status ${s.status.toLowerCase()}`}>
                        {s.status === "ACTIVE" ? "Hoạt động" : "Tạm ngừng"}
                      </span>
                    </td>
                    <td className="actions" data-label="Thao tác">
                      <a href={`/qr/${s.code}`} target="_blank" rel="noopener noreferrer" title={`Mở trang truy xuất công khai của ${s.code}`}>
                        Xem trang
                      </a>
                      <button type="button" onClick={() => editSupplier(s)} title={`Chỉnh sửa thông tin ${s.code}`}>Chỉnh sửa</button>
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => archiveSupplier(s)}
                        disabled={s.status !== "ACTIVE"}
                        title={s.status === "ACTIVE" ? `Tạm ngừng ${s.code} nhưng vẫn giữ dữ liệu và URL QR` : `${s.code} hiện đã tạm ngừng`}
                      >
                        {s.status === "ACTIVE" ? "Tạm ngừng" : "Đã tạm ngừng"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="empty">Không có nhà cung cấp phù hợp bộ lọc.</p>
            )}
          </div>
        </section>
        <section className={`qr-workspace admin-view ${activeView === "qr" ? "" : "is-hidden"}`}>
          <div className="module-toolbar"><div><p className="panel-kicker">MÃ TRUY XUẤT</p><h2>{suppliers.length} mã QR nhà cung cấp</h2><p>Mỗi QR được tạo tự động từ URL cố định của nhà cung cấp.</p></div></div>
          <div className="qr-gallery admin-qr-gallery">
            {suppliers.map((supplier) => (
              <article className="qr-gallery-card" key={supplier.code}>
                <div className="qr-image-wrap"><img src={`/api/qr/${supplier.code}?format=png`} alt={`Mã QR truy xuất nhà cung cấp ${supplier.code}`} /></div>
                <div className="qr-card-copy">
                  <div><b>{supplier.code}</b><span className={`status ${supplier.status.toLowerCase()}`}>{supplier.status === "ACTIVE" ? "Hoạt động" : "Tạm ngừng"}</span></div>
                  <h2>{supplier.productName || "Sản phẩm đang đối chiếu"}</h2>
                  <p>{supplier.name}</p>
                  <code>{`${(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "")}/qr/${supplier.code}`}</code>
                </div>
                <div className="qr-card-actions" aria-label={`Tác vụ mã QR ${supplier.code}`}>
                  <a href={`/api/qr/${supplier.code}?format=png&download=1`} title={`Tải mã QR ${supplier.code} định dạng PNG`}>Tải PNG</a>
                  <a href={`/api/qr/${supplier.code}?format=svg&download=1`} title={`Tải mã QR ${supplier.code} định dạng SVG`}>Tải SVG</a>
                  <a href={`/admin/print/${supplier.code}`} target="_blank" rel="noopener noreferrer" title={`Mở mẫu in tem ${supplier.code}`}>In tem</a>
                  <a href={`/qr/${supplier.code}`} target="_blank" rel="noopener noreferrer" title={`Mở trang truy xuất ${supplier.code}`}>Mở trang</a>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className={`panel audit-panel admin-view ${activeView === "audit" ? "" : "is-hidden"}`} id="audit">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">HOẠT ĐỘNG</p><h2>Nhật ký cập nhật</h2>
              <p>20 hoạt động gần nhất</p>
            </div>
          </div>
          {auditLogs.length ? (
            auditLogs.map((log) => (
              <div className="audit-row" key={log.id}>
                <span>{log.summary}</span>
                <time>{new Date(log.createdAt).toLocaleString("vi-VN")}</time>
              </div>
            ))
          ) : (
            <p className="empty">Chưa có hoạt động chỉnh sửa.</p>
          )}
        </section>
        <section className={`admin-view ${activeView === "batches" ? "" : "is-hidden"}`} aria-label="Không gian quản lý lô nhập hàng">
          {activeView === "batches" && <TraceWorkspace />}
        </section>
        <section className={`admin-view ${activeView === "settings" ? "" : "is-hidden"}`} aria-label="Cài đặt hệ thống">
          <div className="admin-settings-tabs" role="tablist" aria-label="Nhóm cài đặt">
            <button id="settings-tab-account" aria-controls="settings-panel-account" type="button" role="tab" aria-selected={settingsTab === "account"} className={settingsTab === "account" ? "active" : ""} onClick={() => setSettingsTab("account")}>Tài khoản</button>
            <button id="settings-tab-ai" aria-controls="settings-panel-ai" type="button" role="tab" aria-selected={settingsTab === "ai"} className={settingsTab === "ai" ? "active" : ""} onClick={() => setSettingsTab("ai")}>Cấu hình AI</button>
            <button id="settings-tab-hanoicheck" aria-controls="settings-panel-hanoicheck" type="button" role="tab" aria-selected={settingsTab === "hanoicheck"} className={settingsTab === "hanoicheck" ? "active" : ""} onClick={() => setSettingsTab("hanoicheck")}>Kết nối HanoiCheck</button>
          </div>
          <div id={`settings-panel-${settingsTab}`} role="tabpanel" aria-labelledby={`settings-tab-${settingsTab}`} tabIndex={0}>
            {settingsTab === "account" && <AccountSettingsForm username={adminUsername} />}
            {settingsTab === "ai" && <AiSettingsForm />}
            {settingsTab === "hanoicheck" && <HanoiCheckSettingsForm />}
          </div>
        </section>
      </section>

      {showSupplierForm && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={saveSupplier} role="dialog" aria-modal="true" aria-labelledby="supplier-dialog-title">
            <div className="modal-head">
              <h2 id="supplier-dialog-title">{selected ? "Chỉnh sửa nhà cung cấp" : "Thêm nhà cung cấp"}</h2>
              <button type="button" onClick={() => setShowSupplierForm(false)} aria-label="Đóng biểu mẫu nhà cung cấp" title="Đóng">
                ×
              </button>
            </div>
            <div className="form-grid">
              {[
                ["code", "Mã NCC"],
                ["name", "Tên nhà cung cấp"],
                ["productName", "Nhóm sản phẩm"],
                ["taxCode", "Mã số thuế"],
                ["address", "Địa chỉ"],
                ["phone", "Hotline"],
                ["website", "Website"],
                ["email", "Email"],
                ["description", "Giới thiệu công ty"],
                ["storage", "Bảo quản"],
                ["shelfLife", "Hạn sử dụng"],
                ["notes", "Ghi chú"],
              ].map(([key, label]) => (
                <label
                  className={
                    ["name", "address", "description", "notes"].includes(key) ? "wide" : ""
                  }
                  key={key}
                >
                  {label}
                  {key === "description"
                    ? <textarea rows={3} value={supplierForm[key] || ""} onChange={(e) => setSupplierForm({ ...supplierForm, [key]: e.target.value })} />
                    : <input
                        type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                        autoComplete={key === "email" ? "email" : key === "phone" ? "tel" : key === "website" ? "url" : "off"}
                        value={supplierForm[key] || ""}
                        disabled={Boolean(selected) && key === "code"}
                        onChange={(e) =>
                          setSupplierForm({
                            ...supplierForm,
                            [key]: e.target.value,
                          })
                        }
                        required={key === "code" || key === "name"}
                      />}
                </label>
              ))}
              <div className="form-section-title wide"><span>EN</span><div><b>Nội dung tiếng Anh</b><small>Chỉ nhập bản dịch đã được kiểm tra</small></div></div>
              <div className="wide ai-translate"><button type="button" className="secondary-btn" disabled={busy} onClick={draftTranslation}>AI gợi ý bản dịch EN</button><small>Chỉ dịch sản phẩm, bảo quản, hạn sử dụng và ghi chú. Tên pháp nhân, địa chỉ giữ nguyên để tránh sai thông tin pháp lý.</small></div>
              {[
                ["nameEn", "Supplier name (English)"],
                ["productNameEn", "Product group (English)"],
                ["addressEn", "Address (English)"],
                ["descriptionEn", "Company intro (English)"],
                ["storageEn", "Storage conditions (English)"],
                ["shelfLifeEn", "Shelf life (English)"],
                ["notesEn", "Public notes (English)"],
              ].map(([key,label])=><label className={["nameEn","addressEn","descriptionEn","notesEn"].includes(key)?"wide":""} key={key}>{label}{key==="descriptionEn"?<textarea rows={3} value={supplierForm[key]||""} onChange={e=>setSupplierForm({...supplierForm,[key]:e.target.value})}/>:<input value={supplierForm[key]||""} onChange={e=>setSupplierForm({...supplierForm,[key]:e.target.value})}/>}</label>)}
              <label>
                Trạng thái
                <select
                  value={supplierForm.status}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, status: e.target.value })
                  }
                >
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="INACTIVE">Tạm ngừng</option>
                </select>
              </label>
              <label>
                Đối chiếu dữ liệu
                <select
                  value={supplierForm.verificationStatus}
                  onChange={(e) =>
                    setSupplierForm({
                      ...supplierForm,
                      verificationStatus: e.target.value,
                    })
                  }
                >
                  <option value="PENDING">Đang đối chiếu</option>
                  <option value="VERIFIED">Đã xác minh</option>
                  <option value="NEEDS_REVIEW">Cần rà soát</option>
                </select>
              </label>
            </div>
            {message && <p className="form-error" role="alert">{message}</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setShowSupplierForm(false)} title="Hủy và đóng biểu mẫu">
                Hủy
              </button>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? "Đang lưu…" : selected ? "Lưu thay đổi" : "Thêm nhà cung cấp"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && !showSupplierForm && (
        <div className="modal-backdrop">
          <div className="modal document-modal" role="dialog" aria-modal="true" aria-labelledby="documents-dialog-title">
            <div className="modal-head">
              <div>
                <h2 id="documents-dialog-title">Hồ sơ nhà cung cấp {selected.code}</h2>
                <p>{selected.name}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Đóng quản lý hồ sơ" title="Đóng">×</button>
            </div>
            <div className="document-toolbar">
              <span>
                {selected.documents.length} hồ sơ ·{" "}
                {selected.documents.filter((d) => d.isPublic).length} công khai
              </span>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setEditingDocument(null);
                  setDocFields(emptyDocFields);
                  setAiSuggestion(null);
                  setShowDocumentForm(true);
                }}
                title={`Thêm hồ sơ cho ${selected.code}`}
              >
                + Thêm hồ sơ
              </button>
            </div>
            {message && <div className="notice" role="status" aria-live="polite">{message}</div>}
            <div className="document-list">
              {selected.documents.map((d) => {
                const state = expiry(d.expiresAt);
                return (
                  <div className="document-admin" key={d.id}>
                    <div className="document-main">
                      <span className="file-icon" aria-hidden="true">▤</span>
                      <div>
                        <b>{d.title}</b>
                        <span>
                          {categoryLabels[d.category] || d.category} ·{" "}
                          <em className={state.key}>{state.label}</em>
                        </span>
                        <small>
                          {d.isPublic ? "✓ Đang công khai" : "○ Chỉ nội bộ"}
                          {d.versions.length
                            ? ` · ${d.versions.length} phiên bản cũ`
                            : ""}
                        </small>
                        {d.versions.length > 0 && (
                          <details className="version-history">
                            <summary>Lịch sử tệp</summary>
                            {d.versions.map((version) => (
                              <a
                                href={version.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                key={version.id}
                              >
                                {new Date(version.createdAt).toLocaleString(
                                  "vi-VN",
                                )} · {version.note || "Phiên bản cũ"}
                              </a>
                            ))}
                          </details>
                        )}
                      </div>
                    </div>
                    <div className="document-actions">
                      <button type="button" onClick={() => setPreviewUrl(d.fileUrl)} title={`Xem trước ${d.title}`}>
                        Xem trước
                      </button>
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" title={`Mở tệp ${d.title} trong cửa sổ mới`}>
                        Mở tệp
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDocument(d);
                          setDocFields({ title: d.title, category: d.category, issuedAt: d.issuedAt?.slice(0, 10) || "", expiresAt: d.expiresAt?.slice(0, 10) || "" });
                          setAiSuggestion(null);
                          setShowDocumentForm(true);
                        }}
                        title={`Chỉnh sửa ${d.title}`}
                      >
                        Chỉnh sửa
                      </button>
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => removeDocument(d)}
                        title={`Xóa hồ sơ ${d.title}`}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                );
              })}
              {!selected.documents.length && (
                <p className="empty">
                  Chưa có hồ sơ. Chỉ tải lên tài liệu Sunfood có quyền lưu và
                  công bố.
                </p>
              )}
            </div>
            {showDocumentForm && (
              <form
                className="document-form edit-panel"
                key={editingDocument?.id || "new"}
                ref={documentFormRef}
                onSubmit={saveDocument}
              >
                <div className="subhead">
                  <h3>{editingDocument ? "Sửa hồ sơ" : "Thêm hồ sơ"}</h3>
                  <button
                    type="button"
                    onClick={() => setShowDocumentForm(false)}
                    title="Đóng biểu mẫu hồ sơ"
                  >
                    Đóng
                  </button>
                </div>
                <label>
                  Tiêu đề
                  <input
                    name="title"
                    value={docFields.title}
                    onChange={(event) => setDocFields((current) => ({ ...current, title: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  English title
                  <input name="titleEn" defaultValue={editingDocument?.titleEn || ""} placeholder="Optional verified translation" />
                </label>
                <label>
                  Phân loại
                  <select
                    name="category"
                    value={docFields.category}
                    onChange={(event) => setDocFields((current) => ({ ...current, category: event.target.value }))}
                  >
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Ngày cấp
                    <input
                      name="issuedAt"
                      type="date"
                      value={docFields.issuedAt}
                      onChange={(event) => setDocFields((current) => ({ ...current, issuedAt: event.target.value }))}
                    />
                  </label>
                  <label>
                    Ngày hết hạn
                    <input
                      name="expiresAt"
                      type="date"
                      value={docFields.expiresAt}
                      onChange={(event) => setDocFields((current) => ({ ...current, expiresAt: event.target.value }))}
                    />
                  </label>
                </div>
                <label>
                  {editingDocument
                    ? "Tệp thay thế (không bắt buộc)"
                    : "Tệp PDF/JPG/PNG (tối đa 10 MB)"}
                  <input
                    name="file"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    required={!editingDocument}
                  />
                </label>
                <div className="ai-document-tools">
                  <label className="check-label"><input name="aiConsent" type="checkbox" /><span>Tôi xác nhận Sunfood có quyền gửi tệp này đến dịch vụ AI để phân tích; kết quả chỉ là bản nháp nội bộ.</span></label>
                  <button type="button" className="secondary-btn" disabled={aiBusy || busy} onClick={analyzeDocument}>{aiBusy ? 'Đang đọc hồ sơ…' : 'AI đọc & đối chiếu hồ sơ'}</button>
                  {aiSuggestion && (
                    <div className="ai-document-result">
                      <b>Đề xuất cần kiểm tra — chấp nhận từng trường, không tự điền hàng loạt</b>
                      <div className="ai-field-review">
                        <div className="ai-field-row ai-field-head"><span>Trường</span><span>Đang nhập</span><span>AI đề xuất</span><span /></div>
                        {(["title", "category", "issuedAt", "expiresAt"] as DocFieldKey[]).map((key) => {
                          const proposedRaw = aiSuggestion[key];
                          const currentRaw = docFields[key];
                          const proposedLabel = key === "category" ? (proposedRaw ? categoryLabels[proposedRaw] || proposedRaw : null) : proposedRaw;
                          const currentLabel = key === "category" ? categoryLabels[currentRaw] || currentRaw : currentRaw;
                          const differs = Boolean(proposedRaw) && proposedRaw !== currentRaw;
                          const confidence = aiSuggestion.confidence[key];
                          return (
                            <div className={`ai-field-row${differs ? " conflict" : ""}`} key={key}>
                              <span className="ai-field-label">{docFieldLabels[key]}</span>
                              <span>{currentLabel || "—"}</span>
                              <span>
                                {proposedLabel || "Không đọc được"}
                                {confidence && <em className={`confidence-badge ${confidence.toLowerCase()}`}>{confidenceLabels[confidence]}</em>}
                              </span>
                              <button type="button" className="secondary-btn" disabled={!differs} onClick={() => applyField(key)}>
                                {differs ? "Chấp nhận" : "Khớp"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <p>Số hồ sơ trên tài liệu: {aiSuggestion.documentNumber || "—"} · Đơn vị ghi trên tài liệu: {aiSuggestion.supplierName || "—"} · MST: {aiSuggestion.taxCode || "—"}</p>
                      {aiSuggestion.evidence && <small>Trích dẫn nhìn thấy trên tệp: “{aiSuggestion.evidence}”</small>}
                      {aiSuggestion.warnings.length > 0 && (
                        <ul className="ai-warnings">
                          {aiSuggestion.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <label className="check-label">
                  <input
                    name="isPublic"
                    type="checkbox"
                    defaultChecked={editingDocument?.isPublic || false}
                  />
                  <span>Cho phép hiển thị hồ sơ này trên trang public</span>
                </label>
                <p className="privacy-note">
                  Chỉ bật công khai khi Sunfood đã xác nhận quyền lưu trữ và
                  công bố tài liệu.
                </p>
                <button type="submit" className="primary-btn" disabled={busy}>
                  {busy
                    ? "Đang lưu…"
                    : editingDocument
                      ? "Lưu hồ sơ"
                      : "Tải lên & lưu"}
                </button>
              </form>
            )}
            <div className="qr-tools">
              <h3>Mã QR chuẩn</h3>
              <img className="qr-preview" src={`/api/qr/${selected.code}?format=png`} alt={`Mã QR ${selected.code}`} />
              <code>{`${(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "")}/qr/${selected.code}`}</code>
              <div>
                <a
                  className="secondary-btn"
                  href={`/api/qr/${selected.code}?format=png&download=1`}
                  title={`Tải mã QR ${selected.code} định dạng PNG`}
                >
                  Tải PNG
                </a>
                <a
                  className="secondary-btn"
                  href={`/api/qr/${selected.code}?format=svg&download=1`}
                  title={`Tải mã QR ${selected.code} định dạng SVG`}
                >
                  Tải SVG
                </a>
                <a
                  className="secondary-btn"
                  href={`/admin/print/${selected.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Mở mẫu in tem ${selected.code}`}
                >
                  In tem A6/A5
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      {previewUrl && (
        <div className="modal-backdrop preview-backdrop">
          <div className="modal preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-dialog-title">
            <div className="modal-head">
              <h2 id="preview-dialog-title">Xem trước hồ sơ</h2>
              <button type="button" onClick={() => setPreviewUrl(null)} aria-label="Đóng cửa sổ xem trước" title="Đóng">×</button>
            </div>
            {/\.pdf(?:\?|$)/i.test(previewUrl) ? (
              <iframe src={previewUrl} title="Xem trước PDF" />
            ) : (
              <img src={previewUrl} alt="Xem trước hồ sơ" />
            )}
            <a className="secondary-btn" href={previewUrl} target="_blank" rel="noopener noreferrer" title="Mở tệp trong cửa sổ mới">
              Mở trong cửa sổ mới
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
