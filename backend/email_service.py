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
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@formsapp.com")  # Default sender email
FROM_NAME = os.getenv("FROM_NAME", "Forms App")  # Default sender name
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")  # Frontend URL for password reset links
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


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
                print(f"SUCCESS: AWS SES initialized. Quota: {max_24_hour_send} emails/day")
                self.client = self.ses_client
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                if error_code == 'AccessDenied':
                    logger.warning("AWS SES access denied. Check IAM permissions.")
                    print("WARNING: AWS SES access denied. App Runner service role needs ses:SendEmail permission.")
                else:
                    logger.warning(f"AWS SES verification failed: {error_code}")
                self.client = None
        except ImportError:
            logger.error("boto3 not installed. Install with: pip install boto3")
            print("ERROR: boto3 not installed. Run: pip install boto3")
            self.client = None
        except Exception as e:
            logger.error(f"Failed to initialize AWS SES: {str(e)}", exc_info=True)
            print(f"ERROR: Failed to initialize AWS SES: {str(e)}")
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
            print(f"ERROR: {error_msg}")
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
            print(f"SUCCESS: Email sent to {to_email} via AWS SES (MessageId: {message_id})")
            return True
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            logger.error(f"AWS SES error - {error_code}: {error_message}")
            print(f"ERROR: AWS SES - {error_code}: {error_message}")
            
            if error_code == 'MessageRejected':
                print("  → Sender email may not be verified. Check AWS SES Console → Verified identities")
            elif error_code == 'MailFromDomainNotVerified':
                print("  → Mail-from domain not verified. Verify your domain in AWS SES")
            elif error_code == 'AccessDenied':
                print("  → IAM permissions issue. App Runner service role needs ses:SendEmail permission")
            
            return False
        except Exception as e:
            logger.error(f"Exception sending email via AWS SES: {str(e)}", exc_info=True)
            print(f"ERROR: {str(e)}")
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
        
        subject = "Reset Your Password"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2c3e50; margin-top: 0;">Password Reset Request</h1>
                <p>Hello{(' ' + user_name) if user_name else ''},</p>
                <p>We received a request to reset your password. Click the button below to create a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
                </div>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #007bff;">{reset_link}</p>
                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                    <strong>This link will expire in 1 hour.</strong><br>
                    If you didn't request a password reset, please ignore this email.
                </p>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">
                This is an automated message. Please do not reply to this email.
            </p>
        </body>
        </html>
        """
        
        text_content = f"""
        Password Reset Request
        
        Hello{(' ' + user_name) if user_name else ''},
        
        We received a request to reset your password. Click the link below to create a new password:
        
        {reset_link}
        
        This link will expire in 1 hour.
        
        If you didn't request a password reset, please ignore this email.
        """
        
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
        
        subject = f"New Form Assigned: {form_name}"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Form Assigned</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2c3e50; margin-top: 0;">New Form Assigned</h1>
                <p>Hello{(' ' + user_name) if user_name else ''},</p>
                <p>A new form has been assigned to you:</p>
                <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff;">
                    <h2 style="margin-top: 0; color: #007bff;">{form_name}</h2>
                    {f'<p style="color: #666; margin-bottom: 0;">Assigned by: {assigned_by}</p>' if assigned_by else ''}
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{form_link}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Form</a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    Please complete this form at your earliest convenience.
                </p>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">
                This is an automated message. Please do not reply to this email.
            </p>
        </body>
        </html>
        """
        
        text_content = f"""
        New Form Assigned
        
        Hello{(' ' + user_name) if user_name else ''},
        
        A new form has been assigned to you: {form_name}
        
        {f'Assigned by: {assigned_by}' if assigned_by else ''}
        
        View the form here: {form_link}
        
        Please complete this form at your earliest convenience.
        """
        
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
        
        subject = f"New Quote Assigned: {quote_title}"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Quote Assigned</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2c3e50; margin-top: 0;">New Quote Assigned</h1>
                <p>Hello{(' ' + user_name) if user_name else ''},</p>
                <p>A new quote has been assigned to you:</p>
                <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
                    <h2 style="margin-top: 0; color: #28a745;">{quote_title}</h2>
                    <p style="color: #666; margin: 5px 0;"><strong>Quote Number:</strong> {quote_number}</p>
                    {f'<p style="color: #666; margin-bottom: 0;">Assigned by: {assigned_by}</p>' if assigned_by else ''}
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{quote_link}" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Quote</a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    Please review this quote and let us know if you have any questions.
                </p>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">
                This is an automated message. Please do not reply to this email.
            </p>
        </body>
        </html>
        """
        
        text_content = f"""
        New Quote Assigned
        
        Hello{(' ' + user_name) if user_name else ''},
        
        A new quote has been assigned to you:
        
        Quote: {quote_title}
        Quote Number: {quote_number}
        {f'Assigned by: {assigned_by}' if assigned_by else ''}
        
        View the quote here: {quote_link}
        
        Please review this quote and let us know if you have any questions.
        """
        
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
            subject = f"New Form Submission: {form_name}"
            
            submitter_info = ""
            if submitter_name or submitter_email:
                submitter_info = f"""
                <p><strong>Submitted by:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    {f'<li>Name: {submitter_name}</li>' if submitter_name else ''}
                    {f'<li>Email: {submitter_email}</li>' if submitter_email else ''}
                </ul>
                """
            
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>New Form Submission</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                    <h1 style="color: #2c3e50; margin-top: 0;">New Form Submission</h1>
                    <p>A new submission has been received for the form:</p>
                    <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff;">
                        <h2 style="margin-top: 0; color: #007bff;">{form_name}</h2>
                        {submitter_info}
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{submission_link}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Submission</a>
                    </div>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center;">
                    This is an automated message. Please do not reply to this email.
                </p>
            </body>
            </html>
            """
            
            text_content = f"""
            New Form Submission
            
            A new submission has been received for the form: {form_name}
            
            {f'Submitted by: {submitter_name} ({submitter_email})' if submitter_name or submitter_email else ''}
            
            View the submission here: {submission_link}
            """
        
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
        
        subject = f"Quote Accepted: {quote_title}"
        
        customer_info = ""
        if customer_name or customer_email:
            customer_info = f"""
            <p><strong>Accepted by:</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
                {f'<li>Name: {customer_name}</li>' if customer_name else ''}
                {f'<li>Email: {customer_email}</li>' if customer_email else ''}
            </ul>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Quote Accepted</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2c3e50; margin-top: 0;">Quote Accepted</h1>
                <p>A quote has been accepted by a customer:</p>
                <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
                    <h2 style="margin-top: 0; color: #28a745;">{quote_title}</h2>
                    <p style="color: #666; margin: 5px 0;"><strong>Quote Number:</strong> {quote_number}</p>
                    {customer_info}
                </div>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{quote_link}" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Quote</a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    You may want to create an invoice for this quote.
                </p>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">
                This is an automated message. Please do not reply to this email.
            </p>
        </body>
        </html>
        """
        
        text_content = f"""
        Quote Accepted
        
        A quote has been accepted by a customer:
        
        Quote: {quote_title}
        Quote Number: {quote_number}
        {f'Accepted by: {customer_name} ({customer_email})' if customer_name or customer_email else ''}
        
        View the quote here: {quote_link}
        
        You may want to create an invoice for this quote.
        """
        
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
        subject = f"Payment Received: {quote_title}"
        
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
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Received</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2c3e50; margin-top: 0;">Payment Received</h1>
                <p>Hello{(' ' + customer_name) if customer_name else ''},</p>
                <p>Thank you! We have received your payment for:</p>
                <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
                    <h2 style="margin-top: 0; color: #28a745;">{quote_title}</h2>
                    <p style="color: #666; margin: 5px 0;"><strong>Quote Number:</strong> {quote_number}</p>
                    {invoice_info}
                </div>
                {invoice_link_html}
                <p style="color: #666; font-size: 14px;">
                    Your payment has been processed successfully. A receipt has been generated for your records.
                </p>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">
                This is an automated message. Please do not reply to this email.
            </p>
        </body>
        </html>
        """
        
        text_content = f"""
        Payment Received
        
        Hello{(' ' + customer_name) if customer_name else ''},
        
        Thank you! We have received your payment for:
        
        Quote: {quote_title}
        Quote Number: {quote_number}
        {f'Invoice Number: {invoice_number}' if invoice_number else ''}
        {f'Amount Paid: {amount_paid}' if amount_paid else ''}
        
        {f'View invoice: {invoice_url}' if invoice_url else ''}
        
        Your payment has been processed successfully. A receipt has been generated for your records.
        """
        
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
        
        subject = f"Invoice Paid: {quote_title}"
        
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
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice Paid</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2c3e50; margin-top: 0;">Invoice Paid</h1>
                <p>An invoice has been paid:</p>
                <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
                    <h2 style="margin-top: 0; color: #28a745;">{quote_title}</h2>
                    <p style="color: #666; margin: 5px 0;"><strong>Quote Number:</strong> {quote_number}</p>
                    {payment_info}
                    {customer_info}
                </div>
                {quote_link_html}
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">
                This is an automated message. Please do not reply to this email.
            </p>
        </body>
        </html>
        """
        
        text_content = f"""
        Invoice Paid
        
        An invoice has been paid:
        
        Quote: {quote_title}
        Quote Number: {quote_number}
        {f'Invoice Number: {invoice_number}' if invoice_number else ''}
        {f'Amount Paid: {amount_paid}' if amount_paid else ''}
        {f'Customer: {customer_name} ({customer_email})' if customer_name or customer_email else ''}
        
        {f'View quote: {quote_link}' if quote_link else ''}
        """
        
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
        
        subject = "Verify Your Email Address"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email - Reel48</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                <!-- Reel48 Branding Header -->
                <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0;">
                    <h1 style="color: #1f2937; margin: 0 0 10px 0; font-size: 28px; font-weight: 600;">Reel48</h1>
                    <p style="color: #6b7280; margin: 0; font-size: 14px;">Email Verification</p>
                </div>
                
                <h2 style="color: #1f2937; margin-top: 0; font-size: 24px; font-weight: 600;">Verify Your Email Address</h2>
                <p style="color: #374151; font-size: 16px; margin-bottom: 10px;">Hello{(' ' + user_name) if user_name else ''},</p>
                <p style="color: #374151; font-size: 16px; margin-bottom: 30px;">
                    Thank you for signing up with Reel48! To complete your registration and secure your account, please verify your email address by clicking the button below:
                </p>
                
                <div style="text-align: center; margin: 40px 0;">
                    <a href="{verification_link}" style="background-color: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2); transition: background-color 0.2s;">
                        Verify Email Address
                    </a>
                </div>
                
                <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #2563eb;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0; font-weight: 600;">Alternative Method:</p>
                    <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #2563eb; font-size: 13px; margin: 0; font-family: monospace;">{verification_link}</p>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                        <strong style="color: #374151;">Important:</strong> This verification link will expire in 24 hours for security reasons.
                    </p>
                    <p style="color: #6b7280; font-size: 14px; margin: 0;">
                        If you didn't create an account with Reel48, you can safely ignore this email. No further action is required.
                    </p>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    This is an automated message from Reel48. Please do not reply to this email.
                </p>
                <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
                    If you have any questions, please contact our support team.
                </p>
            </div>
        </body>
        </html>
        """
        
        text_content = f"""
        Verify Your Email Address - Reel48
        
        Hello{(' ' + user_name) if user_name else ''},
        
        Thank you for signing up with Reel48! To complete your registration and secure your account, please verify your email address by clicking the link below:
        
        {verification_link}
        
        Important: This verification link will expire in 24 hours for security reasons.
        
        If you didn't create an account with Reel48, you can safely ignore this email. No further action is required.
        
        ---
        This is an automated message from Reel48. Please do not reply to this email.
        """
        
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
        
        subject = f"Quote: {quote_title}"
        
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
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Quote: {quote_title}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
                <h1 style="color: #2c3e50; margin-top: 0;">Quote: {quote_title}</h1>
                <p>Hello{(' ' + customer_name) if customer_name else ''},</p>
                <p>Please find your quote below:</p>
                <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea;">
                    <h2 style="margin-top: 0; color: #667eea;">{quote_title}</h2>
                    <p style="color: #666; margin: 5px 0;"><strong>Quote Number:</strong> {quote_number}</p>
                    {sender_info}
                </div>
                {custom_message_html}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{quote_link}" style="background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 5px;">View Quote</a>
                    {f'<a href="{pdf_url}" style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 5px;">Download PDF</a>' if pdf_url else ''}
                </div>
                <p style="color: #666; font-size: 14px;">
                    Please review this quote and let us know if you have any questions.
                </p>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center;">
                This is an automated message. Please do not reply to this email.
            </p>
        </body>
        </html>
        """
        
        text_content = f"""
        Quote: {quote_title}
        
        Hello{(' ' + customer_name) if customer_name else ''},
        
        Please find your quote below:
        
        Quote: {quote_title}
        Quote Number: {quote_number}
        {f'From: {sender_name}' if sender_name else ''}
        
        {custom_message if custom_message else ''}
        
        View the quote here: {quote_link}
        {f'Download PDF: {pdf_url}' if pdf_url else ''}
        
        Please review this quote and let us know if you have any questions.
        """
        
        return self._send_email(to_email, subject, html_content, text_content)
    

# Create a singleton instance
email_service = EmailService()

