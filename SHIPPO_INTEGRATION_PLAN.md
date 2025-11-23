# Shippo API Integration Plan

## Overview

This document outlines the plan to integrate Shippo API into the folders system, enabling customers to track their packages once they are shipped out. Each folder represents an order/project, and we'll add shipment tracking capabilities to these folders.

## Current System Analysis

### Folders Structure
- **Purpose**: Folders represent orders/projects
- **Key Fields**: `id`, `name`, `description`, `quote_id`, `client_id`, `status`
- **Relationships**: Connected to quotes, files, forms, e-signatures
- **Access Control**: Admins have full access, customers see assigned folders

### Existing Patterns
- API integrations use service files (e.g., `stripe_service.py`, `ai_service.py`)
- Environment variables for API keys (e.g., `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`)
- Router files for endpoints (e.g., `routers/stripe.py`)
- Database migrations for new features

## Shippo API Capabilities

### Core Features We'll Use
1. **Shipment Tracking**: Track packages across multiple carriers
2. **Webhooks**: Real-time tracking updates
3. **Carrier Support**: USPS, UPS, FedEx, DHL, and more
4. **Tracking Status**: Real-time status updates (in_transit, delivered, etc.)

### Shippo API Endpoints We'll Need
- `GET /tracks/{carrier}/{tracking_number}` - Get tracking info
- `POST /tracks` - Register a tracking number
- Webhook endpoint for tracking updates

## Implementation Plan

### Phase 1: Database Schema

Create a new `shipments` table to store tracking information:

```sql
-- Shipments table
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  tracking_number VARCHAR(255) NOT NULL,
  carrier VARCHAR(100) NOT NULL, -- e.g., 'usps', 'ups', 'fedex'
  carrier_name VARCHAR(255), -- Human-readable name
  shippo_tracking_id VARCHAR(255), -- Shippo's internal tracking ID
  status VARCHAR(50) DEFAULT 'pending', -- pending, in_transit, delivered, exception, etc.
  status_details TEXT, -- JSON string with detailed status info
  estimated_delivery_date TIMESTAMP WITH TIME ZONE,
  actual_delivery_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(folder_id, tracking_number) -- One tracking number per folder
);

-- Shipment tracking history (for detailed tracking events)
CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shipments_folder_id ON shipments(folder_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_shipment_id ON shipment_tracking_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_timestamp ON shipment_tracking_events(timestamp DESC);

-- Enable RLS
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_tracking_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shipments
CREATE POLICY "Admins can manage all shipments" ON shipments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Users can view shipments for their folders" ON shipments
  FOR SELECT
  USING (
    folder_id IN (
      SELECT folder_id FROM folder_assignments
      WHERE user_id = auth.uid()
    )
    OR folder_id IN (
      SELECT id FROM folders WHERE created_by = auth.uid()
    )
  );

-- RLS Policies for tracking events
CREATE POLICY "Users can view tracking events for accessible shipments" ON shipment_tracking_events
  FOR SELECT
  USING (
    shipment_id IN (
      SELECT id FROM shipments
      WHERE folder_id IN (
        SELECT folder_id FROM folder_assignments
        WHERE user_id = auth.uid()
      )
      OR folder_id IN (
        SELECT id FROM folders WHERE created_by = auth.uid()
      )
    )
  );
```

### Phase 2: Backend Implementation

#### 2.1 Install Shippo Python SDK

Add to `backend/requirements.txt`:
```
shippo>=2.0.0
```

#### 2.2 Create Shippo Service

Create `backend/shippo_service.py`:

