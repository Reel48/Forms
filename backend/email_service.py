"""
Email service for sending notifications and password reset emails
Uses AWS SES (Simple Email Service) for all email sending
"""
import os
from typing import Optional, Dict, Any
from datetime import datetime
import logging
from template_service import template_service

logger = logging.getLogger(__name__)

# Get email configuration from environment
EMAIL_PROVIDER = "ses"  # Always use SES
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@reel48.com")  # Default sender email
FROM_NAME = os.getenv("FROM_NAME", "Reel48")  # Default sender name
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")  # Frontend URL for password reset links
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

BRAND_PRIMARY = "#111827"  # near-black
BRAND_ACCENT = "#2563eb"   # blue
BRAND_BG = "#f5f5f5"


def _wrap_branded_html(*, title: str, inner_html: str, preheader: Optional[str] = None) -> str:
    """Wrap email content in a shared Reel48-branded layout."""
    pre = (preheader or "").strip()
    preheader_html = (
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{pre}</div>'
        if pre
        else ""
    )

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #111827; background-color: {BRAND_BG}; margin: 0; padding: 0;">
  {preheader_html}
  <div style="max-width: 640px; margin: 0 auto; padding: 24px;">
    <div style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); overflow: hidden;">
      <div style="padding: 22px 24px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-size: 20px; font-weight: 700; color: {BRAND_PRIMARY};">Reel48</div>
      </div>
      <div style="padding: 24px;">
        {inner_html}
      </div>
    </div>
    <div style="text-align: center; margin-top: 18px; color: #9ca3af; font-size: 12px;">
      <div>This is an automated message from Reel48.</div>
      <div>Please do not reply to this email.</div>
    </div>
  </div>
</body>
</html>"""


def _wrap_branded_text(*, title: str, body: str) -> str:
    return f"""{title}

{body.strip()}

