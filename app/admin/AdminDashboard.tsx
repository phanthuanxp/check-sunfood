"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Route-handler download links must remain native anchors. */
/* eslint-disable @next/next/no-img-element -- QR and uploaded-document previews are dynamic API resources. */

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

const emptySupplier = {
  code: "",
  name: "",
  nameEn: "",
  productName: "",
  productNameEn: "",
  address: "",
  addressEn: "",
  taxCode: "",
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

type AdminView = "overview" | "suppliers" | "qr" | "audit";

export default function AdminDashboard({
  initialSuppliers,
  auditLogs,
  initialView = "overview",
}: {
  initialSuppliers: Supplier[];
  auditLogs: Audit[];
  initialView?: AdminView;
}) {
  const router = useRouter();
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
    overview: ["Tổng quan", "Theo dõi sức khỏe dữ liệu và hoạt động toàn hệ thống."],
    suppliers: ["Quản lý nhà cung cấp", "Xem, chỉnh sửa, cập nhật hồ sơ và trạng thái từng nhà cung cấp."],
    qr: ["Thư viện mã QR", "Quản lý và tải mã truy xuất riêng của từng nhà cung cấp."],
    audit: ["Nhật ký hoạt động", "Theo dõi các thay đổi dữ liệu gần nhất trong hệ thống."],
  }[activeView];

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" className="admin-logo">
          <span>SF</span>
          <div><b>Sunfood Tây Đô</b><small>Traceability Console</small></div>
        </a>
        <p className="sidebar-label">QUẢN LÝ</p>
        <nav>
          <button className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")}>
            <span>⌂</span><b>Tổng quan</b>
          </button>
          <button className={activeView === "suppliers" ? "active" : ""} onClick={() => setActiveView("suppliers")}><span>◇</span><b>Nhà cung cấp</b></button>
          <button className={activeView === "qr" ? "active" : ""} onClick={() => setActiveView("qr")}><span>▦</span><b>Thư viện QR</b></button>
          <button className={activeView === "audit" ? "active" : ""} onClick={() => setActiveView("audit")}><span>◷</span><b>Nhật ký</b></button>
        </nav>
        <div className="sidebar-account"><div className="admin-avatar">A</div><div><b>Quản trị viên</b><small>Administrator</small></div><button onClick={logout} title="Đăng xuất">↪</button></div>
      </aside>
      <section className="admin-content">
        <header className="admin-top">
          <div>
            <p className="admin-breadcrumb">Trang quản trị <span>/</span> {viewTitle[0]}</p>
            <h1>{viewTitle[0]}</h1>
            <p className="admin-subtitle">{viewTitle[1]}</p>
          </div>
          <div className="top-actions">
            <a className="secondary-btn" href="/api/qr/bulk">
              Tải toàn bộ QR
            </a>
            <button className="secondary-btn" onClick={exportCsv}>
              Xuất CSV
            </button>
            <button className="primary-btn" onClick={() => editSupplier()}>
              + Thêm NCC
            </button>
          </div>
        </header>
        {message && <div className="notice">{message}</div>}
        <div className={`stat-grid admin-view ${activeView === "overview" ? "" : "is-hidden"}`} id="dashboard">
          <button className="stat-card primary-stat" onClick={() => { setExpiryFilter("all"); setActiveView("suppliers"); }}>
            <span className="stat-symbol">◇</span><div><span>Nhà cung cấp</span><b>{stats.total}</b><small>Tổng số đang quản lý</small></div>
          </button>
          <button className="stat-card good" onClick={() => { setExpiryFilter("valid"); setActiveView("suppliers"); }}>
            <span className="stat-symbol">✓</span><div><span>Hồ sơ hiệu lực</span><b>{stats.valid}</b><small>Đang còn giá trị</small></div>
          </button>
          <button className="stat-card warn" onClick={() => { setExpiryFilter("warning"); setActiveView("suppliers"); }}>
            <span className="stat-symbol">!</span><div><span>Sắp hết hạn</span><b>{stats.warning}</b><small>Trong vòng 90 ngày</small></div>
          </button>
          <button className="stat-card bad" onClick={() => { setExpiryFilter("expired"); setActiveView("suppliers"); }}>
            <span className="stat-symbol">×</span><div><span>Đã hết hạn</span><b>{stats.expired}</b><small>Cần xử lý ngay</small></div>
          </button>
          <button
            className="stat-card neutral"
            onClick={() => { setExpiryFilter("missing"); setActiveView("suppliers"); }}
          >
            <span className="stat-symbol">＋</span><div><span>Thiếu hồ sơ</span><b>{stats.missing}</b><small>Chưa có tài liệu</small></div>
          </button>
        </div>
        <section className={`overview-detail admin-view ${activeView === "overview" ? "" : "is-hidden"}`}>
          <article className="panel system-health"><div className="panel-head"><div><p className="panel-kicker">HỆ THỐNG</p><h2>Tình trạng dữ liệu</h2></div><span className="health-online">● Hoạt động ổn định</span></div><div className="health-list"><div><span>Cơ sở dữ liệu</span><b>SQLite localhost</b></div><div><span>Nhà cung cấp đã xác minh</span><b>{stats.verified}/{stats.total}</b></div><div><span>Hồ sơ được công khai</span><b>{stats.publicDocs}/{docs.length}</b></div><div><span>URL QR ổn định</span><b>NCC-01 → NCC-23</b></div></div></article>
          <article className="panel attention-panel"><div className="panel-head"><div><p className="panel-kicker">CẦN CHÚ Ý</p><h2>Ưu tiên xử lý</h2></div></div><div className="attention-list"><button onClick={() => { setExpiryFilter("missing"); setActiveView("suppliers"); }}><span className="attention-icon critical">!</span><div><b>{stats.missing} nhà cung cấp thiếu hồ sơ</b><small>Cần bổ sung tài liệu được phép lưu trữ</small></div><strong>→</strong></button><button onClick={() => { setExpiryFilter("expired"); setActiveView("suppliers"); }}><span className="attention-icon danger">×</span><div><b>{stats.expired} hồ sơ đã hết hạn</b><small>Kiểm tra và cập nhật hồ sơ thay thế</small></div><strong>→</strong></button><button onClick={() => { setExpiryFilter("warning"); setActiveView("suppliers"); }}><span className="attention-icon warning">◷</span><div><b>{stats.warning} hồ sơ sắp hết hạn</b><small>Trong khoảng cảnh báo 90 ngày</small></div><strong>→</strong></button></div></article>
        </section>
        <section className={`panel admin-view ${activeView === "suppliers" ? "" : "is-hidden"}`} id="suppliers">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">DANH SÁCH</p><h2>Nhà cung cấp</h2>
              <p>
                {filtered.length} kết quả · Bộ lọc:{" "}
                {expiryFilter === "all" ? "tất cả" : expiryFilter}
              </p>
            </div>
            <div className="filters">
              <input
                className="search"
                placeholder="Tìm mã, tên, sản phẩm…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
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
                onClick={() => {
                  setQuery("");
                  setExpiryFilter("all");
                  setCategoryFilter("all");
                }}
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
                        className="link-btn"
                        onClick={() => openDocuments(s)}
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
                      <a href={`/qr/${s.code}`} target="_blank">
                        Xem
                      </a>
                      <button onClick={() => editSupplier(s)}>Sửa</button>
                      <button
                        className="danger-link"
                        onClick={() => archiveSupplier(s)}
                      >
                        Tạm ngừng
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
          <div className="module-toolbar"><div><p className="panel-kicker">MÃ TRUY XUẤT</p><h2>{suppliers.length} mã QR nhà cung cấp</h2><p>Mỗi QR được tạo tự động từ URL cố định của nhà cung cấp.</p></div><a className="primary-btn" href="/api/qr/bulk">Tải ZIP toàn bộ</a></div>
          <div className="qr-gallery admin-qr-gallery">{suppliers.map(s=><article className="qr-gallery-card" key={s.code}><div className="qr-image-wrap"><img src={`/api/qr/${s.code}?format=png`} alt={`Mã QR ${s.code}`}/></div><div className="qr-card-copy"><div><b>{s.code}</b><span className={`status ${s.status.toLowerCase()}`}>{s.status==='ACTIVE'?'Hoạt động':'Tạm ngừng'}</span></div><h2>{s.productName||'Sản phẩm đang đối chiếu'}</h2><p>{s.name}</p><code>{`${(process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000").replace(/\/$/,"")}/qr/${s.code}`}</code></div><div className="qr-card-actions"><a href={`/api/qr/${s.code}?format=png&download=1`}>PNG</a><a href={`/api/qr/${s.code}?format=svg&download=1`}>SVG</a><a href={`/admin/print/${s.code}`} target="_blank">In tem</a><a href={`/qr/${s.code}`} target="_blank">Mở trang</a></div></article>)}</div>
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
      </section>

      {showSupplierForm && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={saveSupplier}>
            <div className="modal-head">
              <h2>{selected ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}</h2>
              <button type="button" onClick={() => setShowSupplierForm(false)}>
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
                ["storage", "Bảo quản"],
                ["shelfLife", "Hạn sử dụng"],
                ["notes", "Ghi chú"],
              ].map(([key, label]) => (
                <label
                  className={
                    ["name", "address", "notes"].includes(key) ? "wide" : ""
                  }
                  key={key}
                >
                  {label}
                  <input
                    value={supplierForm[key] || ""}
                    disabled={Boolean(selected) && key === "code"}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        [key]: e.target.value,
                      })
                    }
                    required={key === "code" || key === "name"}
                  />
                </label>
              ))}
              <div className="form-section-title wide"><span>EN</span><div><b>Nội dung tiếng Anh</b><small>Chỉ nhập bản dịch đã được kiểm tra</small></div></div>
              {[
                ["nameEn", "Supplier name (English)"],
                ["productNameEn", "Product group (English)"],
                ["addressEn", "Address (English)"],
                ["storageEn", "Storage conditions (English)"],
                ["shelfLifeEn", "Shelf life (English)"],
                ["notesEn", "Public notes (English)"],
              ].map(([key,label])=><label className={["nameEn","addressEn","notesEn"].includes(key)?"wide":""} key={key}>{label}<input value={supplierForm[key]||""} onChange={e=>setSupplierForm({...supplierForm,[key]:e.target.value})}/></label>)}
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
            {message && <p className="form-error">{message}</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setShowSupplierForm(false)}>
                Hủy
              </button>
              <button className="primary-btn" disabled={busy}>
                {busy ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && !showSupplierForm && (
        <div className="modal-backdrop">
          <div className="modal document-modal">
            <div className="modal-head">
              <div>
                <h2>Hồ sơ {selected.code}</h2>
                <p>{selected.name}</p>
              </div>
              <button onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="document-toolbar">
              <span>
                {selected.documents.length} hồ sơ ·{" "}
                {selected.documents.filter((d) => d.isPublic).length} công khai
              </span>
              <button
                className="primary-btn"
                onClick={() => {
                  setEditingDocument(null);
                  setShowDocumentForm(true);
                }}
              >
                + Thêm hồ sơ
              </button>
            </div>
            {message && <div className="notice">{message}</div>}
            <div className="document-list">
              {selected.documents.map((d) => {
                const state = expiry(d.expiresAt);
                return (
                  <div className="document-admin" key={d.id}>
                    <div className="document-main">
                      <span className="file-icon">▤</span>
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
                      <button onClick={() => setPreviewUrl(d.fileUrl)}>
                        Xem trước
                      </button>
                      <a href={d.fileUrl} target="_blank">
                        Mở
                      </a>
                      <button
                        onClick={() => {
                          setEditingDocument(d);
                          setShowDocumentForm(true);
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        className="danger-link"
                        onClick={() => removeDocument(d)}
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
                onSubmit={saveDocument}
              >
                <div className="subhead">
                  <h3>{editingDocument ? "Sửa hồ sơ" : "Thêm hồ sơ"}</h3>
                  <button
                    type="button"
                    onClick={() => setShowDocumentForm(false)}
                  >
                    Đóng
                  </button>
                </div>
                <label>
                  Tiêu đề
                  <input
                    name="title"
                    defaultValue={editingDocument?.title || ""}
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
                    defaultValue={
                      editingDocument?.category || "BUSINESS_LICENSE"
                    }
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
                      defaultValue={
                        editingDocument?.issuedAt?.slice(0, 10) || ""
                      }
                    />
                  </label>
                  <label>
                    Ngày hết hạn
                    <input
                      name="expiresAt"
                      type="date"
                      defaultValue={
                        editingDocument?.expiresAt?.slice(0, 10) || ""
                      }
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
                <button className="primary-btn" disabled={busy}>
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
                >
                  Tải PNG
                </a>
                <a
                  className="secondary-btn"
                  href={`/api/qr/${selected.code}?format=svg&download=1`}
                >
                  Tải SVG
                </a>
                <a
                  className="secondary-btn"
                  href={`/admin/print/${selected.code}`}
                  target="_blank"
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
          <div className="modal preview-modal">
            <div className="modal-head">
              <h2>Xem trước hồ sơ</h2>
              <button onClick={() => setPreviewUrl(null)}>×</button>
            </div>
            {/\.pdf(?:\?|$)/i.test(previewUrl) ? (
              <iframe src={previewUrl} title="Xem trước PDF" />
            ) : (
              <img src={previewUrl} alt="Xem trước hồ sơ" />
            )}
            <a className="secondary-btn" href={previewUrl} target="_blank">
              Mở trong cửa sổ mới
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