```python
import os
import shippo
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Initialize Shippo API key
SHIPPO_API_KEY = os.getenv("SHIPPO_API_KEY")
if SHIPPO_API_KEY:
    shippo.api_key = SHIPPO_API_KEY
else:
    logger.warning("SHIPPO_API_KEY not found in environment variables")

class ShippoService:
    """Service for interacting with Shippo API"""
    
    @staticmethod
    def is_configured() -> bool:
        """Check if Shippo is configured"""
        return bool(SHIPPO_API_KEY)
    
    @staticmethod
    def create_tracking(tracking_number: str, carrier: str) -> Dict[str, Any]:
        """
        Register a tracking number with Shippo
        
        Args:
            tracking_number: The tracking number
            carrier: Carrier code (e.g., 'usps', 'ups', 'fedex')
        
        Returns:
            Tracking information from Shippo
        """
        if not ShippoService.is_configured():
            raise ValueError("Shippo API key not configured")
        
        try:
            tracking = shippo.Track.create(
                carrier=carrier,
                tracking_number=tracking_number
            )
            return tracking
        except Exception as e:
            logger.error(f"Error creating tracking: {str(e)}")
            raise
    
    @staticmethod
    def get_tracking(carrier: str, tracking_number: str) -> Dict[str, Any]:
        """
        Get tracking information for a shipment
        
        Args:
            carrier: Carrier code
            tracking_number: The tracking number
        
        Returns:
            Current tracking status and events
        """
        if not ShippoService.is_configured():
            raise ValueError("Shippo API key not configured")
        
        try:
            tracking = shippo.Track.get_status(
                carrier=carrier,
                tracking_number=tracking_number
            )
            return tracking
        except Exception as e:
            logger.error(f"Error getting tracking: {str(e)}")
            raise
    
    @staticmethod
    def get_carrier_name(carrier_code: str) -> str:
        """Convert carrier code to human-readable name"""
        carrier_names = {
            'usps': 'USPS',
            'ups': 'UPS',
            'fedex': 'FedEx',
            'dhl': 'DHL',
            'dhl_express': 'DHL Express',
            'dhl_ecommerce': 'DHL eCommerce',
            'canada_post': 'Canada Post',
            'australia_post': 'Australia Post',
            'royal_mail': 'Royal Mail',
        }
        return carrier_names.get(carrier_code.lower(), carrier_code.upper())
```

#### 2.3 Create Shipment Models

Add to `backend/models.py`:

```python
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

class ShipmentBase(BaseModel):
    folder_id: str
    tracking_number: str
    carrier: str
    carrier_name: Optional[str] = None

class ShipmentCreate(ShipmentBase):
    pass

class ShipmentUpdate(BaseModel):
    status: Optional[str] = None
    status_details: Optional[str] = None
    estimated_delivery_date: Optional[datetime] = None
    actual_delivery_date: Optional[datetime] = None

class Shipment(ShipmentBase):
    id: str
    shippo_tracking_id: Optional[str] = None
    status: str = "pending"
    status_details: Optional[str] = None
    estimated_delivery_date: Optional[datetime] = None
    actual_delivery_date: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class TrackingEvent(BaseModel):
    id: str
    shipment_id: str
    status: str
    location: Optional[str] = None
    description: Optional[str] = None
    timestamp: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True
```

#### 2.4 Create Shipments Router

Create `backend/routers/shipments.py`:

