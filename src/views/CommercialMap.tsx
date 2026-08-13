import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  ChevronLeft,
  Database,
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
import type { CustomerRecord, LeadRecord } from '../domain/crmModels';
import type { LeadCandidateRecord } from '../domain/leadCandidateModels';
import type { CompatiblePORecord } from '../domain/poCompatibility';
import type { UserProfile } from '../services/firebaseService';
import { dbService } from '../services/firebaseService';
import {
  buildCommercialMapRecords,
  filterCommercialMapRecords,
  normalizeVietnameseText,
  resolveCommercialProvince,
  summarizeCommercialProvinces,
  type CommercialMapLayer,
  type CommercialMapRecord
} from '../domain/commercialMapModels';
import './CommercialMap.css';

interface CommercialMapProps {
  customers: CustomerRecord[];
  leads: LeadRecord[];
  orders: CompatiblePORecord[];
  users: UserProfile[];
  currentUser: UserProfile;
  onNavigateToCrm: () => void;
  onNavigateToLeads: () => void;
}

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

type WardGeometry = ProvinceGeometry;

interface ProvinceMapData {
  provinces: ProvinceGeometry[];
}

interface WardMapData {
  provinceId: string;
  provinceName: string;
  wards: WardGeometry[];
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
  matchedWardName: string;
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

const normalizeWardSearch = (value: string): string => normalizeVietnameseText(value)
  .replace(/\b(phuong|xa|thi tran|dac khu)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

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
  users,
  currentUser,
  onNavigateToCrm,
  onNavigateToLeads
}) => {
  const [candidates, setCandidates] = useState<LeadCandidateRecord[]>([]);
  const [activeLayer, setActiveLayer] = useState<CommercialMapLayer>('all');
  const [saleFilter, setSaleFilter] = useState('all');
  const [provinceData, setProvinceData] = useState<ProvinceGeometry[]>([]);
  const [selectedProvince, setSelectedProvince] = useState<ProvinceGeometry | null>(null);
  const [wardData, setWardData] = useState<WardGeometry[]>([]);
  const [selectedWard, setSelectedWard] = useState<WardGeometry | null>(null);
  const [hoveredArea, setHoveredArea] = useState<{ name: string; total: number } | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<CommercialMapRecord | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [viewBox, setViewBox] = useState<ViewBoxState>(NATIONAL_VIEW);
  const [loadingMap, setLoadingMap] = useState(true);
  const [loadingWards, setLoadingWards] = useState(false);
  const [mapError, setMapError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => dbService.subscribeCollection('lead_candidates', data => {
    setCandidates(data as LeadCandidateRecord[]);
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
    return selectedRecords.map(record => {
      const normalizedLocation = normalizeWardSearch(`${record.address} ${record.provinceName}`);
      const matchedWard = wardData.find(ward => {
        const normalizedWard = normalizeWardSearch(ward.name);
        return normalizedWard.length > 2 && normalizedLocation.includes(normalizedWard);
      });
      const targetGeometry = matchedWard || selectedProvince;
      return {
        record,
        point: markerPointWithinGeometry(targetGeometry, record.key),
        matchedWardName: matchedWard?.name || ''
      };
    });
  }, [selectedProvince, selectedRecords, wardData]);

  const activeSales = useMemo(
    () => users.filter(user => user.role === 'sale' && user.active !== false),
    [users]
  );

  const loadProvince = useCallback(async (province: ProvinceGeometry) => {
    setSelectedProvince(province);
    setSelectedWard(null);
    setWardData([]);
    setLocationSearch('');
    setViewBox(geometryBounds(province.polygons, 36));
    setLoadingWards(true);
    setMapError('');
    try {
      const response = await fetch(`/map-data/wards/${province.id}.json`);
      if (!response.ok) throw new Error('Chưa tải được ranh giới xã/phường của địa bàn này.');
      const data = await response.json() as WardMapData;
      setWardData(data.wards);
    } catch (error) {
      setMapError(error instanceof Error ? error.message : 'Không thể tải địa bàn chi tiết.');
    } finally {
      setLoadingWards(false);
    }
  }, []);

  const returnToNational = () => {
    setSelectedProvince(null);
    setSelectedWard(null);
    setWardData([]);
    setLocationSearch('');
    setViewBox(NATIONAL_VIEW);
    setMapError('');
  };

  const selectWard = (ward: WardGeometry) => {
    setSelectedWard(ward);
    setLocationSearch(ward.name);
    setViewBox(geometryBounds(ward.polygons, 4, 12));
  };

  const locationOptions = selectedProvince ? wardData : provinceData;
  const findLocation = () => {
    const keyword = normalizeVietnameseText(locationSearch);
    if (!keyword) return;
    const match = locationOptions.find(area => normalizeVietnameseText(area.name).includes(keyword));
    if (!match) return;
    if (selectedProvince) selectWard(match as WardGeometry);
    else void loadProvince(match as ProvinceGeometry);
  };

  const resetCurrentView = () => {
    if (selectedWard) setViewBox(geometryBounds(selectedWard.polygons, 4, 12));
    else if (selectedProvince) setViewBox(geometryBounds(selectedProvince.polygons, 36));
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

  const mapAreas = selectedProvince ? wardData : provinceData;
  const mapLevelLabel = selectedProvince ? 'Xã/phường' : 'Tỉnh/thành phố';

  return (
    <div className="commercial-map-view commercial-map-view--focused">
      <header className="commercial-map-header commercial-map-header--compact">
        <div>
          <div className="commercial-map-heading"><MapPinned size={21} /><h1>Bản đồ</h1></div>
          <p>Quan sát độ phủ khách hàng và công việc Sale theo từng địa bàn.</p>
        </div>
        <span className="commercial-map-source"><Database size={14} /> Dữ liệu nội bộ Sunflower</span>
      </header>

      <section className="commercial-map-focus-workspace">
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
              <li>Bấm vào một tỉnh để phóng lớn.</li>
              <li>Chọn xã/phường để xem sâu hơn.</li>
              <li>Kéo hoặc cuộn để di chuyển và zoom.</li>
            </ol>
          </div>
        </aside>

        <main className="commercial-map-main">
          <div className="commercial-map-toolbar">
            <div className="commercial-map-breadcrumb">
              <button type="button" onClick={returnToNational}>Toàn quốc</button>
              {selectedProvince && <><span>/</span><button type="button" onClick={() => { setSelectedWard(null); setLocationSearch(''); setViewBox(geometryBounds(selectedProvince.polygons, 36)); }}>{selectedProvince.name}</button></>}
              {selectedWard && <><span>/</span><strong>{selectedWard.name}</strong></>}
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
                <g className={`commercial-map-geography ${selectedProvince ? 'ward-level' : 'province-level'}`}>
                  {mapAreas.map(area => {
                    const provinceId = selectedProvinceId || resolveCommercialProvince(area.name).id;
                    const summary = summaryByProvince.get(provinceId);
                    const total = summary?.total || 0;
                    const intensity = total > 0 ? 0.22 + (total / maximumProvinceTotal) * 0.7 : 0.08;
                    const active = selectedWard?.id === area.id;
                    return (
                      <path
                        key={area.id}
                        d={geometryPath(area.polygons)}
                        className={active ? 'selected' : ''}
                        style={{
                          fill: active ? activeLayerDefinition.color : activeLayerDefinition.color,
                          fillOpacity: active ? 0.88 : selectedProvince ? 0.14 : intensity
                        }}
                        onClick={event => {
                          event.stopPropagation();
                          if (selectedProvince) selectWard(area as WardGeometry);
                          else void loadProvince(area as ProvinceGeometry);
                        }}
                        onPointerEnter={() => setHoveredArea({ name: area.name, total })}
                        onPointerLeave={() => setHoveredArea(null)}
                      >
                        <title>{area.name}{selectedProvince ? '' : ` · ${total} doanh nghiệp`}</title>
                      </path>
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
                          <title>{marker.record.companyName} · {marker.matchedWardName || 'Vị trí tương đối trong tỉnh'}</title>
                        </g>
                      );
                    })}
                  </g>
                )}
              </svg>
            )}

            {loadingWards && <div className="commercial-map-ward-loading"><LoaderCircle className="spin" /> Đang tải xã/phường…</div>}
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
              <p>Bấm trực tiếp vào bản đồ để xem ranh giới xã/phường và dữ liệu kinh doanh của địa bàn.</p>
              <span>{provinceData.length || 34} tỉnh/thành phố</span>
            </div>
          ) : (
            <>
              <button type="button" className="commercial-map-back" onClick={returnToNational}><ChevronLeft size={15} /> Toàn quốc</button>
              <div className="commercial-map-panel-title">
                <strong>{selectedWard?.name || selectedProvince.name}</strong>
                <span>{selectedWard ? `${selectedWard.type} · ${selectedProvince.name}` : 'Tỉnh/thành đang xem'}</span>
              </div>
              <dl>
                <div><dt>Doanh nghiệp</dt><dd>{selectedProvinceSummary?.total || 0}</dd></div>
                <div><dt>Khách hàng hợp tác</dt><dd>{selectedProvinceSummary?.customers || 0}</dd></div>
                <div><dt>Lead</dt><dd>{selectedProvinceSummary?.leads || 0}</dd></div>
                <div><dt>Sale đang xử lý</dt><dd>{selectedProvinceSummary?.processing || 0}</dd></div>
                <div><dt>Chưa phân công</dt><dd>{selectedProvinceSummary?.unassigned || 0}</dd></div>
                <div><dt>Diện tích địa bàn</dt><dd>{formatNumber(Math.round((selectedWard || selectedProvince).area))} km²</dd></div>
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
      </section>
    </div>
  );
};
