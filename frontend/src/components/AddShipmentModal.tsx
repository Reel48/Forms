import React, { useState } from 'react';
import { shipmentsAPI, type ShipmentCreate } from '../api';
import './AddShipmentModal.css';

interface AddShipmentModalProps {
  folderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CARRIERS = [
  { value: 'usps', label: 'USPS' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'dhl', label: 'DHL' },
  { value: 'dhl_express', label: 'DHL Express' },
  { value: 'dhl_ecommerce', label: 'DHL eCommerce' },
  { value: 'canada_post', label: 'Canada Post' },
];

const AddShipmentModal: React.FC<AddShipmentModalProps> = ({ folderId, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<ShipmentCreate>({
    folder_id: folderId,
    tracking_number: '',
    carrier: 'usps',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tracking_number.trim()) {
      setError('Tracking number is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await shipmentsAPI.create(formData);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add shipment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Shipment Tracking</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="carrier">Carrier</label>
            <select
              id="carrier"
              value={formData.carrier}
              onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
              required
            >
              {CARRIERS.map((carrier) => (
                <option key={carrier.value} value={carrier.value}>
                  {carrier.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="tracking_number">Tracking Number</label>
            <input
              id="tracking_number"
              type="text"
              value={formData.tracking_number}
              onChange={(e) => setFormData({ ...formData, tracking_number: e.target.value })}
              required
              placeholder="Enter tracking number"
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add Shipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddShipmentModal;

