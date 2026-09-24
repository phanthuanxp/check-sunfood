export type ProductionStepKey = 'RECEIVING' | 'PREP' | 'SORTING' | 'PACKING' | 'SHIPPING';

export const PRODUCTION_STEPS: { key: ProductionStepKey; title: string; description: string }[] = [
  { key: 'RECEIVING', title: 'Nhập hàng', description: 'Nhà cung cấp nhập hàng đến kho của Sunfood Tây Đô.' },
  { key: 'PREP', title: 'Sơ chế', description: 'Đội ngũ nhân viên của Sunfood tiếp nhận và sơ chế tại kho hàng theo đơn hàng.' },
  { key: 'SORTING', title: 'Phân loại', description: 'Phân loại thực phẩm theo đơn hàng tại kho của Sunfood Tây Đô.' },
  { key: 'PACKING', title: 'Đóng gói', description: 'Đóng gói thực phẩm theo đơn hàng tại kho Sunfood Tây Đô.' },
  { key: 'SHIPPING', title: 'Vận chuyển', description: 'Nhân viên vận chuyển của Sunfood Tây Đô tiếp nhận đơn hàng và vận chuyển đến khách hàng.' },
];

const STAFF_POOL = [
  { name: 'Bùi Đức Thắng', role: 'Nhân viên kho' },
  { name: 'Bùi Lai Tín', role: 'Nhân viên' },
  { name: 'Nguyễn Thị Hồng', role: 'Nhân viên' },
  { name: 'Đặng Văn Tam', role: 'Nhân viên' },
  { name: 'Nguyễn Văn Đông', role: 'Nhân viên vận chuyển' },
  { name: 'Trần Thị Lan', role: 'Nhân viên kho' },
  { name: 'Lê Văn Hùng', role: 'Nhân viên' },
  { name: 'Phạm Thị Mai', role: 'Nhân viên' },
];

export function randomStaff() {
  return STAFF_POOL[Math.floor(Math.random() * STAFF_POOL.length)];
}
