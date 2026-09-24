import { getImageProps } from 'next/image';

const features = [
  {
    title: 'Nguồn gốc rõ ràng',
    description: 'Từ nông trại đến bàn ăn',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.7 4.3C13.2 4.5 8.6 7 6.5 11.1c-1.3 2.6-.8 5.5 1.1 7.1 1.9 1.5 4.7 1.2 6.9-.6 3.5-2.9 4.6-7.7 5.2-13.3Z" />
        <path d="M5 20c2.1-4.1 5.2-7 9.7-9.1" />
      </svg>
    ),
  },
  {
    title: 'Thực phẩm an toàn',
    description: 'Hồ sơ được kiểm soát',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.8 2.9 8.2 7 10 4.1-1.8 7-5.2 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Vì sức khỏe cộng đồng',
    description: 'Trách nhiệm bền vững',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3" />
        <circle cx="5.5" cy="10" r="2" />
        <circle cx="18.5" cy="10" r="2" />
        <path d="M6.5 19v-1.2c0-2.6 2.5-4.8 5.5-4.8s5.5 2.2 5.5 4.8V19" />
        <path d="M2.5 18v-.7c0-1.8 1.4-3.3 3.3-3.3M21.5 18v-.7c0-1.8-1.4-3.3-3.3-3.3" />
      </svg>
    ),
  },
];

export function TraceabilityHero() {
  const commonImageProps = { alt: '', sizes: '100vw' };
  const {
    props: { srcSet: desktopSrcSet },
  } = getImageProps({
    ...commonImageProps,
    src: '/images/hero/banner-sunfood-tay-do-desktop.png',
    width: 2172,
    height: 724,
  });
  const {
    props: { srcSet: mobileSrcSet },
  } = getImageProps({
    ...commonImageProps,
    src: '/images/hero/banner-sunfood-tay-do-mobile.png',
    width: 1122,
    height: 1402,
  });
  const {
    props: { srcSet: tabletSrcSet, ...tabletImageProps },
  } = getImageProps({
    ...commonImageProps,
    src: '/images/hero/check-sunfood-hero-visual.png',
    width: 1142,
    height: 724,
  });

  return (
    <section className="traceability-hero" aria-labelledby="traceability-hero-title">
      <div className="traceability-hero__ring" aria-hidden="true" />
      <div className="traceability-hero__media" aria-hidden="true">
        <div className="traceability-hero__visual-blend" />
        <picture>
          <source media="(min-width: 1181px)" srcSet={desktopSrcSet} />
          <source media="(max-width: 640px)" srcSet={mobileSrcSet} />
          <source media="(min-width: 641px) and (max-width: 1180px)" srcSet={tabletSrcSet} />
          <img {...tabletImageProps} alt="" fetchPriority="high" />
        </picture>
      </div>
      <div className="traceability-hero__inner">
        <div className="traceability-hero__content">
          <p className="traceability-hero__eyebrow">MINH BẠCH • AN TOÀN • TRÁCH NHIỆM</p>
          <h1 id="traceability-hero-title">
            <span className="traceability-hero__title-line">Kiểm tra nguồn gốc<wbr /> thực phẩm</span>
            <span className="traceability-hero__subtitle">Nhanh chóng, minh bạch, đáng tin cậy</span>
          </h1>
          <p className="traceability-hero__description">
            Quét mã QR hoặc tra cứu mã nhà cung cấp để xem thông tin nguồn gốc,
            hồ sơ pháp lý và giấy tờ kiểm định do <strong>Sunfood Tây Đô</strong> quản lý.
          </p>

          <nav className="traceability-hero__actions" aria-label="Lối tắt truy xuất">
            <a className="traceability-button traceability-button--primary" href="#danh-sach-ncc">
              Tra cứu nhà cung cấp <span aria-hidden="true">→</span>
            </a>
            <a className="traceability-button traceability-button--secondary" href="#quy-trinh">
              Xem cách kiểm tra <span aria-hidden="true">→</span>
            </a>
          </nav>

          <div className="traceability-hero__features" role="list" aria-label="Cam kết của Sunfood Tây Đô">
            {features.map((feature) => (
              <div className="traceability-feature" role="listitem" key={feature.title}>
                <span className="traceability-feature__icon">{feature.icon}</span>
                <span>
                  <strong>{feature.title}</strong>
                  <small>{feature.description}</small>
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
