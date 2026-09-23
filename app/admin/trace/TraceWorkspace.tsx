'use client';
import { useState } from 'react';
import './trace.css';
import BatchesTable from './BatchesTable';
import ImportPanel from './ImportPanel';

type Tab = 'batches' | 'import';

export default function TraceWorkspace() {
  const [tab, setTab] = useState<Tab>('batches');

  return <div className="import-workspace trace-workspace">
    <div className="admin-settings-tabs trace-subtabs">
      <button className={tab === 'batches' ? 'active' : ''} onClick={() => setTab('batches')}>Lô nhập hàng</button>
      <button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>Nhập / Đồng bộ</button>
    </div>
    {tab === 'batches' && <BatchesTable />}
    {tab === 'import' && <ImportPanel onImported={() => {}} />}
  </div>;
}
