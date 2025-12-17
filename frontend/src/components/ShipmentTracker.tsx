import React, { useState, useEffect } from 'react';
import { shipmentsAPI, type Shipment, type TrackingEvent } from '../api';
import './ShipmentTracker.css';

interface ShipmentTrackerProps {
  folderId: string;
}

const ShipmentTracker: React.FC<ShipmentTrackerProps> = ({ folderId }) => {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadShipments();
  }, [folderId]);

  const loadShipments = async () => {
    try {
      setLoading(true);
      const response = await shipmentsAPI.getByFolder(folderId);
      setShipments(response.data);
      if (response.data.length > 0) {
        setSelectedShipment(response.data[0]);
        loadEvents(response.data[0].id);
      }
    } catch (err) {
      console.error('Failed to load shipments:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (shipmentId: string) => {
    try {
      const response = await shipmentsAPI.getEvents(shipmentId);
      setEvents(response.data);
    } catch (err) {
      console.error('Failed to load tracking events:', err);
    }
  };

  const handleRefresh = async (shipmentId: string) => {
    try {
      setRefreshing(true);
      await shipmentsAPI.refresh(shipmentId);
      await loadShipments();
      if (selectedShipment?.id === shipmentId) {
        loadEvents(shipmentId);
      }
    } catch (err) {
      console.error('Failed to refresh tracking:', err);
      alert('Failed to refresh tracking information');
    } finally {
      setRefreshing(false);
    }
  };

  const handleShipmentSelect = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    loadEvents(shipment.id);
  };

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'delivered') return 'var(--color-verdant-pulse)';
    if (statusLower === 'in_transit' || statusLower === 'transit') return 'var(--color-tidewave-blue)';
    if (statusLower === 'exception' || statusLower === 'error') return 'var(--color-terra-blush)';
    return 'var(--color-text-muted)'; /* Neutral grey */
  };

  const getStatusLabel = (status: string) => {
    const statusLower = status.toLowerCase();
    const labels: Record<string, string> = {
      'pending': 'Pending',
      'in_transit': 'In Transit',
      'transit': 'In Transit',
      'delivered': 'Delivered',
      'exception': 'Exception',
      'error': 'Error',
      'unknown': 'Unknown',
    };
    return labels[statusLower] || status;
  };

  if (loading) {
    return <div className="shipment-tracker-loading">Loading shipments...</div>;
  }

  if (shipments.length === 0) {
    return (
      <div className="shipment-tracker-empty">
        <p>No shipments found for this order.</p>
      </div>
    );
  }

  return (
    <div className="shipment-tracker">
      <div className="shipment-tracker-header">
        <h3>Package Tracking</h3>
        {selectedShipment && (
          <button
            onClick={() => handleRefresh(selectedShipment.id)}
            disabled={refreshing}
            className="btn-refresh"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>

      <div className="shipment-list">
        {shipments.map((shipment) => (
          <div
            key={shipment.id}
            className={`shipment-item ${selectedShipment?.id === shipment.id ? 'active' : ''}`}
            onClick={() => handleShipmentSelect(shipment)}
          >
            <div className="shipment-info">
              <div className="shipment-carrier">{shipment.carrier_name || shipment.carrier}</div>
              <div className="shipment-tracking">{shipment.tracking_number}</div>
            </div>
            <div
              className="shipment-status"
              style={{ color: getStatusColor(shipment.status) }}
            >
              {getStatusLabel(shipment.status)}
            </div>
          </div>
        ))}
      </div>

      {selectedShipment && (
        <div className="tracking-details">
          <div className="tracking-header">
            <h4>Tracking Details</h4>
            <div className="tracking-status-badge" style={{ backgroundColor: getStatusColor(selectedShipment.status) }}>
              {getStatusLabel(selectedShipment.status)}
            </div>
          </div>

          {selectedShipment.estimated_delivery_date && (
            <div className="delivery-info">
              <strong>Estimated Delivery:</strong>{' '}
              {new Date(selectedShipment.estimated_delivery_date).toLocaleDateString()}
            </div>
          )}

          {selectedShipment.actual_delivery_date && (
            <div className="delivery-info">
              <strong>Delivered:</strong>{' '}
              {new Date(selectedShipment.actual_delivery_date).toLocaleDateString()}
            </div>
          )}

          <div className="tracking-events">
            <h5>Tracking History</h5>
            {events.length === 0 ? (
              <p>No tracking events available.</p>
            ) : (
              <div className="events-list">
                {events.map((event) => (
                  <div key={event.id} className="tracking-event">
                    <div className="event-time">
                      {new Date(event.timestamp).toLocaleString()}
                    </div>
                    <div className="event-status">{getStatusLabel(event.status)}</div>
                    {event.location && (
                      <div className="event-location">{event.location}</div>
                    )}
                    {event.description && (
                      <div className="event-description">{event.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShipmentTracker;