---
This is an automated message from Reel48. Please do not reply."""


class EmailService:
    """Service for sending emails via AWS SES"""
    
    def __init__(self):
        """Initialize email service with the configured provider"""
        logger.info(f"Initializing EmailService with provider: {EMAIL_PROVIDER}")
        logger.info(f"FROM_EMAIL: {FROM_EMAIL}")
        logger.info(f"FROM_NAME: {FROM_NAME}")
        logger.info(f"FRONTEND_URL: {FRONTEND_URL}")
        
        self.provider = EMAIL_PROVIDER
        self.client = None
        self._initialize_provider()
    
    def _initialize_provider(self):
        """Initialize the email provider - always uses AWS SES"""
        self.provider = "ses"
        self._initialize_aws_ses()
    
    def _initialize_aws_ses(self):
        """Initialize AWS SES (recommended for AWS deployments)"""
        try:
            import boto3
            from botocore.exceptions import ClientError
            
            self.ses_client = boto3.client('ses', region_name=AWS_REGION)
            
            # Verify SES is accessible
            try:
                response = self.ses_client.get_send_quota()
                max_24_hour_send = response.get('Max24HourSend', 0)
                logger.info(f"AWS SES initialized. Max 24h send: {max_24_hour_send}")
                self.client = self.ses_client
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                if error_code == 'AccessDenied':
                    logger.warning("AWS SES access denied. Check IAM permissions.")
                else:
                    logger.warning(f"AWS SES verification failed: {error_code}")
                self.client = None
        except ImportError:
            logger.error("boto3 not installed. Install with: pip install boto3")
            self.client = None
        except Exception as e:
            logger.error(f"Failed to initialize AWS SES: {str(e)}", exc_info=True)
            self.client = None
    
    
    def _send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send an email using the configured provider
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML email body
            text_content: Plain text email body (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        if not self.client:
            error_msg = f"Email service not configured. Provider: {self.provider}"
            logger.error(error_msg)
            logger.error(f"Would send email to {to_email} with subject: {subject}")
            logger.error(f"FROM_EMAIL: {FROM_EMAIL}, FROM_NAME: {FROM_NAME}")
            return False
        
        # Always use AWS SES
        return self._send_email_ses(to_email, subject, html_content, text_content)
    
    def _send_email_ses(self, to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
        """Send email via AWS SES"""
        try:
            from botocore.exceptions import ClientError
            
            message = {
                'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                'Body': {
                    'Html': {'Data': html_content, 'Charset': 'UTF-8'}
                }
            }
            
            if text_content:
                message['Body']['Text'] = {'Data': text_content, 'Charset': 'UTF-8'}
            
            logger.info(f"Attempting to send email to {to_email} via AWS SES...")
            response = self.client.send_email(
                Source=f"{FROM_NAME} <{FROM_EMAIL}>",
                Destination={'ToAddresses': [to_email]},
                Message=message
            )
            
            message_id = response.get('MessageId')
            logger.info(f"Email sent successfully to {to_email} (MessageId: {message_id})")
            return True
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            logger.error(f"AWS SES error - {error_code}: {error_message}")
            
            return False
        except Exception as e:
            logger.error(f"Exception sending email via AWS SES: {str(e)}", exc_info=True)
            return False
    
    
    def send_password_reset_email(
        self,
        to_email: str,
        reset_token: str,
        user_name: Optional[str] = None
    ) -> bool:
        """
        Send password reset email
        
        Args:
            to_email: User's email address
            reset_token: Password reset token
            user_name: User's name (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"

        subject = "Reel48 — reset your password"

        hello = f"Hello{(' ' + user_name) if user_name else ''},"
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">Reset your password</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">{hello}</p>
        <p style="margin: 0 0 18px 0; color: #374151;">
          We received a request to reset your Reel48 password. Use the button below to create a new password.
        </p>
        <div style="text-align:center; margin: 22px 0;">
          <a href="{reset_link}" style="background-color: {BRAND_ACCENT}; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700;">
            Reset password
          </a>
        </div>
        <p style="margin: 18px 0 8px 0; color:#6b7280; font-size: 13px;">Or copy and paste this link into your browser:</p>
        <p style="margin: 0; word-break: break-all; color: {BRAND_ACCENT}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px;">{reset_link}</p>
        <div style="margin-top: 18px; padding: 14px; background-color: #f9fafb; border-radius: 10px; border: 1px solid #e5e7eb;">
          <div style="font-size: 13px; color: #6b7280;"><b style=\"color:#374151;\">Important:</b> This link expires in 1 hour.</div>
          <div style="font-size: 13px; color: #6b7280; margin-top: 6px;">If you didn't request a password reset, you can ignore this email.</div>
        </div>
        """
        html_content = _wrap_branded_html(
            title="Reset your password — Reel48",
            inner_html=inner_html,
            preheader="Reset your Reel48 password.",
        )

        text_body = f"""{hello}

We received a request to reset your Reel48 password.

Reset password: {reset_link}

