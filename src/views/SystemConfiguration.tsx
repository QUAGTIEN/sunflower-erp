import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  Building2,
  Database,
  Filter,
  LockKeyhole,
  MapPinned,
  Settings2,
  SlidersHorizontal,
  UsersRound
} from 'lucide-react';
import { CustomerFilterAdminModal } from '../components/CustomerFilterAdminModal';
import { LeadFilterAdminModal } from '../components/LeadFilterSystem';
import {
  mergeCustomerFilterDefinitions,
  type CustomerFilterDefinition
} from '../domain/customerFilterConfig';
import type { LeadFilterDefinition } from '../domain/crmModels';
import {
  compactLeadFilterDefinitionForStorage,
  LEAD_FILTER_IDS,
  mergeLeadFilterDefinitions
} from '../domain/leadFilterConfig';
import { dbService, type UserProfile } from '../services/firebaseService';
import './SystemConfiguration.css';

type ConfigurationSection = 'catalogs' | 'automatic' | 'scope';

const AUTOMATIC_SOURCES = [
  { id: 'users', name: 'Sale phụ trách', source: 'Tài khoản và phân công', icon: UsersRound },
  { id: 'locations', name: 'Tỉnh/thành, phường/xã', source: 'Danh mục địa giới hệ thống', icon: MapPinned },
  { id: 'products', name: 'Sản phẩm đã mua', source: 'Hồ sơ khách hàng và PO', icon: Building2 },
  { id: 'orders', name: 'Thời gian phát sinh PO', source: 'Ngày tạo và trạng thái đơn hàng', icon: BookOpenCheck },
  { id: 'finance', name: 'Công nợ khách hàng', source: 'Đơn hàng, hóa đơn và kế toán', icon: Database }
] as const;

const SCOPE_ROWS = [
  { name: 'Danh mục phân loại Lead', lead: true, data: true, crm: false, reports: true },
  { name: 'Tỉnh/thành và Vùng/KCN', lead: true, data: true, crm: true, reports: true },
  { name: 'Sale phụ trách', lead: true, data: true, crm: true, reports: true },
  { name: 'Hạng khách hàng', lead: false, data: false, crm: true, reports: true },
  { name: 'Sản phẩm và thời gian PO', lead: false, data: false, crm: true, reports: true }
] as const;

interface SystemConfigurationProps {
  currentUser: UserProfile;
}

