"""
Webhook service for sending form submission events to external URLs
"""
import os
import json
import hmac
import hashlib
import logging
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime
import requests
from database import supabase

logger = logging.getLogger(__name__)

class WebhookService:
    """Service for sending webhooks to external URLs"""
    
    def __init__(self):
        self.timeout = 10  # 10 second timeout for webhook requests
    
    def generate_signature(self, payload: str, secret: str) -> str:
        """Generate HMAC SHA256 signature for webhook payload"""
        return hmac.new(
            secret.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
    
    def send_webhook(
        self,
        webhook_id: str,
        url: str,
        payload: Dict[str, Any],
        secret: Optional[str] = None,
        event_type: str = "submission.created"
    ) -> Dict[str, Any]:
        """
        Send webhook to external URL
        
        Returns:
            dict with keys: success, status_code, response_body, error_message
        """
        try:
            # Prepare headers
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "FormsApp-Webhook/1.0",
                "X-Webhook-Event": event_type,
            }
            
            # Add signature if secret is provided
            payload_json = json.dumps(payload, default=str)
            if secret:
                signature = self.generate_signature(payload_json, secret)
                headers["X-Webhook-Signature"] = f"sha256={signature}"
            
            # Send webhook
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=self.timeout
            )
            
            # Log delivery
            delivery_data = {
                "id": str(uuid.uuid4()),
                "webhook_id": webhook_id,
                "submission_id": payload.get("submission", {}).get("id"),
                "event_type": event_type,
                "url": url,
                "payload": payload,
                "response_status": response.status_code,
                "response_body": response.text[:1000] if response.text else None,  # Limit response body size
                "error_message": None if response.status_code < 400 else f"HTTP {response.status_code}",
                "attempts": 1,
                "delivered_at": datetime.now().isoformat() if response.status_code < 400 else None,
                "created_at": datetime.now().isoformat(),
            }
            
            supabase_storage.table("form_webhook_deliveries").insert(delivery_data).execute()
            
            return {
                "success": response.status_code < 400,
                "status_code": response.status_code,
                "response_body": response.text[:500] if response.text else None,
                "error_message": None if response.status_code < 400 else f"HTTP {response.status_code}: {response.text[:200]}",
            }
            
        except requests.exceptions.Timeout:
            error_msg = f"Webhook timeout after {self.timeout}s"
            logger.error(f"Webhook timeout: {url}")
            self._log_delivery_failure(webhook_id, payload.get("submission", {}).get("id"), url, event_type, payload, error_msg)
            return {
                "success": False,
                "status_code": None,
                "response_body": None,
                "error_message": error_msg,
            }
        except requests.exceptions.RequestException as e:
            error_msg = f"Webhook request failed: {str(e)}"
            logger.error(f"Webhook error: {url} - {error_msg}")
            self._log_delivery_failure(webhook_id, payload.get("submission", {}).get("id"), url, event_type, payload, error_msg)
            return {
                "success": False,
                "status_code": None,
                "response_body": None,
                "error_message": error_msg,
            }
        except Exception as e:
            error_msg = f"Unexpected webhook error: {str(e)}"
            logger.error(f"Webhook unexpected error: {url} - {error_msg}")
            self._log_delivery_failure(webhook_id, payload.get("submission", {}).get("id"), url, event_type, payload, error_msg)
            return {
                "success": False,
                "status_code": None,
                "response_body": None,
                "error_message": error_msg,
            }
    
    def _log_delivery_failure(
        self,
        webhook_id: str,
        submission_id: Optional[str],
        url: str,
        event_type: str,
        payload: Dict[str, Any],
        error_message: str
    ):
        """Log failed webhook delivery"""
        try:
            delivery_data = {
                "id": str(uuid.uuid4()),
                "webhook_id": webhook_id,
                "submission_id": submission_id,
                "event_type": event_type,
                "url": url,
                "payload": payload,
                "response_status": None,
                "response_body": None,
                "error_message": error_message,
                "attempts": 1,
                "delivered_at": None,
                "created_at": datetime.now().isoformat(),
            }
            supabase_storage.table("form_webhook_deliveries").insert(delivery_data).execute()
        except Exception as e:
            logger.error(f"Failed to log webhook delivery failure: {str(e)}")
    
    def send_slack_notification(
        self,
        webhook_url: str,
        form_name: str,
        submission: Dict[str, Any],
        form_id: str
    ) -> bool:
        """
        Send a notification to Slack via webhook URL
        
        Args:
            webhook_url: Slack webhook URL
            form_name: Name of the form
            submission: Submission data
            form_id: Form ID
            
        Returns:
            True if sent successfully, False otherwise
        """
        try:
            submission_link = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/forms/{form_id}/submissions/{submission.get('id')}"
            
            # Format submission answers
            answers_text = ""
            if submission.get("answers") or submission.get("form_submission_answers"):
                answers = submission.get("answers") or submission.get("form_submission_answers", [])
                for answer in answers:
                    field_id = answer.get("field_id", "")
                    answer_text = answer.get("answer_text", "")
                    answers_text += f"• {field_id}: {answer_text}\n"
            
            payload = {
                "text": f"New Form Submission: {form_name}",
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": f"New Form Submission: {form_name}",
                            "emoji": True
                        }
                    },
                    {
                        "type": "section",
                        "fields": [
                            {
                                "type": "mrkdwn",
                                "text": f"*Form:*\n{form_name}"
                            },
                            {
                                "type": "mrkdwn",
                                "text": f"*Submitted:*\n{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                            }
                        ]
                    }
                ]
            }
            
            if submission.get("submitter_name") or submission.get("submitter_email"):
                submitter_info = []
                if submission.get("submitter_name"):
                    submitter_info.append(f"*Name:*\n{submission.get('submitter_name')}")
                if submission.get("submitter_email"):
                    submitter_info.append(f"*Email:*\n{submission.get('submitter_email')}")
                
                if submitter_info:
                    payload["blocks"].append({
                        "type": "section",
                        "fields": [{"type": "mrkdwn", "text": info} for info in submitter_info]
                    })
            
            if answers_text:
                payload["blocks"].append({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Answers:*\n{answers_text}"
                    }
                })
            
            payload["blocks"].append({
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "View Submission"
                        },
                        "url": submission_link,
                        "style": "primary"
                    }
                ]
            })
            
            response = requests.post(webhook_url, json=payload, timeout=10)
            return response.status_code < 400
            
        except Exception as e:
            logger.error(f"Error sending Slack notification: {str(e)}")
            return False

    def trigger_submission_webhooks(
        self,
        form_id: str,
        submission: Dict[str, Any],
        event_type: str = "submission.created"
    ):
        """
        Trigger all active webhooks for a form submission
        
        Args:
            form_id: The form ID
            submission: The submission data
            event_type: The event type (submission.created, submission.updated, etc.)
        """
        try:
            # Check for Slack webhook in form settings
            form_response = supabase_storage.table("forms").select("name, settings").eq("id", form_id).single().execute()
            form = form_response.data if form_response.data else {}
            form_name = form.get("name", "Form")
            settings = form.get("settings", {})
            
            # Send Slack notification if configured
            slack_webhook = settings.get("slack_webhook_url")
            if slack_webhook:
                try:
                    self.send_slack_notification(slack_webhook, form_name, submission, form_id)
                except Exception as e:
                    logger.error(f"Error sending Slack notification: {str(e)}")
            
            # Get all active webhooks for this form
            webhooks_response = supabase_storage.table("form_webhooks").select("*").eq("form_id", form_id).eq("is_active", True).execute()
            webhooks = webhooks_response.data or []
            
            if not webhooks:
                return
            
            # Get form details
            form_response = supabase_storage.table("forms").select("id, name").eq("id", form_id).single().execute()
            form = form_response.data if form_response.data else {}
            
            # Prepare webhook payload
            payload = {
                "event": event_type,
                "form": {
                    "id": form.get("id"),
                    "name": form.get("name"),
                },
                "submission": {
                    "id": submission.get("id"),
                    "form_id": submission.get("form_id"),
                    "submitter_email": submission.get("submitter_email"),
                    "submitter_name": submission.get("submitter_name"),
                    "submitted_at": submission.get("submitted_at"),
                    "status": submission.get("status"),
                    "review_status": submission.get("review_status"),
                },
                "timestamp": datetime.now().isoformat(),
            }
            
            # Get submission answers if available
            if submission.get("answers") or submission.get("form_submission_answers"):
                answers = submission.get("answers") or submission.get("form_submission_answers", [])
                payload["submission"]["answers"] = answers
            
            # Send webhook to each configured URL
            for webhook in webhooks:
                # Check if this webhook listens to this event type
                webhook_events = webhook.get("events", ["submission.created"])
                if event_type not in webhook_events:
                    continue
                
                # Send webhook (async in background - don't block submission)
                try:
                    result = self.send_webhook(
                        webhook_id=webhook["id"],
                        url=webhook["url"],
                        payload=payload,
                        secret=webhook.get("secret"),
                        event_type=event_type
                    )
                    
                    if not result["success"]:
                        logger.warning(f"Webhook delivery failed for {webhook['url']}: {result.get('error_message')}")
                except Exception as e:
                    logger.error(f"Error sending webhook to {webhook['url']}: {str(e)}")
                    
        except Exception as e:
            logger.error(f"Error triggering webhooks for form {form_id}: {str(e)}")

# Global webhook service instance
webhook_service = WebhookService()