Important: This link expires in 1 hour.
If you didn't request a password reset, you can ignore this email."""
        text_content = _wrap_branded_text(title="Reset your password — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_form_assignment_notification(
        self,
        to_email: str,
        form_name: str,
        form_id: str,
        user_name: Optional[str] = None,
        assigned_by: Optional[str] = None
    ) -> bool:
        """
        Send email notification when a form is assigned to a customer
        
        Args:
            to_email: Customer's email address
            form_name: Name of the assigned form
            form_id: ID of the assigned form
            user_name: Customer's name (optional)
            assigned_by: Name of admin who assigned the form (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        form_link = f"{FRONTEND_URL}/forms/{form_id}"

        subject = f"Reel48 — new form assigned: {form_name}"

        hello = f"Hello{(' ' + user_name) if user_name else ''},"
        assigned_by_line = (
            f"<div style=\"color:#6b7280; font-size: 13px; margin-top: 6px;\">Assigned by: <b style=\"color:#374151;\">{assigned_by}</b></div>"
            if assigned_by
            else ""
        )
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">New form assigned</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">{hello}</p>
        <div style="padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <div style="font-weight: 700; color: {BRAND_PRIMARY};">{form_name}</div>
          {assigned_by_line}
        </div>
        <div style="text-align:center; margin: 22px 0;">
          <a href="{form_link}" style="background-color: {BRAND_ACCENT}; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700;">
            Open form
          </a>
        </div>
        <p style="margin: 0; color:#6b7280; font-size: 13px;">Please complete this form at your earliest convenience.</p>
        """
        html_content = _wrap_branded_html(
            title="New form assigned — Reel48",
            inner_html=inner_html,
            preheader=f"A new form has been assigned to you: {form_name}",
        )

        text_body = f"""{hello}

A new form has been assigned to you: {form_name}
{f'Assigned by: {assigned_by}' if assigned_by else ''}

Open form: {form_link}"""
        text_content = _wrap_branded_text(title="New form assigned — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_quote_assignment_notification(
        self,
        to_email: str,
        quote_title: str,
        quote_number: str,
        quote_id: str,
        user_name: Optional[str] = None,
        assigned_by: Optional[str] = None
    ) -> bool:
        """
        Send email notification when a quote is assigned to a customer
        
        Args:
            to_email: Customer's email address
            quote_title: Title of the assigned quote
            quote_number: Quote number
            quote_id: ID of the assigned quote
            user_name: Customer's name (optional)
            assigned_by: Name of admin who assigned the quote (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        quote_link = f"{FRONTEND_URL}/quotes/{quote_id}"

        subject = f"Reel48 — new quote assigned: {quote_title}"

        hello = f"Hello{(' ' + user_name) if user_name else ''},"
        assigned_by_line = (
            f"<div style=\"color:#6b7280; font-size: 13px; margin-top: 6px;\">Assigned by: <b style=\"color:#374151;\">{assigned_by}</b></div>"
            if assigned_by
            else ""
        )
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">New quote assigned</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">{hello}</p>
        <div style="padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <div style="font-weight: 700; color: {BRAND_PRIMARY};">{quote_title}</div>
          <div style="color:#6b7280; font-size: 13px; margin-top: 6px;">Quote number: <b style="color:#374151;">{quote_number}</b></div>
          {assigned_by_line}
        </div>
        <div style="text-align:center; margin: 22px 0;">
          <a href="{quote_link}" style="background-color: {BRAND_ACCENT}; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700;">
            View quote
          </a>
        </div>
        <p style="margin: 0; color:#6b7280; font-size: 13px;">Please review this quote and let us know if you have any questions.</p>
        """
        html_content = _wrap_branded_html(
            title="New quote assigned — Reel48",
            inner_html=inner_html,
            preheader=f"A new quote was assigned: {quote_title}",
        )

        text_body = f"""{hello}

A new quote has been assigned to you:

Quote: {quote_title}
Quote number: {quote_number}
{f'Assigned by: {assigned_by}' if assigned_by else ''}

View quote: {quote_link}"""
        text_content = _wrap_branded_text(title="New quote assigned — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_form_submission_admin_notification(
        self,
        to_email: str,
        form_name: str,
        form_id: str,
        submitter_name: Optional[str] = None,
        submitter_email: Optional[str] = None,
        submission_id: str = None
    ) -> bool:
        """
        Send email notification to admin when a form is submitted
        
        Args:
            to_email: Admin's email address
            form_name: Name of the form that was submitted
            form_id: ID of the form
            submitter_name: Name of person who submitted (optional)
            submitter_email: Email of person who submitted (optional)
            submission_id: ID of the submission (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        submission_link = f"{FRONTEND_URL}/forms/{form_id}/submissions/{submission_id}" if submission_id else f"{FRONTEND_URL}/forms/{form_id}/submissions"
        
        # Try to load custom template
        template = template_service.get_template("form_submission_admin")
        
        if template:
            # Use custom template
            variables = {
                "form_name": form_name,
                "form_id": form_id,
                "submission_id": submission_id or "",
                "submitter_name": submitter_name or "",
                "submitter_email": submitter_email or "",
                "submission_link": submission_link,
                "submission_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            
            subject = template_service.render_template(template.get("subject", ""), variables)
            html_content = template_service.render_template(template.get("html_body", ""), variables)
            text_content = template.get("text_body")
            if text_content:
                text_content = template_service.render_template(text_content, variables)
            else:
                # Generate text from HTML if not provided
                text_content = f"""
                New Form Submission
                
                A new submission has been received for the form: {form_name}
                
                {f'Submitted by: {submitter_name} ({submitter_email})' if submitter_name or submitter_email else ''}
                
                View the submission here: {submission_link}
                """
        else:
            # Use default template
            subject = f"Reel48 — new form submission: {form_name}"
            
            submitter_info = ""
            if submitter_name or submitter_email:
                submitter_info = f"""
                <p><strong>Submitted by:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    {f'<li>Name: {submitter_name}</li>' if submitter_name else ''}
                    {f'<li>Email: {submitter_email}</li>' if submitter_email else ''}
                </ul>
                """
            
            inner_html = f"""
            <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">New form submission</h2>
            <p style="margin: 0 0 14px 0; color: #374151;">A new submission has been received for:</p>
            <div style="padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
              <div style="font-weight: 700; color: {BRAND_PRIMARY};">{form_name}</div>
              <div style="margin-top: 10px; color:#6b7280; font-size: 13px;">
                {submitter_info}
              </div>
            </div>
            <div style="text-align:center; margin: 22px 0;">
              <a href="{submission_link}" style="background-color: {BRAND_ACCENT}; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700;">
                View submission
              </a>
            </div>
            """
            html_content = _wrap_branded_html(
                title="New form submission — Reel48",
                inner_html=inner_html,
                preheader=f"New submission received for {form_name}",
            )
            
            submitter_text = f"Submitted by: {submitter_name} ({submitter_email})" if submitter_name or submitter_email else ""
            text_body = f"""A new submission has been received for: {form_name}

