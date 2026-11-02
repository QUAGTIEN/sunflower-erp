export const TRIP_STATUS_LABELS: Record<string, string> = {
  planning: 'Đang lập kế hoạch',
  approved: 'Đã duyệt chuyến',
  loading: 'Đang bốc hàng',
  delivering: 'Đang giao hàng',
  completed: 'Hoàn thành',
  failed: 'Giao thất bại',
  postponed: 'Hoãn chuyến'
};

export interface TripStop {
  poId: string;
  deliveredQty?: number;
  status?: string;
}

export interface DeliveryTripRecord {
  id: string;
  delCode?: string;
  deliveryDate?: string;
  status?: string;
  driverName?: string;
  vehicleName?: string;
  deleted?: boolean;
  orders?: TripStop[];
}

/** Trips carry their stops inline, so an order's trips are found by scanning the stops for its id. */
export const tripsForOrder = (trips: DeliveryTripRecord[], poId: string) =>
  trips
    .filter(trip => !trip.deleted && (trip.orders || []).some(stop => stop.poId === poId))
    .map(trip => ({ trip, stop: (trip.orders || []).find(stop => stop.poId === poId) as TripStop }))
    .sort((left, right) => String(right.trip.deliveryDate || '').localeCompare(String(left.trip.deliveryDate || '')));