```python
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Shipment, ShipmentCreate, ShipmentUpdate, TrackingEvent
from database import supabase_storage
from auth import get_current_user
from shippo_service import ShippoService
import logging
import json

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/shipments", tags=["shipments"])

@router.post("", response_model=Shipment)
async def create_shipment(
    shipment: ShipmentCreate,
    user = Depends(get_current_user)
):
    """Create a new shipment tracking entry. Admin only."""
    try:
        # Check if user is admin
        is_admin = user.get("role") == "admin"
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admins can create shipments")
        
        # Verify folder exists
        folder_response = supabase_storage.table("folders").select("id").eq("id", shipment.folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Register tracking with Shippo
        try:
            shippo_tracking = ShippoService.create_tracking(
                shipment.tracking_number,
                shipment.carrier
            )
            shippo_tracking_id = shippo_tracking.get("tracking_number_id") or shippo_tracking.get("id")
        except Exception as e:
            logger.warning(f"Could not register with Shippo: {str(e)}")
            shippo_tracking_id = None
        
        # Get carrier name
        carrier_name = ShippoService.get_carrier_name(shipment.carrier)
        
        # Create shipment record
        shipment_data = {
            "folder_id": shipment.folder_id,
            "tracking_number": shipment.tracking_number,
            "carrier": shipment.carrier,
            "carrier_name": carrier_name,
            "shippo_tracking_id": shippo_tracking_id,
            "status": "pending",
            "created_by": user["id"]
        }
        
        response = supabase_storage.table("shipments").insert(shipment_data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create shipment")
        
        # Fetch tracking info and update
        await update_shipment_tracking(response.data[0]["id"])
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating shipment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create shipment: {str(e)}")

@router.get("/folder/{folder_id}", response_model=List[Shipment])
async def get_folder_shipments(
    folder_id: str,
    user = Depends(get_current_user)
):
    """Get all shipments for a folder."""
    try:
        # Check folder access
        is_admin = user.get("role") == "admin"
        folder_response = supabase_storage.table("folders").select("*").eq("id", folder_id).single().execute()
        if not folder_response.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        if not is_admin:
            # Check if user has access to folder
            assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", folder_id).eq("user_id", user["id"]).execute()
            if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Get shipments
        response = supabase_storage.table("shipments").select("*").eq("folder_id", folder_id).order("created_at", desc=True).execute()
        return response.data if response.data else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shipments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get shipments: {str(e)}")

@router.get("/{shipment_id}", response_model=Shipment)
async def get_shipment(
    shipment_id: str,
    user = Depends(get_current_user)
):
    """Get shipment details with tracking events."""
    try:
        # Get shipment
        response = supabase_storage.table("shipments").select("*").eq("id", shipment_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Shipment not found")
        
        shipment = response.data
        
        # Check access
        is_admin = user.get("role") == "admin"
        if not is_admin:
            folder_response = supabase_storage.table("folders").select("created_by").eq("id", shipment["folder_id"]).single().execute()
            assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", shipment["folder_id"]).eq("user_id", user["id"]).execute()
            if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return shipment
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shipment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get shipment: {str(e)}")

@router.post("/{shipment_id}/refresh")
async def refresh_shipment_tracking(
    shipment_id: str,
    user = Depends(get_current_user)
):
    """Refresh tracking information from Shippo."""
    try:
        # Get shipment
        shipment_response = supabase_storage.table("shipments").select("*").eq("id", shipment_id).single().execute()
        if not shipment_response.data:
            raise HTTPException(status_code=404, detail="Shipment not found")
        
        shipment = shipment_response.data
        
        # Check access
        is_admin = user.get("role") == "admin"
        if not is_admin:
            folder_response = supabase_storage.table("folders").select("created_by").eq("id", shipment["folder_id"]).single().execute()
            assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", shipment["folder_id"]).eq("user_id", user["id"]).execute()
            if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Update tracking
        await update_shipment_tracking(shipment_id)
        
        # Return updated shipment
        updated = supabase_storage.table("shipments").select("*").eq("id", shipment_id).single().execute()
        return updated.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing tracking: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to refresh tracking: {str(e)}")

@router.get("/{shipment_id}/events", response_model=List[TrackingEvent])
async def get_shipment_events(
    shipment_id: str,
    user = Depends(get_current_user)
):
    """Get tracking events for a shipment."""
    try:
        # Get shipment and check access
        shipment_response = supabase_storage.table("shipments").select("folder_id").eq("id", shipment_id).single().execute()
        if not shipment_response.data:
            raise HTTPException(status_code=404, detail="Shipment not found")
        
        shipment = shipment_response.data
        
        # Check access
        is_admin = user.get("role") == "admin"
        if not is_admin:
            folder_response = supabase_storage.table("folders").select("created_by").eq("id", shipment["folder_id"]).single().execute()
            assignment = supabase_storage.table("folder_assignments").select("folder_id").eq("folder_id", shipment["folder_id"]).eq("user_id", user["id"]).execute()
            if not assignment.data and folder_response.data.get("created_by") != user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Get events
        response = supabase_storage.table("shipment_tracking_events").select("*").eq("shipment_id", shipment_id).order("timestamp", desc=True).execute()
        return response.data if response.data else []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tracking events: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tracking events: {str(e)}")

async def update_shipment_tracking(shipment_id: str):
    """Update shipment tracking information from Shippo"""
    try:
        # Get shipment
        shipment_response = supabase_storage.table("shipments").select("*").eq("id", shipment_id).single().execute()
        if not shipment_response.data:
            return
        
        shipment = shipment_response.data
        
        if not ShippoService.is_configured():
            logger.warning("Shippo not configured, skipping tracking update")
            return
        
        # Get tracking info from Shippo
        tracking_info = ShippoService.get_tracking(
            shipment["carrier"],
            shipment["tracking_number"]
        )
        
        # Update shipment status
        status = tracking_info.get("tracking_status", {}).get("status", "unknown")
        status_details = json.dumps(tracking_info.get("tracking_status", {}))
        
        # Parse delivery dates
        estimated_delivery = None
        actual_delivery = None
        
        if tracking_info.get("eta"):
            try:
                estimated_delivery = datetime.fromisoformat(tracking_info["eta"].replace("Z", "+00:00"))
            except:
                pass
        
        # Check if delivered
        if status == "DELIVERED" and tracking_info.get("tracking_status", {}).get("status_date"):
            try:
                actual_delivery = datetime.fromisoformat(tracking_info["tracking_status"]["status_date"].replace("Z", "+00:00"))
            except:
                pass
        
        # Update shipment
        update_data = {
            "status": status.lower(),
            "status_details": status_details,
            "estimated_delivery_date": estimated_delivery.isoformat() if estimated_delivery else None,
            "actual_delivery_date": actual_delivery.isoformat() if actual_delivery else None,
            "updated_at": datetime.now().isoformat()
        }
        
        supabase_storage.table("shipments").update(update_data).eq("id", shipment_id).execute()
        
        # Store tracking events
        tracking_history = tracking_info.get("tracking_history", [])
        for event in tracking_history:
            event_data = {
                "shipment_id": shipment_id,
                "status": event.get("status", "unknown"),
                "location": event.get("location", {}).get("city") if isinstance(event.get("location"), dict) else None,
                "description": event.get("status_details", ""),
                "timestamp": event.get("status_date", datetime.now().isoformat())
            }
            
            # Check if event already exists
            existing = supabase_storage.table("shipment_tracking_events").select("id").eq("shipment_id", shipment_id).eq("timestamp", event_data["timestamp"]).execute()
            if not existing.data:
                supabase_storage.table("shipment_tracking_events").insert(event_data).execute()
        
    except Exception as e:
        logger.error(f"Error updating shipment tracking: {str(e)}")
```