{submitter_text}

View submission: {submission_link}"""
            text_content = _wrap_branded_text(title="New form submission — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_quote_accepted_admin_notification(
        self,
        to_email: str,
        quote_title: str,
        quote_number: str,
        quote_id: str,
        customer_name: Optional[str] = None,
        customer_email: Optional[str] = None
    ) -> bool:
        """
        Send email notification to admin when a quote is accepted
        
        Args:
            to_email: Admin's email address
            quote_title: Title of the accepted quote
            quote_number: Quote number
            quote_id: ID of the quote
            customer_name: Name of customer who accepted (optional)
            customer_email: Email of customer who accepted (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        quote_link = f"{FRONTEND_URL}/quotes/{quote_id}"
        
        subject = f"Reel48 — quote accepted: {quote_title}"
        
        customer_info = ""
        if customer_name or customer_email:
            customer_info = f"""
            <p><strong>Accepted by:</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
                {f'<li>Name: {customer_name}</li>' if customer_name else ''}
                {f'<li>Email: {customer_email}</li>' if customer_email else ''}
            </ul>
            """
        
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">Quote accepted</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">A quote has been accepted by a customer.</p>
        <div style="padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <div style="font-weight: 700; color: {BRAND_PRIMARY};">{quote_title}</div>
          <div style="color:#6b7280; font-size: 13px; margin-top: 6px;">Quote number: <b style="color:#374151;">{quote_number}</b></div>
          <div style="margin-top: 10px; color:#6b7280; font-size: 13px;">{customer_info}</div>
        </div>
        <div style="text-align:center; margin: 22px 0;">
          <a href="{quote_link}" style="background-color: {BRAND_ACCENT}; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700;">
            View quote
          </a>
        </div>
        <p style="margin: 0; color:#6b7280; font-size: 13px;">You may want to create an invoice for this quote.</p>
        """
        html_content = _wrap_branded_html(
            title="Quote accepted — Reel48",
            inner_html=inner_html,
            preheader=f"Quote accepted: {quote_title}",
        )
        
        accepted_by = f"Accepted by: {customer_name} ({customer_email})" if customer_name or customer_email else ""
        text_body = f"""A quote has been accepted:

Quote: {quote_title}
Quote number: {quote_number}
{accepted_by}

View quote: {quote_link}

You may want to create an invoice for this quote."""
        text_content = _wrap_branded_text(title="Quote accepted — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_invoice_paid_customer_notification(
        self,
        to_email: str,
        quote_title: str,
        quote_number: str,
        invoice_number: Optional[str] = None,
        amount_paid: Optional[str] = None,
        invoice_url: Optional[str] = None,
        customer_name: Optional[str] = None
    ) -> bool:
        """
        Send email notification to customer when invoice is paid
        
        Args:
            to_email: Customer's email address
            quote_title: Title of the quote/invoice
            quote_number: Quote number
            invoice_number: Invoice number from Stripe (optional)
            amount_paid: Amount that was paid (optional)
            invoice_url: Link to view invoice (optional)
            customer_name: Customer's name (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        subject = f"Reel48 — payment received: {quote_title}"
        
        invoice_info = ""
        if invoice_number:
            invoice_info += f"<p><strong>Invoice Number:</strong> {invoice_number}</p>"
        if amount_paid:
            invoice_info += f"<p><strong>Amount Paid:</strong> {amount_paid}</p>"
        
        invoice_link_html = ""
        if invoice_url:
            invoice_link_html = f"""
            <div style="text-align: center; margin: 30px 0;">
                <a href="{invoice_url}" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Invoice</a>
            </div>
            """
        
        hello = f"Hello{(' ' + customer_name) if customer_name else ''},"
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">Payment received</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">{hello}</p>
        <p style="margin: 0 0 14px 0; color: #374151;">Thank you! We’ve received your payment for:</p>
        <div style="padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <div style="font-weight: 700; color: {BRAND_PRIMARY};">{quote_title}</div>
          <div style="color:#6b7280; font-size: 13px; margin-top: 6px;">Quote number: <b style="color:#374151;">{quote_number}</b></div>
          <div style="margin-top: 10px; color:#6b7280; font-size: 13px;">{invoice_info}</div>
        </div>
        {invoice_link_html}
        <p style="margin: 0; color:#6b7280; font-size: 13px;">Your payment has been processed successfully. A receipt has been generated for your records.</p>
        """
        html_content = _wrap_branded_html(
            title="Payment received — Reel48",
            inner_html=inner_html,
            preheader=f"Payment received for {quote_title}",
        )
        
        text_body = f"""{hello}

Thank you! We have received your payment for:

Quote: {quote_title}
Quote number: {quote_number}
{f'Invoice number: {invoice_number}' if invoice_number else ''}
{f'Amount paid: {amount_paid}' if amount_paid else ''}
{f'View invoice: {invoice_url}' if invoice_url else ''}

Your payment has been processed successfully. A receipt has been generated for your records."""
        text_content = _wrap_branded_text(title="Payment received — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_invoice_paid_admin_notification(
        self,
        to_email: str,
        quote_title: str,
        quote_number: str,
        invoice_number: Optional[str] = None,
        amount_paid: Optional[str] = None,
        customer_name: Optional[str] = None,
        customer_email: Optional[str] = None,
        quote_id: str = None
    ) -> bool:
        """
        Send email notification to admin when invoice is paid
        
        Args:
            to_email: Admin's email address
            quote_title: Title of the quote/invoice
            quote_number: Quote number
            invoice_number: Invoice number from Stripe (optional)
            amount_paid: Amount that was paid (optional)
            customer_name: Customer's name (optional)
            customer_email: Customer's email (optional)
            quote_id: ID of the quote (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        quote_link = f"{FRONTEND_URL}/quotes/{quote_id}" if quote_id else None
        
        subject = f"Reel48 — invoice paid: {quote_title}"
        
        payment_info = ""
        if invoice_number:
            payment_info += f"<p><strong>Invoice Number:</strong> {invoice_number}</p>"
        if amount_paid:
            payment_info += f"<p><strong>Amount Paid:</strong> {amount_paid}</p>"
        
        customer_info = ""
        if customer_name or customer_email:
            customer_info = f"""
            <p><strong>Customer:</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
                {f'<li>Name: {customer_name}</li>' if customer_name else ''}
                {f'<li>Email: {customer_email}</li>' if customer_email else ''}
            </ul>
            """
        
        quote_link_html = ""
        if quote_link:
            quote_link_html = f"""
            <div style="text-align: center; margin: 30px 0;">
                <a href="{quote_link}" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Quote</a>
            </div>
            """
        
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">Invoice paid</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">An invoice has been paid.</p>
        <div style="padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <div style="font-weight: 700; color: {BRAND_PRIMARY};">{quote_title}</div>
          <div style="color:#6b7280; font-size: 13px; margin-top: 6px;">Quote number: <b style="color:#374151;">{quote_number}</b></div>
          <div style="margin-top: 10px; color:#6b7280; font-size: 13px;">{payment_info}</div>
          <div style="margin-top: 10px; color:#6b7280; font-size: 13px;">{customer_info}</div>
        </div>
        {quote_link_html}
        """
        html_content = _wrap_branded_html(
            title="Invoice paid — Reel48",
            inner_html=inner_html,
            preheader=f"Invoice paid for {quote_title}",
        )
        
        text_body = f"""An invoice has been paid:

Quote: {quote_title}
Quote number: {quote_number}
{f'Invoice number: {invoice_number}' if invoice_number else ''}
{f'Amount paid: {amount_paid}' if amount_paid else ''}
{f'Customer: {customer_name} ({customer_email})' if customer_name or customer_email else ''}
{f'View quote: {quote_link}' if quote_link else ''}"""
        text_content = _wrap_branded_text(title="Invoice paid — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_email_verification(
        self,
        to_email: str,
        verification_token: str,
        user_name: Optional[str] = None
    ) -> bool:
        """
        Send email verification email
        
        Args:
            to_email: User's email address
            verification_token: Email verification token
            user_name: User's name (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        verification_link = f"{FRONTEND_URL}/verify-email?token={verification_token}"
        
        subject = "Reel48 — verify your email"
        
        hello = f"Hello{(' ' + user_name) if user_name else ''},"
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">Verify your email</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">{hello}</p>
        <p style="margin: 0 0 18px 0; color: #374151;">
          Thanks for signing up with Reel48. Please verify your email address to finish creating your account.
        </p>
        <div style="text-align:center; margin: 22px 0;">
          <a href="{verification_link}" style="background-color: {BRAND_ACCENT}; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700;">
            Verify email
          </a>
        </div>
        <p style="margin: 18px 0 8px 0; color:#6b7280; font-size: 13px;">If the button doesn’t work, copy and paste this link:</p>
        <p style="margin: 0; word-break: break-all; color: {BRAND_ACCENT}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px;">{verification_link}</p>
        <div style="margin-top: 18px; padding: 14px; background-color: #f9fafb; border-radius: 10px; border: 1px solid #e5e7eb;">
          <div style="font-size: 13px; color: #6b7280;"><b style=\"color:#374151;\">Important:</b> This link expires in 24 hours.</div>
          <div style="font-size: 13px; color: #6b7280; margin-top: 6px;">If you didn’t create an account, you can ignore this email.</div>
        </div>
        """
        html_content = _wrap_branded_html(
            title="Verify your email — Reel48",
            inner_html=inner_html,
            preheader="Verify your email to finish creating your Reel48 account.",
        )
        
        text_body = f"""{hello}

Thanks for signing up with Reel48. Verify your email to finish creating your account:

{verification_link}

Important: This link expires in 24 hours.
If you didn’t create an account, you can ignore this email."""
        text_content = _wrap_branded_text(title="Verify your email — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)

    def send_folder_note_added(
        self,
        *,
        to_email: str,
        folder_id: str,
        folder_name: str,
        note_title: str,
        note_body: str,
        created_at: Optional[str] = None,
    ) -> bool:
        folder_link = f"{FRONTEND_URL}/folders/{folder_id}"
        subject = f"Reel48 update — {folder_name}"

        created_line = f"<div style=\"color:#9ca3af; font-size: 12px; margin-top: 10px;\">{created_at}</div>" if created_at else ""
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">New note added</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">We added a new note to your order.</p>
        <div style="padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <div style="font-weight: 700; color: {BRAND_PRIMARY};">{note_title}</div>
          {created_line}
          <div style="margin-top: 10px; color:#374151; white-space: pre-wrap;">{note_body}</div>
        </div>
        <div style="text-align:center; margin: 22px 0;">
          <a href="{folder_link}" style="background-color: {BRAND_ACCENT}; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700;">
            Open your order folder
          </a>
        </div>
        <p style="margin: 0; color:#6b7280; font-size: 13px;">If you have any questions, just reply in your folder notes.</p>
        """
        html_content = _wrap_branded_html(
            title="New note added — Reel48",
            inner_html=inner_html,
            preheader=f"New note added to your order: {note_title}",
        )

        text_body = f"""We added a new note to your order.

{note_title}
{note_body}

Open your order folder: {folder_link}"""
        text_content = _wrap_branded_text(title="New note added — Reel48", body=text_body)

        return self._send_email(to_email, subject, html_content, text_content)
    
    def send_quote_email(
        self,
        to_email: str,
        quote_title: str,
        quote_number: str,
        quote_id: str,
        share_link: Optional[str] = None,
        pdf_url: Optional[str] = None,
        customer_name: Optional[str] = None,
        sender_name: Optional[str] = None,
        custom_message: Optional[str] = None
    ) -> bool:
        """
        Send quote via email to a customer
        
        Args:
            to_email: Recipient's email address
            quote_title: Title of the quote
            quote_number: Quote number
            quote_id: ID of the quote
            share_link: Shareable link to view quote (optional)
            pdf_url: URL to download PDF (optional)
            customer_name: Customer's name (optional)
            sender_name: Name of person sending (optional)
            custom_message: Custom message to include (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        quote_link = share_link or f"{FRONTEND_URL}/quotes/{quote_id}"
        
        subject = f"Reel48 — quote: {quote_title}"
        
        custom_message_html = ""
        if custom_message:
            custom_message_html = f"""
            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2196f3;">
                <p style="margin: 0; color: #1565c0; font-style: italic;">{custom_message}</p>
            </div>
            """
        
        sender_info = ""
        if sender_name:
            sender_info = f"<p style=\"color: #666; margin-bottom: 0;\">From: {sender_name}</p>"
        
        hello = f"Hello{(' ' + customer_name) if customer_name else ''},"
        pdf_button = (
            f'<a href="{pdf_url}" style="background-color: #ef4444; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700; margin-left: 10px;">Download PDF</a>'
            if pdf_url
            else ""
        )
        inner_html = f"""
        <h2 style="margin: 0 0 12px 0; color: {BRAND_PRIMARY};">Your quote is ready</h2>
        <p style="margin: 0 0 14px 0; color: #374151;">{hello}</p>
        <div style="padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <div style="font-weight: 700; color: {BRAND_PRIMARY};">{quote_title}</div>
          <div style="color:#6b7280; font-size: 13px; margin-top: 6px;">Quote number: <b style="color:#374151;">{quote_number}</b></div>
          <div style="color:#6b7280; font-size: 13px; margin-top: 6px;">{sender_info}</div>
        </div>
        {custom_message_html}
        <div style="text-align:center; margin: 22px 0;">
          <a href="{quote_link}" style="background-color: {BRAND_ACCENT}; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: 700;">
            View quote
          </a>
          {pdf_button}
        </div>
        <p style="margin: 0; color:#6b7280; font-size: 13px;">Please review this quote and let us know if you have any questions.</p>
        """
        html_content = _wrap_branded_html(
            title=f"Quote — Reel48",
            inner_html=inner_html,
            preheader=f"Your Reel48 quote: {quote_title}",
        )
        
        hello = f"Hello{(' ' + customer_name) if customer_name else ''},"
        from_line = f"From: {sender_name}" if sender_name else ""
        pdf_line = f"Download PDF: {pdf_url}" if pdf_url else ""
        msg = (custom_message or "").strip()
        text_body = f"""{hello}

Please find your quote below:

Quote: {quote_title}
Quote number: {quote_number}
{from_line}

{msg}

View quote: {quote_link}
{pdf_line}

Please review this quote and let us know if you have any questions."""
        text_content = _wrap_branded_text(title="Quote — Reel48", body=text_body)
        
        return self._send_email(to_email, subject, html_content, text_content)
    

# Create a singleton instance
email_service = EmailService()

