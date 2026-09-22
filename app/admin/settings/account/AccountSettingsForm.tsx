'use client';

import LogoutButton from './LogoutButton';
import '../settings.css';

export default function AccountSettingsForm({ username }: { username: string }) {
  return <div className="hc-settings-page">
    <p className="admin-settings-tab-intro">Hệ thống hiện dùng một tài khoản quản trị chung, cấu hình qua biến môi trường trên máy chủ.</p>
    <section className="hc-settings-card">
      <div className="hc-settings-status"><b>Tên đăng nhập</b><span className="ready">{username}</span></div>
      <p>Tên đăng nhập và mật khẩu được đặt qua <code>ADMIN_USERNAME</code>/<code>ADMIN_PASSWORD</code> trong tệp môi trường của máy chủ. Để đổi mật khẩu, cập nhật hai biến này trên máy chủ rồi khởi động lại dịch vụ — đổi mật khẩu cũng tự động vô hiệu các phiên đăng nhập đã cấp trước đó.</p>
      <div className="hc-settings-actions"><LogoutButton /></div>
    </section>
  </div>;
}