#### 2.5 Register Router

Add to `backend/main.py`:

```python
from routers.shipments import router as shipments_router
app.include_router(shipments_router)
```

### Phase 3: Frontend Implementation

#### 3.1 Add API Methods

Add to `frontend/src/api.ts`:

```typescript
export interface Shipment {
  id: string;
  folder_id: string;
  tracking_number: string;
  carrier: string;
  carrier_name: string | null;
  shippo_tracking_id: string | null;
  status: string;
  status_details: string | null;
  estimated_delivery_date: string | null;
  actual_delivery_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentCreate {
  folder_id: string;
  tracking_number: string;
  carrier: string;
}

export interface TrackingEvent {
  id: string;
  shipment_id: string;
  status: string;
  location: string | null;
  description: string | null;
  timestamp: string;
  created_at: string;
}

export const shipmentsAPI = {
  create: async (data: ShipmentCreate): Promise<AxiosResponse<Shipment>> => {
    return axios.post(`${API_URL}/api/shipments`, data, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  
  getByFolder: async (folderId: string): Promise<AxiosResponse<Shipment[]>> => {
    return axios.get(`${API_URL}/api/shipments/folder/${folderId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  
  get: async (shipmentId: string): Promise<AxiosResponse<Shipment>> => {
    return axios.get(`${API_URL}/api/shipments/${shipmentId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  
  refresh: async (shipmentId: string): Promise<AxiosResponse<Shipment>> => {
    return axios.post(`${API_URL}/api/shipments/${shipmentId}/refresh`, {}, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
  
  getEvents: async (shipmentId: string): Promise<AxiosResponse<TrackingEvent[]>> => {
    return axios.get(`${API_URL}/api/shipments/${shipmentId}/events`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  },
};
```

#### 3.2 Create Shipment Components

Create `frontend/src/components/ShipmentTracker.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { shipmentsAPI, type Shipment, type TrackingEvent } from '../api';
import './ShipmentTracker.css';

interface ShipmentTrackerProps {
  folderId: string;
  isAdmin?: boolean;
}

const ShipmentTracker: React.FC<ShipmentTrackerProps> = ({ folderId, isAdmin = false }) => {
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
    } catch (err) {
      console.error('Failed to refresh tracking:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'delivered') return '#28a745';
    if (statusLower === 'in_transit' || statusLower === 'transit') return '#007bff';
    if (statusLower === 'exception' || statusLower === 'error') return '#dc3545';
    return '#6c757d';
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
            onClick={() => {
              setSelectedShipment(shipment);
              loadEvents(shipment.id);
            }}
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
```

#### 3.3 Create Add Shipment Modal

Create `frontend/src/components/AddShipmentModal.tsx`:

```typescript
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
```

#### 3.4 Integrate into FolderView

Add to `frontend/src/pages/FolderView.tsx`:

```typescript
import ShipmentTracker from '../components/ShipmentTracker';
import AddShipmentModal from '../components/AddShipmentModal';

// In the component:
const [showAddShipment, setShowAddShipment] = useState(false);

// In the render, add after the folder content:
{role === 'admin' && (
  <div className="folder-section">
    <div className="section-header">
      <h2>Shipment Tracking</h2>
      <button onClick={() => setShowAddShipment(true)} className="btn-primary">
        Add Shipment
      </button>
    </div>
    <ShipmentTracker folderId={id!} isAdmin={role === 'admin'} />
  </div>
)}

{showAddShipment && (
  <AddShipmentModal
    folderId={id!}
    onClose={() => setShowAddShipment(false)}
    onSuccess={() => {
      // Reload folder content if needed
    }}
  />
)}
```

### Phase 4: Environment Setup

#### 4.1 Get Shippo API Key

1. Sign up at https://goshippo.com
2. Go to Settings → API
3. Generate a test API key (for development)
4. For production, contact Shippo for a live API key

#### 4.2 Add Environment Variable

**Local Development:**
Add to `backend/.env`:
```
SHIPPO_API_KEY=shippo_test_...
```

**AWS App Runner:**
1. Go to AWS Console → App Runner → Your Service
2. Configuration → Environment Variables
3. Add: `SHIPPO_API_KEY` = `your_shippo_api_key`

### Phase 5: Webhook Setup (Optional)

For real-time tracking updates, set up Shippo webhooks:

1. Go to Shippo Dashboard → Settings → Webhooks
2. Add webhook URL: `https://your-backend-url.com/api/shipments/webhook`
3. Select events: `track_updated`, `track_created`

Add webhook handler to `backend/routers/shipments.py`:

```python
@router.post("/webhook")
async def shippo_webhook(request: Request):
    """Handle Shippo webhook events"""
    try:
        data = await request.json()
        event_type = data.get("event")
        
        if event_type == "track_updated":
            # Update shipment tracking
            tracking_number = data.get("tracking_number")
            carrier = data.get("carrier")
            
            # Find shipment
            shipment_response = supabase_storage.table("shipments").select("id").eq("tracking_number", tracking_number).eq("carrier", carrier).single().execute()
            if shipment_response.data:
                await update_shipment_tracking(shipment_response.data["id"])
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error handling webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Webhook processing failed")
```

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Shippo API key is configured
- [ ] Can create a shipment (admin only)
- [ ] Can view shipments in folder (admin and customer)
- [ ] Tracking information updates correctly
- [ ] Tracking events display properly
- [ ] Refresh button updates tracking
- [ ] RLS policies work correctly
- [ ] Webhook receives updates (if configured)

## Next Steps

1. **Run Database Migration**: Execute the SQL migration in Supabase
2. **Install Dependencies**: Add `shippo` to requirements.txt and install
3. **Create Backend Files**: Create `shippo_service.py` and `routers/shipments.py`
4. **Update Models**: Add shipment models to `models.py`
5. **Register Router**: Add shipments router to `main.py`
6. **Create Frontend Components**: Build shipment tracker UI
7. **Set Environment Variable**: Add `SHIPPO_API_KEY`
8. **Test Integration**: Test with real tracking numbers
9. **Set Up Webhooks** (optional): For real-time updates

## Estimated Implementation Time

- **Backend**: 4-6 hours
- **Frontend**: 3-4 hours
- **Testing**: 2-3 hours
- **Total**: 9-13 hours

## Notes

- Shippo has a free tier with limited API calls
- Test API keys work for development
- Production requires a paid Shippo account
- Webhooks are optional but recommended for real-time updates
- Consider adding email notifications when packages are delivered

