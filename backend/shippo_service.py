import os
import shippo
from typing import Optional, Dict, Any
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Initialize Shippo API key
SHIPPO_API_KEY = os.getenv("SHIPPO_API_KEY")
if SHIPPO_API_KEY:
    shippo.api_key = SHIPPO_API_KEY
else:
    logger.warning("SHIPPO_API_KEY not found in environment variables - Shippo features will not be available")

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

