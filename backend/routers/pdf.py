from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_LEFT
from decimal import Decimal
from io import BytesIO
import sys
import os
import re
import html
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import supabase_storage
from datetime import datetime

router = APIRouter(prefix="/api/pdf", tags=["pdf"])

def convert_links_to_pdf_format(text: str) -> str:
    """
    Convert markdown links [text](url) and plain URLs to ReportLab hyperlink format.
    ReportLab uses <link href="url" color="blue">text</link> for hyperlinks.
    """
    if not text:
        return ""
    
    # Use placeholders to protect link content during processing
    placeholders = {}
    placeholder_counter = 0
    
    # First, find and replace markdown links [text](url) with placeholders
    markdown_link_pattern = r'\[([^\]]+)\]\(([^)]+)\)'
    
    def replace_markdown_with_placeholder(match):
        nonlocal placeholder_counter
        link_text = match.group(1)
        url = match.group(2)
        # Ensure URL has protocol
        if not url.startswith(('http://', 'https://')):
            url = f'https://{url}'
        placeholder = f'__MARKDOWN_LINK_{placeholder_counter}__'
        placeholders[placeholder] = {
            'type': 'markdown',
            'text': link_text,
            'url': url
        }
        placeholder_counter += 1
        return placeholder
    
    text = re.sub(markdown_link_pattern, replace_markdown_with_placeholder, text)
    
    # Then, find and replace plain URLs with placeholders
    # (markdown links are already replaced, so any URLs found are plain URLs)
    url_pattern = r'(https?://[^\s<>"]+|www\.[^\s<>"]+)'
    
    def replace_url_with_placeholder(match):
        nonlocal placeholder_counter
        url = match.group(0)
        full_url = url if url.startswith(('http://', 'https://')) else f'https://{url}'
        placeholder = f'__PLAIN_URL_{placeholder_counter}__'
        placeholders[placeholder] = {
            'type': 'plain',
            'text': url,
            'url': full_url
        }
        placeholder_counter += 1
        return placeholder
    
    text = re.sub(url_pattern, replace_url_with_placeholder, text)
    
    # Now escape the text (placeholders won't be affected as they don't contain special chars)
    text = html.escape(text)
    
    # Replace placeholders with actual link tags
    for placeholder, link_data in placeholders.items():
        url_escaped = html.escape(link_data['url'])
        text_escaped = html.escape(link_data['text'])
        link_tag = f'<link href="{url_escaped}" color="blue"><u>{text_escaped}</u></link>'
        text = text.replace(placeholder, link_tag)
    
    return text

