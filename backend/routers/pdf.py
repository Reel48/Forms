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
        # Compact margins for single-page fit
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=pagesize, 
            topMargin=0.6*inch, 
            bottomMargin=0.5*inch,
            leftMargin=0.6*inch,
            rightMargin=0.6*inch,
            title=quote.get('title', quote['quote_number'])  # Set PDF document title
        )
        
        # Container for PDF elements
        elements = []
        styles = getSampleStyleSheet()
        
        # Typography hierarchy - Compact professional font styles for single-page design
        # Company name style (slightly smaller for compact design)
        company_name_style = ParagraphStyle(
            'CompanyName',
            parent=styles['Heading1'],
            fontSize=15,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=4,
            leading=18,
            leftIndent=0,
        )
        
        # Company info style (address, contact details) - compact 9pt
        company_info_style = ParagraphStyle(
            'CompanyInfo',
            parent=styles['Normal'],
            fontSize=9,
            fontName='Helvetica',
            textColor=colors.HexColor('#333333'),
            spaceAfter=2,
            leading=9,  # Reduced from 10 for tighter spacing
            leftIndent=0,
        )
        
        # Section headers (Items, Customer Information)
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=11,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#333333'),
            spaceAfter=6,
            leading=12,  # Reduced from 14 for tighter spacing
            leftIndent=0,
        )
        
        # Quote title style (for "Quote" header)
        quote_title_style = ParagraphStyle(
            'QuoteTitle',
            parent=styles['Heading2'],
            fontSize=14,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=8,
            leading=16,
        )
        
        # Quote number style (bold, prominent)
        quote_number_style = ParagraphStyle(
            'QuoteNumber',
            parent=styles['Normal'],
            fontSize=11,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=4,
            leading=13,
        )
        
        # Quote date/info style
        quote_info_style = ParagraphStyle(
            'QuoteInfo',
            parent=styles['Normal'],
            fontSize=9,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            spaceAfter=3,
            leading=10,  # Reduced from 11 for tighter spacing
        )
        
        # Status note style
        status_note_style = ParagraphStyle(
            'StatusNote',
            parent=styles['Normal'],
            fontSize=9,
            fontName='Helvetica',
            textColor=colors.HexColor('#d32f2f'),
            spaceAfter=0,
            leading=11,
        )
        
        # Normal body text (compact)
        normal_style = ParagraphStyle(
            'Normal',
            parent=styles['Normal'],
            fontSize=9,
            fontName='Helvetica',
            textColor=colors.HexColor('#333333'),
            leading=10,  # Reduced from 11 for tighter spacing - most important change
            leftIndent=0,
        )
        
        # Bold style for emphasis
        bold_style = ParagraphStyle(
            'Bold',
            parent=normal_style,
            fontName='Helvetica-Bold',
        )
        
        # Footer note style
        footer_note_style = ParagraphStyle(
            'FooterNote',
            parent=styles['Normal'],
            fontSize=8,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            spaceAfter=0,
            leading=10,
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
        
        # Header Section: Compact design - Logo + Company Info (Left), Document Details (Right)
        header_left = []
        header_right = []
        
        # Left side: Small Logo + Company Name + Compact Contact Block
        if show_logo and company_settings and company_settings.get('logo_url'):
            try:
                import requests
                # Fetch and add logo image - smaller size for compact design
                logo_response = requests.get(company_settings['logo_url'], timeout=10)
                if logo_response.status_code == 200:
                    from PIL import Image as PILImage
                    img_data = BytesIO(logo_response.content)
                    pil_img = PILImage.open(img_data)
                    img_width, img_height = pil_img.size
                    aspect_ratio = img_width / img_height
                    
                    # Smaller max dimensions for compact header - reduced height to save vertical space
                    max_width = 1.2 * inch
                    max_height = 0.4 * inch  # Reduced from 0.5 to save space
                    
                    if aspect_ratio > 1:
                        width = max_width
                        height = width / aspect_ratio
                        if height > max_height:
                            height = max_height
                            width = height * aspect_ratio
                    else:
                        height = max_height
                        width = height * aspect_ratio
                        if width > max_width:
                            width = max_width
                            height = width / aspect_ratio
                    
                    logo_img = Image(BytesIO(logo_response.content), width=width, height=height)
                    header_left.append(logo_img)
                    header_left.append(Spacer(1, 0.08*inch))  # Minimal spacing
            except Exception as e:
                print(f"Warning: Could not load logo: {e}")
                pass
        
        # Company Name and Compact Contact Block
        if show_company_info and company_settings:
            if company_settings.get('company_name'):
                header_left.append(Paragraph(company_settings['company_name'], company_name_style))
            
            # Compact contact block - vertical list with minimal spacing
            contact_items = []
            if company_settings.get('address'):
                contact_items.append(Paragraph(company_settings['address'], company_info_style))
            if company_settings.get('email'):
                contact_items.append(Paragraph(company_settings['email'], company_info_style))
            if company_settings.get('phone'):
                contact_items.append(Paragraph(company_settings['phone'], company_info_style))
            if company_settings.get('website'):
                website_with_links = convert_links_to_pdf_format(company_settings['website'])
                contact_items.append(Paragraph(website_with_links, company_info_style))
            
            for item in contact_items:
                header_left.append(item)
        
        # Right side: Document Details Box - "Quote" title, Quote Number, Date, Status Note
        quote_date = datetime.fromisoformat(quote['created_at']).strftime('%B %d, %Y')
        quote_info_box = []
        
        # Title "QUOTE"
        quote_info_box.append([Paragraph("<b>QUOTE</b>", quote_info_style), ""])
        
        # Quote Number
        quote_info_box.append([Paragraph(f"<b>{quote['quote_number']}</b>", quote_number_style), ""])
        
        # Date
        quote_info_box.append([Paragraph(quote_date, quote_info_style), ""])
        
        # Status Note (Draft Quote - Approval Required)
        quote_status = quote.get('status', '').lower()
        if quote_status == 'draft':
            quote_info_box.append([Paragraph("Draft Quote - Approval Required", status_note_style), ""])
        
        # Clean, unshaded quote info - simple text layout with minimal padding
        quote_info_table = Table(quote_info_box, colWidths=[2.3*inch, 0.1*inch])
        quote_info_table.setStyle(TableStyle([
            # No background, no border - clean text only
            ('LEFTPADDING', (0, 0), (0, -1), 0),
            ('RIGHTPADDING', (0, 0), (0, -1), 0),
            # Significantly reduced vertical padding for all rows
            ('TOPPADDING', (0, 0), (0, -1), 1),    # Reduced from 3
            ('BOTTOMPADDING', (0, 0), (0, -1), 1), # Reduced from 3
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (0, -1), 'TOP'),
        ]))
        header_right.append(quote_info_table)
        
        # Create header table with left and right sections
        if header_left or header_right:
            left_col = []
            right_col = []
            
            if header_left:
                for item in header_left:
                    left_col.append([item])
                left_table = Table(left_col, colWidths=[3.5*inch])
                left_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    # Note: ReportLab respects the DocTemplate margin by default unless overridden
                ]))
            else:
                left_table = Table([[""]], colWidths=[3.5*inch])
            
            if header_right:
                for item in header_right:
                    right_col.append([item])
                right_table = Table(right_col, colWidths=[2.4*inch])
                right_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
            else:
                right_table = Table([[""]], colWidths=[2.4*inch])
            
            header_table = Table([[left_table, right_table]], colWidths=[3.5*inch, 2.4*inch])
            header_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                # Note: ReportLab respects the DocTemplate margin by default unless overridden
            ]))
            elements.append(header_table)
            elements.append(Spacer(1, 0.25*inch))  # Reduced spacing
        
        # Customer Information (Bill To) - Company info already in header, so only show customer
        if show_client_info and quote.get('clients'):
            client = quote['clients']
            customer_info = []
            customer_info.append([Paragraph("<b>Customer Information</b>", heading_style), ""])
            
            # Name
            if client.get('name'):
                customer_info.append([Paragraph(client.get('name', ''), normal_style), ""])
            
            # Company (if provided)
            if client.get('company'):
                customer_info.append([Paragraph(client['company'], normal_style), ""])
            
            # Address
            if client.get('address'):
                customer_info.append([Paragraph(client['address'], normal_style), ""])
            
            # Email and Phone grouped together
            contact_info = []
            if client.get('email'):
                contact_info.append(f"Email: {client['email']}")
            if client.get('phone'):
                contact_info.append(f"Phone: {client['phone']}")
            if contact_info:
                customer_info.append([Paragraph(", ".join(contact_info), normal_style), ""])
            
            # Ensure customer table aligns to same left margin as header and items
            customer_table = Table(customer_info, colWidths=[5.5*inch])
            customer_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                # Note: ReportLab respects the DocTemplate margin by default unless overridden
                ('TOPPADDING', (0, 1), (-1, -1), 3),  # Compact spacing between lines
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            elements.append(customer_table)
            elements.append(Spacer(1, 0.25*inch))  # Reduced spacing
        
        # Line items table - Compact design with thin lines and minimal padding
        elements.append(Paragraph("Items", heading_style))
        elements.append(Spacer(1, 0.1*inch))
        
        # Table with Description, Qty, Unit Price, Total (removed Discount column for simplicity)
        line_items_data = [["Description", "Qty", "Unit Price", "Total"]]
        
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
                Paragraph(f"${total:.2f}", normal_style)
            ])
        
        # Financial Summary - Merge into items table
        subtotal = Decimal(quote['subtotal'])
        tax_amount = Decimal(quote['tax_amount'])
        tax_rate = Decimal(quote.get('tax_rate', 0))
        total = Decimal(quote['total'])
        
        # Total label and value styles
        total_label_style = ParagraphStyle(
            'TotalLabel',
            parent=normal_style,
            fontSize=10,
            fontName='Helvetica-Bold',
        )
        total_value_style = ParagraphStyle(
            'TotalValue',
            parent=normal_style,
            fontSize=11,
            fontName='Helvetica-Bold',
        )
        
        # Add summary rows to line_items_data - span first 3 columns (Description, Qty, Unit Price)
        num_data_rows = len(quote.get('line_items', []))
        
        # Subtotal row: Span columns 0-2, right-align label, show value in Total column
        line_items_data.append([
            Paragraph("Subtotal:", normal_style),
            "",  # Empty Qty
            "",  # Empty Unit Price
            Paragraph(f"${subtotal:.2f}", normal_style)
        ])
        
        # Tax row (if applicable)
        if tax_amount > 0:
            line_items_data.append([
                Paragraph(f"Tax ({tax_rate}%):", normal_style),
                "",  # Empty Qty
                "",  # Empty Unit Price
                Paragraph(f"${tax_amount:.2f}", normal_style)
            ])
        
        # Total row: Span columns 0-2, right-align label, show bold value in Total column
        line_items_data.append([
            Paragraph("Total:", total_label_style),
            "",  # Empty Qty
            "",  # Empty Unit Price
            Paragraph(f"${total:.2f}", total_value_style)
        ])
        
        # Compact table styling - thin lines, minimal padding, small fonts
        # Calculate summary row indices
        subtotal_row_idx = num_data_rows + 1
        total_row_idx = -1  # Last row
        
        items_table = Table(line_items_data, colWidths=[3.5*inch, 0.6*inch, 1*inch, 1*inch])
        
        # Build table style
        table_style = [
            # Header row styling - minimal
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f5f5f5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('TOPPADDING', (0, 0), (-1, 0), 6),
            # Column alignment: Description left, quantitative columns right
            ('ALIGN', (0, 0), (0, num_data_rows), 'LEFT'),  # Description (data rows only)
            ('ALIGN', (1, 0), (1, num_data_rows), 'RIGHT'),  # Qty (data rows only)
            ('ALIGN', (2, 0), (2, num_data_rows), 'RIGHT'),  # Unit Price (data rows only)
            ('ALIGN', (3, 0), (3, -1), 'RIGHT'),  # Total (all rows including summary)
            # Data rows styling - compact
            ('FONTNAME', (0, 1), (-1, num_data_rows), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, num_data_rows), 9),
            ('TOPPADDING', (0, 1), (-1, num_data_rows), 3),  # Reduced from 4 for denser table
            ('BOTTOMPADDING', (0, 1), (-1, num_data_rows), 3),  # Reduced from 4 for denser table
            # Summary rows styling
            ('FONTNAME', (0, subtotal_row_idx), (0, -1), 'Helvetica-Bold'),  # Summary labels bold
            ('TOPPADDING', (0, subtotal_row_idx), (-1, -1), 3),
            ('BOTTOMPADDING', (0, subtotal_row_idx), (-1, -1), 3),
            # Merge (SPAN) cells for Subtotal/Tax/Total labels - span first 3 columns
            ('SPAN', (0, subtotal_row_idx), (2, subtotal_row_idx)),  # Subtotal row
            ('SPAN', (0, total_row_idx), (2, total_row_idx)),  # Total row (last row)
            # Align summary labels to the RIGHT
            ('ALIGN', (0, subtotal_row_idx), (2, -1), 'RIGHT'),  # Summary labels right-aligned
            # Clean separator line before the Subtotal
            ('LINEBELOW', (0, num_data_rows), (-1, num_data_rows), 0.5, colors.HexColor('#d0d0d0')),
            # Highlight the Total row with thick line above
            ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#000000')),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 6),  # Extra padding for total
            # Thin grid lines for data rows only
            ('GRID', (0, 0), (-1, num_data_rows), 0.5, colors.HexColor('#d0d0d0')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            # Note: ReportLab respects the DocTemplate margin by default unless overridden
        ]
        
        # Add tax row SPAN if tax exists
        if tax_amount > 0:
            tax_row_idx = num_data_rows + 2
            table_style.append(('SPAN', (0, tax_row_idx), (2, tax_row_idx)))  # Tax row
        
        items_table.setStyle(TableStyle(table_style))
        elements.append(items_table)
        
        # Notes section (after financial summary) - optimized spacing
        if show_notes and quote.get('notes'):
            elements.append(Spacer(1, 0.15*inch))  # Reduced from 0.2
            elements.append(Paragraph("Notes:", heading_style))
            notes_with_links = convert_links_to_pdf_format(quote['notes'])
            elements.append(Paragraph(notes_with_links, normal_style))
        
        # Terms section (after notes) - optimized spacing
        if show_terms and quote.get('terms'):
            elements.append(Spacer(1, 0.12*inch))  # Reduced from 0.15
            elements.append(Paragraph("Terms & Conditions:", heading_style))
            terms_with_links = convert_links_to_pdf_format(quote['terms'])
            elements.append(Paragraph(terms_with_links, normal_style))
        
        # Footer Validity Note - Small note at very bottom
        if quote.get('expiration_date'):
            expiration_date = datetime.fromisoformat(quote['expiration_date']).strftime('%B %d, %Y')
            validity_text = f"This quote is valid until {expiration_date}."
        else:
            # Default validity period
            validity_text = "This quote is valid for 30 days from the date of issue."
        
        elements.append(Spacer(1, 0.15*inch))  # Reduced from 0.2
        validity_paragraph = Paragraph(validity_text, footer_note_style)
        elements.append(validity_paragraph)
        
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

