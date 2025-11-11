"""
Email service using AWS SES (Simple Email Service)
Recommended for AWS App Runner deployments - free tier of 3,000 emails/month
"""
import os
from typing import Optional
import boto3
from botocore.exceptions import ClientError
import logging

logger = logging.getLogger(__name__)

# Get configuration from environment
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@formsapp.com")
FROM_NAME = os.getenv("FROM_NAME", "Forms App")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


class EmailService:
    """Service for sending emails via AWS SES"""
    
    def __init__(self):
        """Initialize email service with AWS SES"""
        logger.info("Initializing EmailService with AWS SES...")
        logger.info(f"AWS_REGION: {AWS_REGION}")
        logger.info(f"FROM_EMAIL: {FROM_EMAIL}")
        logger.info(f"FROM_NAME: {FROM_NAME}")
        logger.info(f"FRONTEND_URL: {FRONTEND_URL}")
        
        try:
            # Initialize SES client
            # boto3 will use default AWS credentials from environment or IAM role
            self.ses_client = boto3.client('ses', region_name=AWS_REGION)
            
            # Verify SES is accessible
            try:
                # Get send quota to verify access
                response = self.ses_client.get_send_quota()
                max_24_hour_send = response.get('Max24HourSend', 0)
                max_send_rate = response.get('MaxSendRate', 0)
                logger.info(f"AWS SES initialized successfully. Max 24h send: {max_24_hour_send}, Max send rate: {max_send_rate}/sec")
                print(f"SUCCESS: AWS SES initialized. Quota: {max_24_hour_send} emails/day")
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                if error_code == 'AccessDenied':
                    logger.warning("AWS SES access denied. Check IAM permissions.")
                    print("WARNING: AWS SES access denied. The App Runner service role needs SES permissions.")
                else:
                    logger.warning(f"AWS SES verification failed: {error_code}")
                    print(f"WARNING: Could not verify AWS SES access: {error_code}")
            
            self.client = self.ses_client  # For compatibility
            
        except Exception as e:
            logger.error(f"Failed to initialize AWS SES client: {str(e)}", exc_info=True)
            print(f"ERROR: Failed to initialize AWS SES: {str(e)}")
            import traceback
            traceback.print_exc()
            self.ses_client = None
            self.client = None
    
    def _send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send an email using AWS SES
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML email body
            text_content: Plain text email body (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        if not self.ses_client:
            logger.error("AWS SES client not initialized. Email sending disabled.")
            print("ERROR: AWS SES client not initialized")
            return False
        
        try:
            # Prepare email message
            message = {
                'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                'Body': {
                    'Html': {'Data': html_content, 'Charset': 'UTF-8'}
                }
            }
            
            # Add text content if provided
            if text_content:
                message['Body']['Text'] = {'Data': text_content, 'Charset': 'UTF-8'}
            
            # Send email
            logger.info(f"Attempting to send email to {to_email} via AWS SES...")
            response = self.ses_client.send_email(
                Source=f"{FROM_NAME} <{FROM_EMAIL}>",
                Destination={'ToAddresses': [to_email]},
                Message=message
            )
            
            message_id = response.get('MessageId')
            logger.info(f"Email sent successfully to {to_email} (MessageId: {message_id})")
            print(f"SUCCESS: Email sent to {to_email} (MessageId: {message_id})")
            return True
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            logger.error(f"Failed to send email via AWS SES. Code: {error_code}, Message: {error_message}")
            print(f"ERROR: AWS SES error - {error_code}: {error_message}")
            
            # Provide helpful error messages
            if error_code == 'MessageRejected':
                print("  → Sender email may not be verified. Check AWS SES Console → Verified identities")
            elif error_code == 'MailFromDomainNotVerified':
                print("  → Mail-from domain not verified. Verify your domain in AWS SES")
            elif error_code == 'AccountSendingPausedException':
                print("  → Account sending is paused. Check AWS SES Console")
            elif error_code == 'ConfigurationSetDoesNotExist':
                print("  → Configuration set doesn't exist (if using one)")
            elif error_code == 'AccessDenied':
                print("  → IAM permissions issue. App Runner service role needs ses:SendEmail permission")
            
            return False
            
        except Exception as e:
            error_msg = f"Exception sending email to {to_email}: {str(e)}"
            logger.error(error_msg, exc_info=True)
            print(f"ERROR: {error_msg}")
            import traceback
            traceback.print_exc()
            return False
    
    def send_password_reset_email(
        self,
        to_email: str,
        reset_token: str,
        user_name: Optional[str] = None
    ) -> bool:
        """Send password reset email"""
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
        """Send email notification when a form is assigned to a customer"""
        form_link = f"{FRONTEND_URL}/forms/{form_id}"
        
        subject = f"New Form Assigned: {form_name}"
        
        submitter_info = ""
        if assigned_by:
            submitter_info = f"<p style=\"color: #666; margin-bottom: 0;\">Assigned by: {assigned_by}</p>"
        
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
                    {submitter_info}
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
        """Send email notification when a quote is assigned to a customer"""
        quote_link = f"{FRONTEND_URL}/quotes/{quote_id}"
        
        subject = f"New Quote Assigned: {quote_title}"
        
        assigned_by_info = ""
        if assigned_by:
            assigned_by_info = f"<p style=\"color: #666; margin-bottom: 0;\">Assigned by: {assigned_by}</p>"
        
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
                    {assigned_by_info}
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
        """Send email notification to admin when a form is submitted"""
        submission_link = f"{FRONTEND_URL}/forms/{form_id}/submissions/{submission_id}" if submission_id else f"{FRONTEND_URL}/forms/{form_id}/submissions"
        
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
        """Send email notification to admin when a quote is accepted"""
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
        """Send email notification to customer when invoice is paid"""
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
        """Send email notification to admin when invoice is paid"""
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


# Create a singleton instance
email_service = EmailService()