export const SystemConfiguration: React.FC<SystemConfigurationProps> = ({ currentUser }) => {
  const [section, setSection] = useState<ConfigurationSection>('catalogs');
  const [storedLeadDefinitions, setStoredLeadDefinitions] = useState<LeadFilterDefinition[]>([]);
  const [storedCustomerDefinitions, setStoredCustomerDefinitions] = useState<CustomerFilterDefinition[]>([]);
  const [showLeadConfiguration, setShowLeadConfiguration] = useState(false);
  const [showCustomerConfiguration, setShowCustomerConfiguration] = useState(false);

  useEffect(() => {
    const unsubscribeLeadDefinitions = dbService.subscribeCollection('lead_filter_definitions', data => {
      setStoredLeadDefinitions(data as LeadFilterDefinition[]);
    });
    const unsubscribeCustomerDefinitions = dbService.subscribeCollection('customer_filter_definitions', data => {
      setStoredCustomerDefinitions(data as CustomerFilterDefinition[]);
    });
    return () => {
      unsubscribeLeadDefinitions();
      unsubscribeCustomerDefinitions();
    };
  }, []);

  const leadDefinitions = useMemo(
    () => mergeLeadFilterDefinitions(storedLeadDefinitions),
    [storedLeadDefinitions]
  );
  const customerDefinitions = useMemo(
    () => mergeCustomerFilterDefinitions(storedCustomerDefinitions),
    [storedCustomerDefinitions]
  );
  const activeLeadDefinitions = leadDefinitions.filter(definition => definition.active);
  const activeCustomerDefinitions = customerDefinitions.filter(definition => definition.active);
  const provinceDefinition = leadDefinitions.find(definition => definition.id === LEAD_FILTER_IDS.province);
  const configuredRegionCount = (provinceDefinition?.options || []).reduce((provinceTotal, province) => (
    provinceTotal + (province.children || []).reduce((wardTotal, ward) => (
      wardTotal + (ward.children || []).filter(region => region.active).length
    ), 0)
  ), 0);

  const saveLeadDefinition = async (definition: LeadFilterDefinition) => {
    const savedDefinition = {
      ...compactLeadFilterDefinitionForStorage(definition),
      updatedBy: currentUser.displayName,
      updatedAt: new Date().toISOString()
    };
    await dbService.addDocument('lead_filter_definitions', savedDefinition);
    setStoredLeadDefinitions(previous => [
      ...previous.filter(item => item.id !== definition.id),
      savedDefinition
    ]);
  };

  const saveCustomerDefinition = async (definition: CustomerFilterDefinition) => {
    const savedDefinition = {
      ...definition,
      updatedBy: currentUser.displayName,
      updatedAt: new Date().toISOString()
    };
    await dbService.addDocument('customer_filter_definitions', savedDefinition);
    setStoredCustomerDefinitions(previous => [
      ...previous.filter(item => item.id !== definition.id),
      savedDefinition
    ]);
  };

  return (
    <div className="system-config-view">
      <div className="page-header system-config-header">
        <div>
          <h1 className="page-title">CẤU HÌNH HỆ THỐNG</h1>
          <p>Quản lý danh mục gốc, nguồn dữ liệu tự động và phạm vi sử dụng trên toàn bộ Sunflower ERP.</p>
        </div>
        <span className="system-config-admin-badge"><LockKeyhole size={14} /> Chỉ Giám đốc/Admin</span>
      </div>

      <div className="system-config-summary" aria-label="Tổng quan cấu hình">
        <article><Filter size={18} /><div><strong>{activeLeadDefinitions.length}</strong><span>Tiêu chí phân loại gốc</span></div></article>
        <article><SlidersHorizontal size={18} /><div><strong>{activeCustomerDefinitions.length}</strong><span>Tiêu chí CRM đang dùng</span></div></article>
        <article><MapPinned size={18} /><div><strong>{configuredRegionCount}</strong><span>Vùng/KCN đã cấu hình</span></div></article>
        <article><Database size={18} /><div><strong>{AUTOMATIC_SOURCES.length}</strong><span>Nguồn đồng bộ tự động</span></div></article>
      </div>

      <div className="system-config-workspace">
        <nav className="system-config-nav" aria-label="Nhóm cấu hình hệ thống">
          <button type="button" className={section === 'catalogs' ? 'is-active' : ''} onClick={() => setSection('catalogs')}><Settings2 size={16} /><span><strong>Danh mục và bộ lọc</strong><small>Cấu hình dữ liệu phân loại gốc</small></span></button>
          <button type="button" className={section === 'automatic' ? 'is-active' : ''} onClick={() => setSection('automatic')}><Database size={16} /><span><strong>Nguồn dữ liệu tự động</strong><small>Các tiêu chí được hệ thống đồng bộ</small></span></button>
          <button type="button" className={section === 'scope' ? 'is-active' : ''} onClick={() => setSection('scope')}><BookOpenCheck size={16} /><span><strong>Phạm vi sử dụng</strong><small>Tiêu chí xuất hiện tại từng phân hệ</small></span></button>
        </nav>

        <main className="system-config-content">
          {section === 'catalogs' && (
            <>
              <div className="system-config-section-heading">
                <div><h2>Danh mục và bộ lọc dùng chung</h2><p>Chỉnh sửa tại đây để giữ cách phân loại thống nhất giữa Lead, dữ liệu khách hàng và CRM.</p></div>
              </div>
              <div className="system-config-catalog-grid">
                <article className="system-config-catalog-card">
                  <div className="system-config-catalog-card__icon"><Filter size={20} /></div>
                  <div className="system-config-catalog-card__body">
                    <div><h3>Phân loại khách hàng tiềm năng</h3><span className="system-config-source-tag is-manual">Admin cấu hình</span></div>
                    <p>Nguồn gốc cho quy mô, tiến độ, nhu cầu, tỉnh/thành, Vùng/KCN và nguồn khách hàng.</p>
                    <dl><div><dt>Đang sử dụng</dt><dd>{activeLeadDefinitions.length}/{leadDefinitions.length} tiêu chí</dd></div><div><dt>Phạm vi</dt><dd>Lead · Dữ liệu khách hàng · Báo cáo</dd></div></dl>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => setShowLeadConfiguration(true)}><Settings2 size={14} /> Cấu hình danh mục gốc</button>
                </article>

                <article className="system-config-catalog-card">
                  <div className="system-config-catalog-card__icon is-system"><SlidersHorizontal size={20} /></div>
                  <div className="system-config-catalog-card__body">
                    <div><h3>Bộ lọc khách hàng CRM</h3><span className="system-config-source-tag is-system">Dữ liệu hệ thống</span></div>
                    <p>Quản lý tên hiển thị và trạng thái sử dụng; lựa chọn được đồng bộ từ Sale, khách hàng và PO.</p>
                    <dl><div><dt>Đang sử dụng</dt><dd>{activeCustomerDefinitions.length}/{customerDefinitions.length} tiêu chí</dd></div><div><dt>Phạm vi</dt><dd>Khách hàng CRM · Báo cáo</dd></div></dl>
                  </div>
                  <button type="button" className="btn btn-outline" onClick={() => setShowCustomerConfiguration(true)}><Settings2 size={14} /> Quản lý tiêu chí CRM</button>
                </article>
              </div>
              <div className="system-config-guidance"><LockKeyhole size={16} /><div><strong>Nguyên tắc bảo toàn dữ liệu</strong><span>Đổi tên hoặc ngừng sử dụng không làm mất dữ liệu cũ. Các tiêu chí lấy từ tài khoản, PO và kế toán không thể tạo lựa chọn thủ công.</span></div></div>
            </>
          )}

          {section === 'automatic' && (
            <>
              <div className="system-config-section-heading"><div><h2>Nguồn dữ liệu tự động</h2><p>Những tiêu chí này được đăng ký tại trung tâm cấu hình nhưng giá trị phải theo dữ liệu nghiệp vụ thực tế.</p></div></div>
              <div className="system-config-source-list">
                {AUTOMATIC_SOURCES.map(source => {
                  const Icon = source.icon;
                  return <article key={source.id}><Icon size={17} /><div><strong>{source.name}</strong><span>{source.source}</span></div><span className="system-config-source-tag is-system"><LockKeyhole size={11} /> Đồng bộ tự động</span></article>;
                })}
              </div>
            </>
          )}

          {section === 'scope' && (
            <>
              <div className="system-config-section-heading"><div><h2>Phạm vi sử dụng hiện tại</h2><p>Ma trận giúp xác định một tiêu chí đang được sử dụng tại những khu vực nào của phần mềm.</p></div></div>
              <div className="system-config-scope-table">
                <table>
                  <thead><tr><th>Nhóm tiêu chí</th><th>Danh sách Lead</th><th>Dữ liệu khách hàng</th><th>Khách hàng CRM</th><th>Báo cáo</th></tr></thead>
                  <tbody>{SCOPE_ROWS.map(row => <tr key={row.name}><td>{row.name}</td>{(['lead', 'data', 'crm', 'reports'] as const).map(scope => <td key={scope}><span className={row[scope] ? 'is-enabled' : 'is-disabled'}>{row[scope] ? 'Đang dùng' : 'Không dùng'}</span></td>)}</tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>

      {showLeadConfiguration && <LeadFilterAdminModal definitions={leadDefinitions} onClose={() => setShowLeadConfiguration(false)} onSaveDefinition={saveLeadDefinition} />}
      {showCustomerConfiguration && <CustomerFilterAdminModal definitions={customerDefinitions} onClose={() => setShowCustomerConfiguration(false)} onSaveDefinition={saveCustomerDefinition} />}
    </div>
  );
};
