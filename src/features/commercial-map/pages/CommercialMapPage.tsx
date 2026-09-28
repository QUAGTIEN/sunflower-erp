import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  ChevronLeft,
  ExternalLink,
  Layers3,
  LoaderCircle,
  LocateFixed,
  MapPinned,
  Minus,
  Plus,
  RotateCcw,
  Search,
  UsersRound
} from 'lucide-react';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import type { LeadFilterDefinition, LeadFilterOption } from '@/features/crm/model/crmModels';
import type { CompatiblePORecord } from '@/domain/poCompatibility';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { SearchableLocationSelect, SearchableProvinceSelect } from '@/components/SearchableProvinceSelect';
import { PageContextHeader } from '@/components/PageContextHeader';
import { resolveVietnamProvince } from '@/data/vietnamProvinceCatalog';
import { COMMERCIAL_PROVINCES_64 } from '@/features/commercial-map/model/commercialProvinceCatalog';
import {
  compactLeadFilterDefinitionForStorage,
  LEAD_FILTER_IDS,
  mergeLeadFilterDefinitions,
  slugifyLeadFilterId
} from '@/features/crm/model/leadFilterConfig';
import {
  buildCommercialMapRecords,
  filterCommercialMapRecords,
  normalizeVietnameseText,
  resolveCommercialProvince,
  summarizeCommercialProvinces,
  type CommercialMapLayer,
  type CommercialMapRecord
} from '@/features/commercial-map/model/commercialMapModels';
import './CommercialMap.css';

interface CommercialMapProps {
  customers: CustomerRecord[];
  leads: LeadRecord[];
  orders: CompatiblePORecord[];
  deliveries: Array<Record<string, unknown>>;
  users: UserProfile[];
  currentUser: UserProfile;
  onNavigateToCrm: () => void;
  onNavigateToLeads: () => void;
}

type CommercialTab = 'provinces' | 'map';

type Coordinate = [number, number];
type PolygonCollection = Coordinate[][];

interface ProvinceGeometry {
  id: string;
  name: string;
  type: string;
  area: number;
  population: number;
  density: number;
  center: Coordinate;
  polygons: PolygonCollection;
}

interface ProvinceMapData {
  provinces: ProvinceGeometry[];
}

interface ViewBoxState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  clientX: number;
  clientY: number;
  viewBox: ViewBoxState;
}

interface CommercialMapMarker {
  record: CommercialMapRecord;
  point: Coordinate;
}

const MAP_SCALE = 50;
const MAP_MIN_LONGITUDE = 101.5;
const MAP_MAX_LATITUDE = 24;
const NATIONAL_VIEW: ViewBoxState = { x: 0, y: 0, width: 800, height: 860 };

const LAYERS: Array<{ id: CommercialMapLayer; label: string; color: string }> = [
  { id: 'all', label: 'Tất cả dữ liệu nội bộ', color: '#1d4ed8' },
  { id: 'customers', label: 'Khách hàng hợp tác', color: '#059669' },
  { id: 'leads', label: 'Khách hàng tiềm năng', color: '#7c3aed' },
  { id: 'processing', label: 'Sale đang xử lý', color: '#ea580c' },
  { id: 'unassigned', label: 'Chưa phân công', color: '#64748b' }
];

const projectCoordinate = ([longitude, latitude]: Coordinate): Coordinate => [
  (longitude - MAP_MIN_LONGITUDE) * MAP_SCALE,
  (MAP_MAX_LATITUDE - latitude) * MAP_SCALE
];

