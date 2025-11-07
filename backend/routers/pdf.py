from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_LEFT
from decimal import Decimal
from io import BytesIO
import sys
import os
import re
import html
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import supabase
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
async def generate_quote_pdf(quote_id: str):
    """Generate PDF for a quote"""
    try:
        # Fetch quote with all relations
        response = supabase.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote = response.data[0]
        
        # Create PDF buffer
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.75*inch, bottomMargin=0.75*inch)
        
        # Container for PDF elements
        elements = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=30,
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#333333'),
            spaceAfter=12,
        )
        
        normal_style = styles['Normal']
        normal_style.fontSize = 10
        
        # Title
        elements.append(Paragraph(f"Quote: {quote['quote_number']}", title_style))
        elements.append(Spacer(1, 0.2*inch))
        
        # Quote details
        quote_info = []
        quote_info.append(["Quote Number:", quote['quote_number']])
        quote_info.append(["Date:", datetime.fromisoformat(quote['created_at']).strftime('%B %d, %Y')])
        if quote.get('expiration_date'):
            quote_info.append(["Expiration:", datetime.fromisoformat(quote['expiration_date']).strftime('%B %d, %Y')])
        quote_info.append(["Status:", quote['status'].title()])
        
        quote_table = Table(quote_info, colWidths=[2*inch, 4*inch])
        quote_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#666666')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        elements.append(quote_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Client information
        if quote.get('clients'):
            client = quote['clients']
            elements.append(Paragraph("Bill To:", heading_style))
            client_info = []
            client_info.append([client.get('name', '') or ''])
            if client.get('company'):
                client_info.append([client['company']])
            if client.get('email'):
                client_info.append([client['email']])
            if client.get('phone'):
                client_info.append([client['phone']])
            if client.get('address'):
                client_info.append([client['address']])
            
            client_table = Table(client_info, colWidths=[6*inch])
            client_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            elements.append(client_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Line items table
        elements.append(Paragraph("Items", heading_style))
        
        line_items_data = [["Description", "Qty", "Unit Price", "Discount", "Total"]]
        
        for item in quote.get('line_items', []):
            qty = Decimal(item['quantity'])
            unit_price = Decimal(item['unit_price'])
            discount = Decimal(item.get('discount_percent', 0))
            subtotal = qty * unit_price
            discount_amount = subtotal * discount / Decimal("100")
            total = subtotal - discount_amount
            
            line_items_data.append([
                item['description'],
                str(qty),
                f"${unit_price:.2f}",
                f"{discount}%" if discount > 0 else "-",
                f"${total:.2f}"
            ])
        
        # Add totals row
        subtotal = Decimal(quote['subtotal'])
        tax_amount = Decimal(quote['tax_amount'])
        total = Decimal(quote['total'])
        
        line_items_data.append(["", "", "", "Subtotal:", f"${subtotal:.2f}"])
        if tax_amount > 0:
            line_items_data.append(["", "", "", f"Tax ({quote['tax_rate']}%):", f"${tax_amount:.2f}"])
        line_items_data.append(["", "", "", "<b>Total:</b>", f"<b>${total:.2f}</b>"])
        
        items_table = Table(line_items_data, colWidths=[3*inch, 0.8*inch, 1*inch, 1*inch, 1*inch])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -4), 'Helvetica'),
            ('FONTNAME', (3, -3), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e0e0e0')),
            ('LINEBELOW', (0, -3), (-1, -3), 1, colors.HexColor('#666666')),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Notes and terms
        if quote.get('notes'):
            elements.append(Paragraph("Notes:", heading_style))
            notes_with_links = convert_links_to_pdf_format(quote['notes'])
            elements.append(Paragraph(notes_with_links, normal_style))
            elements.append(Spacer(1, 0.2*inch))
        
        if quote.get('terms'):
            elements.append(Paragraph("Terms & Conditions:", heading_style))
            terms_with_links = convert_links_to_pdf_format(quote['terms'])
            elements.append(Paragraph(terms_with_links, normal_style))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return Response(
            content=buffer.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=quote_{quote['quote_number']}.pdf"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