@router.get("/quote/{quote_id}")
async def generate_quote_pdf(
    quote_id: str,
    show_logo: bool = Query(True, description="Include company logo"),
    show_company_info: bool = Query(True, description="Include company/seller information"),
    show_client_info: bool = Query(True, description="Include client/bill-to information"),
    show_notes: bool = Query(True, description="Include notes section"),
    show_terms: bool = Query(True, description="Include terms & conditions"),
    page_size: str = Query("letter", description="PDF page size (letter or A4)"),
    font_size: int = Query(10, description="Base font size (8-14)"),
    color_scheme: str = Query("default", description="Color scheme (default, minimal, colorful)")
):
    """
    Generate PDF for a quote with customization options.
    
    - show_logo: Include company logo
    - show_company_info: Include company/seller information
    - show_client_info: Include client/bill-to information
    - show_notes: Include notes section
    - show_terms: Include terms & conditions
    - page_size: PDF page size (letter or A4)
    - font_size: Base font size (8-14)
    - color_scheme: Color scheme (default, minimal, colorful)
    """
    try:
        # Fetch quote with all relations
        response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote = response.data[0]
        
        # Determine page size
        pagesize = A4 if page_size.lower() == "a4" else letter
        
        # Create PDF buffer
        buffer = BytesIO()
        # Set document title to quote title (shows in PDF tab)
        # Increased margins for better whitespace (1 inch instead of 0.75)
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=pagesize, 
            topMargin=1*inch, 
            bottomMargin=1*inch,
            leftMargin=0.75*inch,
            rightMargin=0.75*inch,
            title=quote.get('title', quote['quote_number'])  # Set PDF document title
        )
        
        # Container for PDF elements
        elements = []
        styles = getSampleStyleSheet()
        
        # Typography hierarchy - Professional font styles
        # Company name style (largest, most prominent)
        company_name_style = ParagraphStyle(
            'CompanyName',
            parent=styles['Heading1'],
            fontSize=17,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=8,
            leading=20,
        )
        
        # Company info style (address, contact details)
        company_info_style = ParagraphStyle(
            'CompanyInfo',
            parent=styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            textColor=colors.HexColor('#333333'),
            spaceAfter=4,
            leading=12,
        )
        
        # Section headers (Items, Notes, Terms)
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=13,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#333333'),
            spaceAfter=10,
            leading=16,
        )
        
        # Quote number style (bold, prominent)
        quote_number_style = ParagraphStyle(
            'QuoteNumber',
            parent=styles['Normal'],
            fontSize=13,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=6,
            leading=16,
        )
        
        # Quote date/info style
        quote_info_style = ParagraphStyle(
            'QuoteInfo',
            parent=styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            spaceAfter=4,
            leading=12,
        )
        
        # Normal body text
        normal_style = ParagraphStyle(
            'Normal',
            parent=styles['Normal'],
            fontSize=max(10, min(11, font_size)),  # Clamp between 10 and 11 for professional look
            fontName='Helvetica',
            textColor=colors.HexColor('#333333'),
            leading=13,
        )
        
        # Bold style for emphasis
        bold_style = ParagraphStyle(
            'Bold',
            parent=normal_style,
            fontName='Helvetica-Bold',
        )
        
        # Fetch company settings
        company_settings = None
        brand_color = None
        try:
            company_response = supabase_storage.table("company_settings").select("*").limit(1).execute()
            if company_response.data:
                company_settings = company_response.data[0]
                # Get brand color if available (for accent lines)
                if company_settings.get('primary_color'):
                    try:
                        brand_color = colors.HexColor(company_settings['primary_color'])
                    except:
                        pass
        except Exception:
            pass  # Continue without company settings if fetch fails
        
        # Header Section: Company info on left, Quote details on right
        header_left = []
        header_right = []
        
        # Left side: Logo and Company Information
        if show_logo and company_settings and company_settings.get('logo_url'):
            try:
                import requests
                # Fetch and add logo image
                logo_response = requests.get(company_settings['logo_url'], timeout=10)
                if logo_response.status_code == 200:
                    # Calculate aspect ratio to maintain proportions
                    from PIL import Image as PILImage
                    img_data = BytesIO(logo_response.content)
                    pil_img = PILImage.open(img_data)
                    img_width, img_height = pil_img.size
                    aspect_ratio = img_width / img_height
                    
                    # Set max dimensions and calculate to maintain aspect ratio
                    max_width = 2 * inch
                    max_height = 0.8 * inch
                    
                    # Calculate dimensions maintaining aspect ratio
                    if aspect_ratio > 1:
                        # Landscape: use max width
                        width = max_width
                        height = width / aspect_ratio
                        if height > max_height:
                            height = max_height
                            width = height * aspect_ratio
                    else:
                        # Portrait: use max height
                        height = max_height
                        width = height * aspect_ratio
                        if width > max_width:
                            width = max_width
                            height = width / aspect_ratio
                    
                    logo_img = Image(BytesIO(logo_response.content), width=width, height=height)
                    header_left.append(logo_img)
                    header_left.append(Spacer(1, 0.15*inch))
            except Exception as e:
                # If logo fails to load, continue without it
                print(f"Warning: Could not load logo: {e}")
                pass
        
        # Company information header (consolidated)
        if show_company_info and company_settings:
            if company_settings.get('company_name'):
                header_left.append(Paragraph(company_settings['company_name'], company_name_style))
            
            company_details = []
            if company_settings.get('address'):
                company_details.append(Paragraph(company_settings['address'], company_info_style))
            if company_settings.get('email'):
                company_details.append(Paragraph(f"Email: {company_settings['email']}", company_info_style))
            if company_settings.get('phone'):
                company_details.append(Paragraph(f"Phone: {company_settings['phone']}", company_info_style))
            if company_settings.get('website'):
                website_with_links = convert_links_to_pdf_format(company_settings['website'])
                company_details.append(Paragraph(f"Website: {website_with_links}", company_info_style))
            if company_settings.get('tax_id'):
                company_details.append(Paragraph(f"Tax ID: {company_settings['tax_id']}", company_info_style))
            
            for detail in company_details:
                header_left.append(detail)
        
        # Right side: Quote Number and Date in boxed section
        quote_date = datetime.fromisoformat(quote['created_at']).strftime('%B %d, %Y')
        quote_info_box = []
        quote_info_box.append([Paragraph(f"<b>Quote Number:</b>", quote_info_style), ""])
        quote_info_box.append([Paragraph(quote['quote_number'], quote_number_style), ""])
        quote_info_box.append(["", ""])  # Empty row for spacing
        quote_info_box.append([Paragraph(f"Date:", quote_info_style), ""])
        quote_info_box.append([Paragraph(quote_date, quote_info_style), ""])
        
        if quote.get('expiration_date'):
            quote_info_box.append(["", ""])  # Empty row for spacing
            quote_info_box.append([Paragraph(f"Valid Until:", quote_info_style), ""])
            expiration_date = datetime.fromisoformat(quote['expiration_date']).strftime('%B %d, %Y')
            quote_info_box.append([Paragraph(expiration_date, quote_info_style), ""])
        
        quote_info_table = Table(quote_info_box, colWidths=[2.5*inch, 0.2*inch])
        quote_info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8f9fa')),
            ('LEFTPADDING', (0, 0), (0, -1), 12),
            ('RIGHTPADDING', (0, 0), (0, -1), 12),
            ('TOPPADDING', (0, 0), (0, -1), 8),
            ('BOTTOMPADDING', (0, 0), (0, -1), 8),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (0, -1), 'TOP'),
            ('GRID', (0, 0), (0, -1), 1, colors.HexColor('#e0e0e0')),
            # Add extra spacing for empty rows
            ('TOPPADDING', (0, 2), (0, 2), 6),  # Spacing after quote number
            ('TOPPADDING', (0, 5), (0, 5), 6),  # Spacing after date (if expiration exists)
        ]))
        header_right.append(quote_info_table)
        
        # Create header table with left and right sections
        if header_left or header_right:
            header_table_data = []
            left_col = []
            right_col = []
            
            if header_left:
                for item in header_left:
                    left_col.append([item])
                left_table = Table(left_col, colWidths=[4*inch])
                left_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
            else:
                left_table = Table([[""]], colWidths=[4*inch])
            
            if header_right:
                for item in header_right:
                    right_col.append([item])
                right_table = Table(right_col, colWidths=[2.7*inch])
                right_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
            else:
                right_table = Table([[""]], colWidths=[2.7*inch])
            
            header_table = Table([[left_table, right_table]], colWidths=[4*inch, 2.7*inch])
            header_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            elements.append(header_table)
            
            # Add accent line below header (using brand color if available)
            accent_color = brand_color if brand_color else colors.HexColor('#667eea')
            elements.append(Spacer(1, 0.15*inch))
            # Create a thin line using a table
            accent_line = Table([[""]], colWidths=[6.7*inch], rowHeights=[2])
            accent_line.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), accent_color),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))
            elements.append(accent_line)
            elements.append(Spacer(1, 0.4*inch))
        
        # Billing Information: Two-column layout for "From" and "Bill To"
        billing_data = []
        
        # Left column: From (Company/Seller)
        from_column = []
        if show_company_info and company_settings:
            from_column.append([Paragraph("<b>From:</b>", heading_style), ""])
            if company_settings.get('company_name'):
                from_column.append([Paragraph(company_settings['company_name'], normal_style), ""])
            if company_settings.get('address'):
                from_column.append([Paragraph(company_settings['address'], normal_style), ""])
            if company_settings.get('email'):
                from_column.append([Paragraph(f"Email: {company_settings['email']}", normal_style), ""])
            if company_settings.get('phone'):
                from_column.append([Paragraph(f"Phone: {company_settings['phone']}", normal_style), ""])
        
        # Right column: Bill To (Client)
        bill_to_column = []
        if show_client_info and quote.get('clients'):
            client = quote['clients']
            bill_to_column.append([Paragraph("<b>Bill To:</b>", heading_style), ""])
            if client.get('name'):
                bill_to_column.append([Paragraph(client.get('name', ''), normal_style), ""])
            if client.get('company'):
                bill_to_column.append([Paragraph(client['company'], normal_style), ""])
            if client.get('email'):
                bill_to_column.append([Paragraph(f"Email: {client['email']}", normal_style), ""])
            if client.get('phone'):
                bill_to_column.append([Paragraph(f"Phone: {client['phone']}", normal_style), ""])
            if client.get('address'):
                bill_to_column.append([Paragraph(client['address'], normal_style), ""])
        
        # Create two-column layout with balanced widths and proper spacing
        if from_column or bill_to_column:
            # Create tables for each column
            from_table = None
            bill_to_table = None
            
            if from_column:
                from_table = Table(from_column, colWidths=[3*inch])
                from_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 0),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                    ('TOPPADDING', (0, 1), (-1, -1), 4),  # Add spacing between lines
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ]))
            
            if bill_to_column:
                bill_to_table = Table(bill_to_column, colWidths=[3*inch])
                bill_to_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 0),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                    ('TOPPADDING', (0, 1), (-1, -1), 4),  # Add spacing between lines
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ]))
            
            # Combine into side-by-side layout
            if from_table and bill_to_table:
                combined_table = Table([[from_table, bill_to_table]], colWidths=[3.2*inch, 3.2*inch])
                combined_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                    ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                elements.append(combined_table)
            elif from_table:
                elements.append(from_table)
            elif bill_to_table:
                elements.append(bill_to_table)
            
            elements.append(Spacer(1, 0.5*inch))  # Increased spacing
        
        # Line items table
        elements.append(Paragraph("Items", heading_style))
        elements.append(Spacer(1, 0.15*inch))
        
        line_items_data = [["Description", "Qty", "Unit Price", "Discount", "Total"]]
        
        for item in quote.get('line_items', []):
            qty = Decimal(item['quantity'])
            unit_price = Decimal(item['unit_price'])
            discount = Decimal(item.get('discount_percent', 0))
            subtotal = qty * unit_price
            discount_amount = subtotal * discount / Decimal("100")
            total = subtotal - discount_amount
            
            line_items_data.append([
                Paragraph(item['description'], normal_style),
                Paragraph(str(qty), normal_style),
                Paragraph(f"${unit_price:.2f}", normal_style),
                Paragraph(f"{discount}%" if discount > 0 else "-", normal_style),
                Paragraph(f"${total:.2f}", normal_style)
            ])
        
        # Financial Summary Section - positioned in distinct bottom-right area
        subtotal = Decimal(quote['subtotal'])
        tax_amount = Decimal(quote['tax_amount'])
        tax_rate = Decimal(quote.get('tax_rate', 0))
        total = Decimal(quote['total'])
        
        # Calculate number of data rows (excluding header and summary rows)
        num_data_rows = len(quote.get('line_items', []))
        # Add summary rows
        line_items_data.append(["", "", "", "", ""])  # Empty row for spacing
        line_items_data.append(["", "", "", Paragraph("Subtotal:", normal_style), Paragraph(f"${subtotal:.2f}", normal_style)])
        if tax_amount > 0:
            line_items_data.append(["", "", "", Paragraph(f"Tax ({tax_rate}%):", normal_style), Paragraph(f"${tax_amount:.2f}", normal_style)])
        # Final total with bold and background highlight
        line_items_data.append(["", "", "", Paragraph("<b>Total:</b>", bold_style), Paragraph(f"<b>${total:.2f}</b>", bold_style)])
        
        items_table = Table(line_items_data, colWidths=[3*inch, 0.8*inch, 1*inch, 1*inch, 1*inch])
        items_table.setStyle(TableStyle([
            # Header row styling
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            # Column alignment: Description left, quantitative columns right
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),  # Description
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),  # Qty - right-aligned
            ('ALIGN', (2, 0), (2, -1), 'RIGHT'),  # Unit Price - right-aligned
            ('ALIGN', (3, 0), (3, -1), 'RIGHT'),  # Discount - right-aligned
            ('ALIGN', (4, 0), (4, -1), 'RIGHT'),  # Total - right-aligned
            # Data rows styling
            ('FONTNAME', (0, 1), (-1, num_data_rows), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            # Summary rows styling (subtotal, tax, total)
            ('FONTNAME', (3, num_data_rows + 2), (4, -1), 'Helvetica-Bold'),
            # Final total row - highlighted background
            ('BACKGROUND', (3, -1), (4, -1), colors.HexColor('#f8f9fa')),
            ('TOPPADDING', (3, -1), (4, -1), 10),
            ('BOTTOMPADDING', (3, -1), (4, -1), 10),
            # Grid and borders
            ('GRID', (0, 0), (-1, num_data_rows), 1, colors.HexColor('#e0e0e0')),
            ('LINEBELOW', (0, num_data_rows + 1), (-1, num_data_rows + 1), 1, colors.HexColor('#666666')),
            ('LINEBELOW', (3, -1), (4, -1), 2, colors.HexColor('#333333')),  # Thicker line under total
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 0.5*inch))  # Increased spacing
        
        # Quote Validity and Status Information
        validity_info = []
        if quote.get('expiration_date'):
            expiration_date = datetime.fromisoformat(quote['expiration_date']).strftime('%B %d, %Y')
            validity_info.append(f"This quote is valid until {expiration_date}.")
        else:
            # Default validity period if not specified
            validity_info.append("This quote is valid for 30 days from the date of issue.")
        
        if quote.get('status'):
            status_text = quote['status'].title()
            if status_text == 'Draft':
                validity_info.append("This is a draft quote and requires approval before acceptance.")
            elif status_text == 'Sent':
                validity_info.append("Please review this quote and contact us with any questions.")
            elif status_text == 'Accepted':
                validity_info.append("This quote has been accepted. An invoice will be generated for payment.")
        
        if validity_info:
            validity_paragraph = Paragraph(
                "<i>" + " ".join(validity_info) + "</i>",
                ParagraphStyle(
                    'ValidityInfo',
                    parent=normal_style,
                    fontSize=9,
                    textColor=colors.HexColor('#666666'),
                    spaceAfter=12,
                )
            )
            elements.append(validity_paragraph)
            elements.append(Spacer(1, 0.3*inch))
        
        # Notes and terms
        if show_notes and quote.get('notes'):
            elements.append(Paragraph("Notes:", heading_style))
            notes_with_links = convert_links_to_pdf_format(quote['notes'])
            elements.append(Paragraph(notes_with_links, normal_style))
            elements.append(Spacer(1, 0.3*inch))  # Increased spacing
        
        if show_terms and quote.get('terms'):
            elements.append(Paragraph("Terms & Conditions:", heading_style))
            terms_with_links = convert_links_to_pdf_format(quote['terms'])
            elements.append(Paragraph(terms_with_links, normal_style))
            elements.append(Spacer(1, 0.2*inch))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        # Use quote number as filename (e.g., "QT-20250101-ABC123.pdf")
        filename = f"{quote['quote_number']}.pdf"
        
        return Response(
            content=buffer.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