const geometryPath = (polygons: PolygonCollection): string => polygons
  .map(polygon => polygon.map((coordinate, index) => {
    const [x, y] = projectCoordinate(coordinate);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ') + ' Z')
  .join(' ');

const geometryBounds = (polygons: PolygonCollection, padding = 28, minimumSize = 90): ViewBoxState => {
  const coordinates = polygons.flat();
  if (coordinates.length === 0) return NATIONAL_VIEW;
  const projected = coordinates.map(projectCoordinate);
  const xs = projected.map(point => point[0]);
  const ys = projected.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(minimumSize, maxX - minX + padding * 2);
  const height = Math.max(minimumSize, maxY - minY + padding * 2);
  return { x: minX - padding, y: minY - padding, width, height };
};

const zoomViewBox = (viewBox: ViewBoxState, factor: number): ViewBoxState => {
  const width = Math.min(NATIONAL_VIEW.width * 1.2, Math.max(6, viewBox.width * factor));
  const height = Math.min(NATIONAL_VIEW.height * 1.2, Math.max(6, viewBox.height * factor));
  return {
    x: viewBox.x + (viewBox.width - width) / 2,
    y: viewBox.y + (viewBox.height - height) / 2,
    width,
    height
  };
};

const formatNumber = (value: number): string => value.toLocaleString('vi-VN');
const formatCurrency = (value: number): string => `${formatNumber(Math.round(value))} đ`;

const activeChildren = (option: LeadFilterOption | undefined): LeadFilterOption[] => (
  (option?.children || []).filter(child => child.active !== false)
);

const createParkId = (provinceId: string, label: string, existingIds: Set<string>): string => {
  const base = `${provinceId}__industrial_park_${slugifyLeadFilterId(label) || 'kcn'}`;
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pointInPolygon = ([x, y]: Coordinate, polygon: Coordinate[]): boolean => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [currentX, currentY] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const intersects = ((currentY > y) !== (previousY > y))
      && x < ((previousX - currentX) * (y - currentY)) / ((previousY - currentY) || Number.EPSILON) + currentX;
    if (intersects) inside = !inside;
  }
  return inside;
};

const markerPointWithinGeometry = (geometry: ProvinceGeometry, seedSource: string): Coordinate => {
  const projectedPolygons = geometry.polygons.map(polygon => polygon.map(projectCoordinate));
  const coordinates = projectedPolygons.flat();
  if (coordinates.length === 0) return projectCoordinate(geometry.center);
  const xs = coordinates.map(point => point[0]);
  const ys = coordinates.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let seed = stableHash(seedSource);

  for (let attempt = 0; attempt < 140; attempt += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = minX + (seed / 0xffffffff) * (maxX - minX);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const y = minY + (seed / 0xffffffff) * (maxY - minY);
    if (projectedPolygons.some(polygon => pointInPolygon([x, y], polygon))) return [x, y];
  }

  return projectCoordinate(geometry.center);
};

export const CommercialMap: React.FC<CommercialMapProps> = ({
  customers,
  leads,
  orders,
  deliveries,
  users,
  currentUser,
  onNavigateToCrm,
  onNavigateToLeads
}) => {
  const [activeTab, setActiveTab] = useState<CommercialTab>('provinces');
  const [candidates, setCandidates] = useState<LeadCandidateRecord[]>([]);
  const [storedFilterDefinitions, setStoredFilterDefinitions] = useState<LeadFilterDefinition[]>([]);
  const [overviewProvinceName, setOverviewProvinceName] = useState('');
  const [overviewIndustrialPark, setOverviewIndustrialPark] = useState('');
  const [showParkManagement, setShowParkManagement] = useState(false);
  const [newParkNames, setNewParkNames] = useState('');
  const [parkSaving, setParkSaving] = useState(false);
  const [parkMessage, setParkMessage] = useState('');
  const [activeLayer, setActiveLayer] = useState<CommercialMapLayer>('all');
  const [saleFilter, setSaleFilter] = useState('all');
  const [provinceData, setProvinceData] = useState<ProvinceGeometry[]>([]);
  const [selectedProvince, setSelectedProvince] = useState<ProvinceGeometry | null>(null);
  const [hoveredArea, setHoveredArea] = useState<{ name: string; total: number } | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<CommercialMapRecord | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [viewBox, setViewBox] = useState<ViewBoxState>(NATIONAL_VIEW);
  const [loadingMap, setLoadingMap] = useState(true);
  const [mapError, setMapError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => dbService.subscribeCollection('lead_candidates', data => {
    setCandidates(data as LeadCandidateRecord[]);
  }, currentUser.role === 'sale' ? {
    fieldName: 'assignedSaleId',
    fieldValue: currentUser.uid
  } : undefined), [currentUser.role, currentUser.uid]);

  useEffect(() => dbService.subscribeCollection('lead_filter_definitions', data => {
    setStoredFilterDefinitions(data as LeadFilterDefinition[]);
  }), []);

  useEffect(() => {
    let active = true;
    fetch('/map-data/provinces.json')
      .then(response => {
        if (!response.ok) throw new Error('Không thể tải dữ liệu ranh giới tỉnh/thành.');
        return response.json() as Promise<ProvinceMapData>;
      })
      .then(data => {
        if (active) setProvinceData(data.provinces);
      })
      .catch(error => {
        if (active) setMapError(error instanceof Error ? error.message : 'Không thể tải bản đồ.');
      })
      .finally(() => {
        if (active) setLoadingMap(false);
      });
    return () => { active = false; };
  }, []);

  const allRecords = useMemo(() => buildCommercialMapRecords({
    customers,
    leads,
    candidates,
    orders,
    users
  }), [candidates, customers, leads, orders, users]);

  const accessibleRecords = useMemo(() => currentUser.role === 'admin'
    ? allRecords
    : allRecords.filter(record => record.assignedSaleId === currentUser.uid), [allRecords, currentUser]);

  const layerRecords = useMemo(() => {
    const filtered = filterCommercialMapRecords(accessibleRecords, activeLayer);
    return saleFilter === 'all'
      ? filtered
      : filtered.filter(record => record.assignedSaleId === saleFilter);
  }, [accessibleRecords, activeLayer, saleFilter]);

  const provinceSummaries = useMemo(() => summarizeCommercialProvinces(layerRecords), [layerRecords]);
  const summaryByProvince = useMemo(
    () => new Map(provinceSummaries.map(summary => [summary.provinceId, summary])),
    [provinceSummaries]
  );
  const maximumProvinceTotal = Math.max(1, ...provinceSummaries.map(summary => summary.total));
  const activeLayerDefinition = LAYERS.find(layer => layer.id === activeLayer) || LAYERS[0];

  const selectedProvinceId = selectedProvince
    ? resolveCommercialProvince(selectedProvince.name).id
    : '';
  const selectedProvinceSummary = selectedProvinceId
    ? summaryByProvince.get(selectedProvinceId)
    : undefined;
  const selectedRecords = useMemo(
    () => selectedProvinceId
      ? layerRecords.filter(record => record.provinceId === selectedProvinceId)
      : [],
    [layerRecords, selectedProvinceId]
  );

  const recordMarkers = useMemo<CommercialMapMarker[]>(() => {
    if (!selectedProvince) return [];
    return selectedRecords.map(record => ({
      record,
      point: markerPointWithinGeometry(selectedProvince, record.key)
    }));
  }, [selectedProvince, selectedRecords]);

  const activeSales = useMemo(
    () => users.filter(user => user.role === 'sale' && user.active !== false),
    [users]
  );

  const filterDefinitions = useMemo(
    () => mergeLeadFilterDefinitions(storedFilterDefinitions),
    [storedFilterDefinitions]
  );
  const industrialParkDefinition = useMemo(
    () => storedFilterDefinitions.find(definition => definition.id === LEAD_FILTER_IDS.industrialPark)
      || filterDefinitions.find(definition => definition.id === LEAD_FILTER_IDS.industrialPark),
    [filterDefinitions, storedFilterDefinitions]
  );
  const overviewParkProvince = useMemo(
    () => COMMERCIAL_PROVINCES_64.find(province => province.label === overviewProvinceName),
    [overviewProvinceName]
  );
  const overviewProvince = useMemo(
    () => resolveVietnamProvince(overviewProvinceName)?.province,
    [overviewProvinceName]
  );
  const overviewProvinceRecords = useMemo(() => {
    if (!overviewProvince) return [];
    return accessibleRecords.filter(record => (
      record.provinceId === overviewProvince.id
      && (!overviewIndustrialPark || normalizeVietnameseText(record.industrialPark) === normalizeVietnameseText(overviewIndustrialPark))
    ));
  }, [accessibleRecords, overviewIndustrialPark, overviewProvince]);
  const overviewDeliveries = useMemo(() => {
    if (!overviewProvince) return [];
    const activeStatuses = new Set(['planning', 'approved', 'loading', 'delivering']);
    return deliveries.filter(delivery => {
      if (currentUser.role !== 'admin' && delivery.assignedSaleId !== currentUser.uid) return false;
      if (!activeStatuses.has(String(delivery.status || ''))) return false;
      const resolved = resolveCommercialProvince(
        String(delivery.region || ''),
        JSON.stringify(delivery.orders || []),
        String(delivery.deliveryAddress || '')
      );
      if (resolved.id !== overviewProvince.id) return false;
      const deliveryText = JSON.stringify(delivery);
      if (overviewIndustrialPark && !normalizeVietnameseText(deliveryText).includes(normalizeVietnameseText(overviewIndustrialPark))) return false;
      return true;
    });
  }, [currentUser, deliveries, overviewIndustrialPark, overviewProvince]);
  const overviewParks = useMemo(() => {
    if (!overviewParkProvince) return [];
    return activeChildren(industrialParkDefinition?.options.find(option => option.id === overviewParkProvince.id));
  }, [industrialParkDefinition, overviewParkProvince]);
  const overviewSummary = useMemo(() => ({
    total: overviewProvinceRecords.length,
    customers: overviewProvinceRecords.filter(record => record.type === 'customer').length,
    leads: overviewProvinceRecords.filter(record => record.type === 'lead').length,
    candidates: overviewProvinceRecords.filter(record => record.type === 'candidate').length,
    processing: overviewProvinceRecords.filter(record => record.statusLabel === 'Đang được Sale xử lý').length,
    revenue: overviewProvinceRecords.reduce((sum, record) => sum + record.revenue, 0),
    orders: overviewProvinceRecords.reduce((sum, record) => sum + record.orderCount, 0)
  }), [overviewProvinceRecords]);

  const territoryPerformance = useMemo(() => {
    const groups = new Map<string, {
      label: string; customers: number; leads: number; candidates: number; orders: number; revenue: number; saleCounts: Map<string, number>;
    }>();
    overviewProvinceRecords.forEach(record => {
      const label = record.industrialPark || 'Ngoài KCN / chưa xác định';
      const current = groups.get(label) || { label, customers: 0, leads: 0, candidates: 0, orders: 0, revenue: 0, saleCounts: new Map<string, number>() };
      current.customers += record.type === 'customer' ? 1 : 0;
      current.leads += record.type === 'lead' ? 1 : 0;
      current.candidates += record.type === 'candidate' ? 1 : 0;
      current.orders += record.orderCount;
      current.revenue += record.revenue;
      if (record.assignedSaleName !== 'Chưa phân công') current.saleCounts.set(record.assignedSaleName, (current.saleCounts.get(record.assignedSaleName) || 0) + 1);
      groups.set(label, current);
    });
    return Array.from(groups.values()).map(group => ({
      ...group,
      primarySale: Array.from(group.saleCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || 'Chưa phân công'
    })).sort((left, right) => right.revenue - left.revenue || (right.customers + right.leads + right.candidates) - (left.customers + left.leads + left.candidates));
  }, [overviewProvinceRecords]);

  const salePerformance = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; customers: number; leads: number; candidates: number; orders: number; revenue: number }>();
    overviewProvinceRecords.forEach(record => {
      const id = record.assignedSaleId || 'unassigned';
      const current = groups.get(id) || { id, name: record.assignedSaleName, customers: 0, leads: 0, candidates: 0, orders: 0, revenue: 0 };
      current.customers += record.type === 'customer' ? 1 : 0;
      current.leads += record.type === 'lead' ? 1 : 0;
      current.candidates += record.type === 'candidate' ? 1 : 0;
      current.orders += record.orderCount;
      current.revenue += record.revenue;
      groups.set(id, current);
    });
    return Array.from(groups.values()).sort((left, right) => right.revenue - left.revenue || (right.customers + right.leads + right.candidates) - (left.customers + left.leads + left.candidates));
  }, [overviewProvinceRecords]);

  const parkProvince = overviewParkProvince;
  const parkProvinceOption = industrialParkDefinition?.options.find(option => option.id === overviewParkProvince?.id);
  const parkRows = parkProvinceOption?.children || [];

  const saveIndustrialParkDefinition = async (nextDefinition: LeadFilterDefinition, message: string) => {
    setParkSaving(true);
    setParkMessage('');
    try {
      const savedDefinition = {
        ...compactLeadFilterDefinitionForStorage(nextDefinition),
        updatedBy: currentUser.displayName,
        updatedAt: new Date().toISOString()
      };
      await dbService.addDocument('lead_filter_definitions', savedDefinition);
      setStoredFilterDefinitions(previous => [
        ...previous.filter(definition => definition.id !== savedDefinition.id),
        savedDefinition
      ]);
      setParkMessage(message);
      return true;
    } catch {
      setParkMessage('Không thể lưu danh mục KCN lúc này. Vui lòng thử lại.');
      return false;
    } finally {
      setParkSaving(false);
    }
  };

  const addIndustrialPark = async () => {
    const lines = newParkNames.split(/\r?\n/);
    if (!industrialParkDefinition || !parkProvince || !newParkNames.trim()) {
      setParkMessage(!parkProvince ? 'Vui lòng chọn tỉnh/thành trước khi thêm KCN.' : 'Vui lòng dán ít nhất một tên KCN.');
      return;
    }
    const existingProvince = industrialParkDefinition.options.find(option => option.id === parkProvince.id);
    const existingParks = existingProvince?.children || [];
    const existingIds = new Set(existingParks.map(item => item.id));
    const existingLabels = new Set(existingParks.map(park => normalizeVietnameseText(park.label)));
    const seenLabels = new Set<string>();
    let blankCount = 0;
    let duplicateCount = 0;
    const newParks: LeadFilterOption[] = [];

    lines.forEach(line => {
      const label = line.trim().replace(/\s+/g, ' ');
      if (!label) {
        blankCount += 1;
        return;
      }
      const normalizedLabel = normalizeVietnameseText(label);
      if (existingLabels.has(normalizedLabel) || seenLabels.has(normalizedLabel)) {
        duplicateCount += 1;
        return;
      }
      seenLabels.add(normalizedLabel);
      const newPark: LeadFilterOption = {
        id: createParkId(parkProvince.id, label, existingIds),
        label,
        color: existingProvince?.color || '#2563eb',
        active: true,
        kind: 'region',
        system: false
      };
      existingIds.add(newPark.id);
      newParks.push(newPark);
    });

    if (newParks.length === 0) {
      setParkMessage('Không có KCN mới để thêm. Các dòng đã dán đều trống hoặc bị trùng.');
      return;
    }
    const provinceOption: LeadFilterOption = existingProvince || {
      id: parkProvince.id,
      label: parkProvince.label,
      color: '#2563eb',
      active: true,
      kind: 'province',
      system: true,
      children: []
    };
    const nextOptions = existingProvince
      ? industrialParkDefinition.options.map(option => option.id === parkProvince.id
        ? { ...option, children: [...(option.children || []), ...newParks] }
        : option)
      : [...industrialParkDefinition.options, { ...provinceOption, children: newParks }];
    const skippedParts = [
      duplicateCount > 0 ? `${duplicateCount} dòng trùng` : '',
      blankCount > 0 ? `${blankCount} dòng trống` : ''
    ].filter(Boolean);
    const message = `Đã thêm ${newParks.length} KCN${skippedParts.length > 0 ? `; bỏ qua ${skippedParts.join(' và ')}` : ''}.`;
    if (await saveIndustrialParkDefinition({ ...industrialParkDefinition, options: nextOptions }, message)) {
      setNewParkNames('');
    }
  };

  const deleteIndustrialPark = async (park: LeadFilterOption) => {
    if (!industrialParkDefinition || !parkProvinceOption) return;
    if (!window.confirm(`Xóa KCN “${park.label}” khỏi danh sách? Dữ liệu hồ sơ cũ vẫn được giữ nguyên.`)) return;
    const nextOptions = industrialParkDefinition.options.map(option => option.id !== parkProvinceOption.id ? option : {
      ...option,
      children: (option.children || []).filter(item => item.id !== park.id)
    });
    if (await saveIndustrialParkDefinition({ ...industrialParkDefinition, options: nextOptions }, `Đã xóa ${park.label}.`)) {
      if (overviewIndustrialPark === park.label) setOverviewIndustrialPark('');
    }
  };

  const loadProvince = useCallback((province: ProvinceGeometry) => {
    setSelectedProvince(province);
    setLocationSearch('');
    setViewBox(geometryBounds(province.polygons, 36));
    setMapError('');
  }, []);

  const returnToNational = () => {
    setSelectedProvince(null);
    setLocationSearch('');
    setViewBox(NATIONAL_VIEW);
    setMapError('');
  };

  const locationOptions = provinceData;
  const findLocation = () => {
    const keyword = normalizeVietnameseText(locationSearch);
    if (!keyword) return;
    const match = locationOptions.find(area => normalizeVietnameseText(area.name).includes(keyword));
    if (!match) return;
    loadProvince(match);
  };

  const resetCurrentView = () => {
    if (selectedProvince) setViewBox(geometryBounds(selectedProvince.polygons, 36));
    else setViewBox(NATIONAL_VIEW);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, viewBox };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (event.clientX - dragRef.current.clientX) * (dragRef.current.viewBox.width / rect.width);
    const dy = (event.clientY - dragRef.current.clientY) * (dragRef.current.viewBox.height / rect.height);
    setViewBox({
      ...dragRef.current.viewBox,
      x: dragRef.current.viewBox.x - dx,
      y: dragRef.current.viewBox.y - dy
    });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const mapAreas = provinceData;
  const mapLevelLabel = 'Tỉnh/thành phố';

  return (
    <div className="commercial-map-view commercial-map-view--focused">
      <PageContextHeader section="Thương mại" current={activeTab === 'provinces' ? 'Tỉnh thành' : 'Bản đồ'} />

      <nav className="commercial-tabs content-tabs" role="tablist" aria-label="Dữ liệu thương mại theo địa bàn">
        <button type="button" role="tab" aria-selected={activeTab === 'provinces'} className={activeTab === 'provinces' ? 'is-active' : ''} onClick={() => setActiveTab('provinces')}>Tỉnh thành</button>
        <button type="button" role="tab" aria-selected={activeTab === 'map'} className={activeTab === 'map' ? 'is-active' : ''} onClick={() => setActiveTab('map')}>Bản đồ</button>
      </nav>

      {activeTab === 'provinces' && (
        <section className="commercial-overview">
          <div className="commercial-overview__toolbar">
            <label>
              <span>Tỉnh/thành</span>
              <SearchableProvinceSelect
                value={overviewProvinceName}
                options={COMMERCIAL_PROVINCES_64}
                onChange={value => { setOverviewProvinceName(value); setOverviewIndustrialPark(''); setShowParkManagement(false); setParkMessage(''); }}
                placeholder="Chọn hoặc gõ để tìm tỉnh/thành"
              />
            </label>
            <div className="commercial-overview__field">
              <span>Khu công nghiệp</span>
              <SearchableLocationSelect value={overviewIndustrialPark} options={overviewParks} disabled={!overviewProvince} ariaLabel="Khu công nghiệp" placeholder={overviewProvince ? 'Tất cả hoặc gõ để tìm KCN' : 'Chọn tỉnh/thành trước'} emptyMessage="Không tìm thấy KCN phù hợp." onChange={setOverviewIndustrialPark} />
            </div>
            {(overviewProvinceName || overviewIndustrialPark) && <button type="button" className="btn btn-outline" onClick={() => { setOverviewProvinceName(''); setOverviewIndustrialPark(''); setShowParkManagement(false); }}>Đặt lại</button>}
          </div>

          {!overviewProvince ? (
            <div className="commercial-empty-state">
              <strong>Chọn tỉnh/thành để xem số liệu thương mại</strong>
              <p>Có thể gõ tên không dấu để tìm nhanh trong danh mục tỉnh/thành thống nhất của hệ thống.</p>
            </div>
          ) : (
            <>
              <div className="commercial-metric-grid">
                <article><span>Hồ sơ tại địa bàn</span><strong>{overviewSummary.total}</strong><small>{overviewSummary.customers} hợp tác · {overviewSummary.leads} tiềm năng · {overviewSummary.candidates} thô</small></article>
                <article><span>Giá trị thương mại</span><strong>{formatCurrency(overviewSummary.revenue)}</strong><small>{overviewSummary.orders} PO phát sinh</small></article>
                <article><span>Sale phụ trách chính</span><strong>{salePerformance[0]?.name || 'Chưa phân công'}</strong><small>{salePerformance[0] ? `${salePerformance[0].customers + salePerformance[0].leads + salePerformance[0].candidates} hồ sơ đang phụ trách` : 'Chưa có dữ liệu phân công'}</small></article>
                <article><span>Độ phủ vận hành</span><strong>{overviewParks.length} KCN</strong><small>{overviewDeliveries.length} chuyến đang hoạt động</small></article>
              </div>

              <div className="commercial-overview__content">
                {showParkManagement && currentUser.role === 'admin' ? (
                  <section id="commercial-park-manager" className="commercial-park-manager">
                    <header><div><h2>Quản lý KCN tại {overviewParkProvince?.label}</h2></div><button type="button" className="btn btn-outline btn-sm" onClick={() => setShowParkManagement(false)}>Đóng quản lý KCN</button></header>
                    <div className="commercial-parks__add">
                      <label><span>Dán danh sách KCN, mỗi dòng 1 tên</span><textarea value={newParkNames} onChange={event => setNewParkNames(event.target.value)} rows={4} /></label>
                      <button type="button" className="btn btn-primary" disabled={parkSaving || !newParkNames.trim()} onClick={() => void addIndustrialPark()}>{parkSaving ? 'Đang lưu...' : 'Lưu'}</button>
                    </div>
                    {parkMessage && <div className="commercial-parks__message" role="status">{parkMessage}</div>}
                    <div className="table-container"><table><thead><tr><th style={{ width: 64 }}>STT</th><th>Tên khu công nghiệp</th><th style={{ width: 110 }}>Thao tác</th></tr></thead><tbody>
                      {parkRows.map((park, index) => <tr key={park.id}><td>{index + 1}</td><td title={park.label}>{park.label}</td><td><div className="commercial-row-actions"><button type="button" className="btn btn-danger btn-sm" disabled={parkSaving} onClick={() => void deleteIndustrialPark(park)}>Xóa</button></div></td></tr>)}
                      {parkRows.length === 0 && <tr><td colSpan={3} className="commercial-table-empty">Tỉnh/thành này chưa có KCN. Dán tên KCN ở trên để thêm.</td></tr>}
                    </tbody></table></div>
                  </section>
                ) : (
                  <section className="commercial-data-panel">
                    <header><div><h2>Hiệu quả theo khu vực / KCN</h2><p>{overviewSummary.total} hồ sơ · Tổng giá trị PO {formatCurrency(overviewSummary.revenue)}</p></div>{currentUser.role === 'admin' && <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowParkManagement(true)}>Quản lý KCN</button>}</header>
                    <div className="table-container"><table><thead><tr><th>Khu vực / KCN</th><th>Sale chính</th><th>Hợp tác</th><th>Tiềm năng</th><th>Dữ liệu thô</th><th>PO</th><th>Giá trị</th></tr></thead><tbody>
                      {territoryPerformance.map(row => <tr key={row.label}><td title={row.label}>{row.label}</td><td>{row.primarySale}</td><td>{row.customers}</td><td>{row.leads}</td><td>{row.candidates}</td><td>{row.orders}</td><td>{formatCurrency(row.revenue)}</td></tr>)}
                    </tbody></table></div>
                  </section>
                )}
              </div>

              {(salePerformance.length > 1 || overviewDeliveries.length > 0) && <div className="commercial-secondary-grid">
                {salePerformance.length > 1 && <section className="commercial-data-panel">
                  <header><div><h2>Phân bổ Sale</h2><p>So sánh khối lượng hồ sơ và giá trị phụ trách trong địa bàn.</p></div></header>
                  <div className="table-container"><table><thead><tr><th>Sale phụ trách</th><th>Hợp tác</th><th>Tiềm năng</th><th>Dữ liệu thô</th><th>PO</th><th>Giá trị</th></tr></thead><tbody>{salePerformance.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.customers}</td><td>{row.leads}</td><td>{row.candidates}</td><td>{row.orders}</td><td>{formatCurrency(row.revenue)}</td></tr>)}</tbody></table></div>
                </section>}
                {overviewDeliveries.length > 0 && <section className="commercial-data-panel">
                  <header><div><h2>Chuyến đang hoạt động</h2><p>{overviewDeliveries.length} chuyến phù hợp với địa bàn đang chọn.</p></div></header>
                  <div className="table-container"><table><thead><tr><th>Mã chuyến</th><th>Ngày giao</th><th>Trạng thái</th></tr></thead><tbody>{overviewDeliveries.slice(0, 8).map((delivery, index) => <tr key={String(delivery.id || index)}><td>{String(delivery.delCode || `Chuyến ${index + 1}`)}</td><td>{String(delivery.deliveryDate || '').slice(0, 10) || 'Chưa có ngày'}</td><td>{String(delivery.status || 'Đang hoạt động')}</td></tr>)}</tbody></table></div>
                </section>}
              </div>}
            </>
          )}
        </section>
      )}

      {activeTab === 'map' && <section className="commercial-map-focus-workspace">
        <aside className="commercial-map-sidebar">
          <div className="commercial-map-panel-title">
            <strong><Layers3 size={15} /> Lớp dữ liệu</strong>
            <span>Bật lớp cần quan sát trên bản đồ.</span>
          </div>
          <div className="commercial-map-layer-list">
            {LAYERS.map(layer => (
              <button
                key={layer.id}
                type="button"
                className={activeLayer === layer.id ? 'active' : ''}
                onClick={() => setActiveLayer(layer.id)}
              >
                <i style={{ backgroundColor: layer.color }} />
                <span>{layer.label}</span>
                <b>{filterCommercialMapRecords(accessibleRecords, layer.id).length}</b>
              </button>
            ))}
          </div>

          {currentUser.role === 'admin' && (
            <label className="commercial-map-sale-filter">
              <span><UsersRound size={13} /> Sale phụ trách</span>
              <select value={saleFilter} onChange={event => setSaleFilter(event.target.value)}>
                <option value="all">Tất cả Sale</option>
                {activeSales.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}
              </select>
            </label>
          )}

          <div className="commercial-map-guide">
            <strong>Cách sử dụng</strong>
            <ol>
              <li>Chọn lớp dữ liệu cần phân tích.</li>
              <li>Bấm vào một tỉnh để xem dữ liệu.</li>
              <li>Kéo hoặc cuộn để di chuyển và zoom.</li>
            </ol>
          </div>
        </aside>

        <main className="commercial-map-main">
          <div className="commercial-map-toolbar">
            <div className="commercial-map-breadcrumb">
              <button type="button" onClick={returnToNational}>Toàn quốc</button>
              {selectedProvince && <><span>/</span><strong>{selectedProvince.name}</strong></>}
            </div>
            <div className="commercial-map-location-search">
              <Search size={15} />
              <input
                value={locationSearch}
                list="commercial-map-locations"
                placeholder={`Tìm ${mapLevelLabel.toLocaleLowerCase('vi-VN')}...`}
                onChange={event => setLocationSearch(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') findLocation(); }}
              />
              <datalist id="commercial-map-locations">
                {locationOptions.map(area => <option key={area.id} value={area.name} />)}
              </datalist>
              <button type="button" onClick={findLocation}>Tìm</button>
            </div>
          </div>

          <div className="commercial-map-interactive-canvas">
            {loadingMap && <div className="commercial-map-loading"><LoaderCircle className="spin" /><span>Đang tải ranh giới hành chính…</span></div>}
            {mapError && <div className="commercial-map-error">{mapError}</div>}
            {!loadingMap && (
              <svg
                ref={svgRef}
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                role="img"
                aria-label={`Bản đồ ${mapLevelLabel} Việt Nam`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => { dragRef.current = null; }}
                onWheel={event => {
                  event.preventDefault();
                  setViewBox(current => zoomViewBox(current, event.deltaY > 0 ? 1.13 : 0.87));
                }}
              >
                <defs>
                  <filter id="commercial-map-region-shadow" x="-15%" y="-15%" width="130%" height="130%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1.8" floodColor="#12356f" floodOpacity="0.18" />
                  </filter>
                </defs>
                <g className="commercial-map-geography province-level">
                  {mapAreas.map(area => {
                    const provinceId = selectedProvinceId || resolveCommercialProvince(area.name).id;
                    const summary = summaryByProvince.get(provinceId);
                    const total = summary?.total || 0;
                    const intensity = total > 0 ? 0.22 + (total / maximumProvinceTotal) * 0.7 : 0.08;
                    const active = selectedProvince?.id === area.id;
                    return (
                      <path
                        key={area.id}
                        d={geometryPath(area.polygons)}
                        className={active ? 'selected' : ''}
                        style={{
                          fill: active ? activeLayerDefinition.color : activeLayerDefinition.color,
                          fillOpacity: active ? 0.88 : intensity
                        }}
                        onClick={event => {
                          event.stopPropagation();
                          loadProvince(area);
                        }}
                        onPointerEnter={() => setHoveredArea({ name: area.name, total })}
                        onPointerLeave={() => setHoveredArea(null)}
                      >
                        <title>{area.name} · {total} doanh nghiệp</title>
                      </path>
                    );
                  })}
                </g>
                <g className="commercial-map-area-labels province-level" aria-hidden="true">
                  {mapAreas.map(area => {
                    const [labelX, labelY] = projectCoordinate(area.center);
                    return (
                      <text
                        key={`label-${area.id}`}
                        x={labelX}
                        y={labelY}
                        className={selectedProvince?.id === area.id ? 'selected' : ''}
                        style={{ fontSize: `${Math.max(0.9, viewBox.width / 100)}px` }}
                      >
                        {area.name}
                      </text>
                    );
                  })}
                </g>
                {selectedProvince && (
                  <g className="commercial-map-business-markers" aria-label={`${recordMarkers.length} doanh nghiệp trên bản đồ`}>
                    {recordMarkers.map(marker => {
                      const markerRadius = Math.max(.55, Math.min(1.35, viewBox.width / 360));
                      const [x, y] = marker.point;
                      return (
                        <g
                          key={marker.record.key}
                          className="commercial-map-business-marker"
                          transform={`translate(${x} ${y})`}
                          role="button"
                          tabIndex={0}
                          aria-label={marker.record.companyName}
                          onClick={event => {
                            event.stopPropagation();
                            if (marker.record.type === 'customer') onNavigateToCrm();
                            else onNavigateToLeads();
                          }}
                          onKeyDown={event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            if (marker.record.type === 'customer') onNavigateToCrm();
                            else onNavigateToLeads();
                          }}
                          onPointerEnter={() => setHoveredMarker(marker.record)}
                          onPointerLeave={() => setHoveredMarker(null)}
                        >
                          <circle className="commercial-map-marker-dot" r={markerRadius} />
                          <title>{marker.record.companyName} · Vị trí tương đối trong tỉnh</title>
                        </g>
                      );
                    })}
                  </g>
                )}
              </svg>
            )}

            {(hoveredMarker || hoveredArea) && (
              <div className="commercial-map-hover-card">
                <strong>{hoveredMarker?.companyName || hoveredArea?.name}</strong>
                {hoveredMarker
                  ? <span>{hoveredMarker.assignedSaleName} · {hoveredMarker.statusLabel}</span>
                  : !selectedProvince && <span>{hoveredArea?.total || 0} doanh nghiệp</span>}
              </div>
            )}
            <div className="commercial-map-zoom-controls">
              <button type="button" title="Phóng to" onClick={() => setViewBox(current => zoomViewBox(current, 0.78))}><Plus size={17} /></button>
              <button type="button" title="Thu nhỏ" onClick={() => setViewBox(current => zoomViewBox(current, 1.28))}><Minus size={17} /></button>
              <button type="button" title="Đưa bản đồ về vị trí trung tâm" onClick={resetCurrentView}><LocateFixed size={17} /></button>
              {selectedProvince && <button type="button" title="Quay lại toàn quốc" onClick={returnToNational}><RotateCcw size={17} /></button>}
            </div>
            <div className="commercial-map-level-badge">{mapLevelLabel}</div>
            {selectedProvince && (
              <div className="commercial-map-marker-count">
                <Building2 size={13} /> {recordMarkers.length} điểm doanh nghiệp
                <small>Vị trí theo địa bàn hồ sơ</small>
              </div>
            )}
          </div>
        </main>

        <aside className="commercial-map-insight commercial-map-insight--contextual">
          {!selectedProvince ? (
            <div className="commercial-map-empty-insight">
              <MapPinned size={31} />
              <strong>Chọn một tỉnh/thành</strong>
              <p>Bấm trực tiếp vào bản đồ để xem dữ liệu kinh doanh của địa bàn.</p>
            </div>
          ) : (
            <>
              <button type="button" className="commercial-map-back" onClick={returnToNational}><ChevronLeft size={15} /> Toàn quốc</button>
              <div className="commercial-map-panel-title">
                <strong>{selectedProvince.name}</strong>
                <span>Tỉnh/thành đang xem</span>
              </div>
              <dl>
                <div><dt>Doanh nghiệp</dt><dd>{selectedProvinceSummary?.total || 0}</dd></div>
                <div><dt>Khách hàng hợp tác</dt><dd>{selectedProvinceSummary?.customers || 0}</dd></div>
                <div><dt>Lead</dt><dd>{selectedProvinceSummary?.leads || 0}</dd></div>
                <div><dt>Sale đang xử lý</dt><dd>{selectedProvinceSummary?.processing || 0}</dd></div>
                <div><dt>Chưa phân công</dt><dd>{selectedProvinceSummary?.unassigned || 0}</dd></div>
                <div><dt>Diện tích địa bàn</dt><dd>{formatNumber(Math.round(selectedProvince.area))} km²</dd></div>
              </dl>

              <div className="commercial-map-local-records">
                <strong><Building2 size={14} /> Dữ liệu nổi bật</strong>
                {selectedRecords.slice(0, 6).map(record => (
                  <button key={record.key} type="button" onClick={() => record.type === 'customer' ? onNavigateToCrm() : onNavigateToLeads()}>
                    <span>{record.companyName}</span>
                    <small>{record.assignedSaleName} · {record.statusLabel}</small>
                    <ExternalLink size={13} />
                  </button>
                ))}
                {selectedRecords.length === 0 && <p>Chưa có dữ liệu nội bộ tại tỉnh này trong lớp đang chọn.</p>}
              </div>
            </>
          )}
        </aside>
      </section>}
    </div>
  );
};
