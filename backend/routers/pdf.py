from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
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
    if not text: return ""
    
    placeholders = {}
    placeholder_counter = 0
    markdown_link_pattern = r'\[([^\]]+)\]\(([^)]+)\)'
    
    def replace_markdown(match):
        nonlocal placeholder_counter
        link_text, url = match.groups()
        if not url.startswith(('http://', 'https://')): url = f'https://{url}'
        placeholder = f'__MK_LINK_{placeholder_counter}__'
        placeholders[placeholder] = {'text': link_text, 'url': url}
        placeholder_counter += 1
        return placeholder
    
    text = re.sub(markdown_link_pattern, replace_markdown, text)
    
    url_pattern = r'(https?://[^\s<>"]+|www\.[^\s<>"]+)'
    def replace_url(match):
        nonlocal placeholder_counter
        url = match.group(0)
        full_url = url if url.startswith(('http://', 'https://')) else f'https://{url}'
        placeholder = f'__PL_LINK_{placeholder_counter}__'
        placeholders[placeholder] = {'text': url, 'url': full_url}
        placeholder_counter += 1
        return placeholder

    text = re.sub(url_pattern, replace_url, text)
    text = html.escape(text)
    
    for ph, data in placeholders.items():
        link_tag = f'<link href="{html.escape(data["url"])}" color="blue"><u>{html.escape(data["text"])}</u></link>'
        text = text.replace(ph, link_tag)
    
    return text

@router.get("/quote/{quote_id}")
async def generate_quote_pdf(
    quote_id: str,
    show_logo: bool = Query(True),
    show_company_info: bool = Query(True),
    show_client_info: bool = Query(True),
    show_notes: bool = Query(True),
    show_terms: bool = Query(True),
    page_size: str = Query("letter"),
    font_size: int = Query(9),
    color_scheme: str = Query("default")
):
    try:
        response = supabase_storage.table("quotes").select("*, clients(*), line_items(*)").eq("id", quote_id).execute()
        if not response.data: raise HTTPException(status_code=404, detail="Quote not found")
        quote = response.data[0]
        
        # --- 1. PAGE SETUP ---
        pagesize = A4 if page_size.lower() == "a4" else letter
        page_width, page_height = pagesize
        left_margin = 0.6 * inch
        right_margin = 0.6 * inch
        top_margin = 0.6 * inch
        bottom_margin = 0.5 * inch
        content_width = page_width - (left_margin + right_margin)
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=pagesize, 
            topMargin=top_margin, 
            bottomMargin=bottom_margin,
            leftMargin=left_margin,
            rightMargin=right_margin,
            title=quote.get('title', quote['quote_number'])
        )
        
        elements = []
        styles = getSampleStyleSheet()
        
        # --- 2. STYLES ---
        # Base Text (Left Aligned)
        normal_style = ParagraphStyle(
            'CompactNormal',
            parent=styles['Normal'],
            fontSize=font_size,
            fontName='Helvetica',
            textColor=colors.HexColor('#1a1a1a'),
            leading=font_size + 2,
            alignment=0 # TA_LEFT
        )
        
        # NEW: Right Aligned Text (CRITICAL FOR NUMBERS)
        table_right_style = ParagraphStyle(
            'TableRight',
            parent=normal_style,
            alignment=2 # TA_RIGHT
        )
        
        # Headers
        heading_style = ParagraphStyle(
            'SectionHeader',
            parent=normal_style,
            fontSize=font_size + 1,
            fontName='Helvetica-Bold',
            spaceAfter=4,
            textColor=colors.HexColor('#333333'),
        )
        
        # Header Bold (Left)
        bold_para_left = ParagraphStyle('BoldLeft', parent=normal_style, fontName='Helvetica-Bold', alignment=0)
        # Header Bold (Right)
        bold_para_right = ParagraphStyle('BoldRight', parent=normal_style, fontName='Helvetica-Bold', alignment=2)
        
        # Top Header Styles
        right_info_style = ParagraphStyle('RightInfo', parent=normal_style, alignment=2)
        right_bold_style = ParagraphStyle('RightBold', parent=right_info_style, fontName='Helvetica-Bold')
        status_style = ParagraphStyle('Status', parent=right_info_style, textColor=colors.HexColor('#d32f2f'), fontSize=font_size-1)

        # Settings
        company_settings = {}
        try:
            c_resp = supabase_storage.table("company_settings").select("*").limit(1).execute()
            if c_resp.data: company_settings = c_resp.data[0]
        except: pass

        # --- 3. HEADER (Logo & Info) ---
        header_left = []
        if show_logo and company_settings.get('logo_url'):
            try:
                import requests
                from PIL import Image as PILImage
                logo_resp = requests.get(company_settings['logo_url'], timeout=5)
                if logo_resp.status_code == 200:
                    img_data = BytesIO(logo_resp.content)
                    pil_img = PILImage.open(img_data)
                    iw, ih = pil_img.size
                    aspect = iw / ih
                    h = 0.45 * inch
                    w = h * aspect
                    header_left.append(Image(BytesIO(logo_resp.content), width=w, height=h))
            except: pass

        header_right = []
        q_date = datetime.fromisoformat(quote['created_at']).strftime('%B %d, %Y')
        header_right.append(Paragraph("<b>QUOTE</b>", right_info_style))
        header_right.append(Paragraph(f"<b>{quote['quote_number']}</b>", right_bold_style))
        header_right.append(Paragraph(q_date, right_info_style))
        if quote.get('status', '').lower() == 'draft':
            header_right.append(Paragraph("Draft Quote - Approval Required", status_style))

        header_table = Table([[header_left, header_right]], colWidths=[content_width * 0.6, content_width * 0.4])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 0.35 * inch))

        # --- 4. ADDRESS BLOCK ---
        col_from = []
        if show_company_info:
            col_from.append(Paragraph("FROM", heading_style))
            if company_settings.get('company_name'):
                col_from.append(Paragraph(f"<b>{company_settings['company_name']}</b>", normal_style))
            
            contact_lines = []
            if company_settings.get('address'): contact_lines.append(company_settings['address'])
            parts = []
            if company_settings.get('email'): parts.append(company_settings['email'])
            if company_settings.get('phone'): parts.append(company_settings['phone'])
            if parts: contact_lines.append(" | ".join(parts))
            if company_settings.get('website'): contact_lines.append(company_settings['website'])
            for line in contact_lines: col_from.append(Paragraph(line, normal_style))

        col_to = []
        if show_client_info and quote.get('clients'):
            client = quote['clients']
            col_to.append(Paragraph("BILL TO", heading_style))
            if client.get('name'):
                col_to.append(Paragraph(f"<b>{client['name']}</b>", normal_style))
            if client.get('company'):
                col_to.append(Paragraph(client['company'], normal_style))
            if client.get('address'):
                col_to.append(Paragraph(client['address'], normal_style))
            c_parts = []
            if client.get('email'): c_parts.append(client['email'])
            if client.get('phone'): c_parts.append(client['phone'])
            if c_parts: col_to.append(Paragraph(", ".join(c_parts), normal_style))

        address_table = Table([[col_from, col_to]], colWidths=[content_width * 0.5, content_width * 0.5])
        address_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
        ]))
        elements.append(address_table)
        elements.append(Spacer(1, 0.3 * inch))

        # --- 5. ITEMS TABLE ---
        elements.append(Paragraph("Items", heading_style))
        elements.append(Spacer(1, 0.05 * inch))

        w_qty = 0.6 * inch
        w_price = 1.0 * inch
        w_total = 1.0 * inch
        w_desc = content_width - (w_qty + w_price + w_total)

        # Header: Description (Left), others (Right)
        table_data = [[
            Paragraph("Description", bold_para_left),
            Paragraph("Qty", bold_para_right),       # Right Aligned Header
            Paragraph("Unit Price", bold_para_right),# Right Aligned Header
            Paragraph("Total", bold_para_right)      # Right Aligned Header
        ]]

        for item in quote.get('line_items', []):
            qty = Decimal(item['quantity'])
            price = Decimal(item['unit_price'])
            row_total = qty * price 
            
            table_data.append([
                Paragraph(item['description'], normal_style),
                Paragraph(f"{qty:g}", table_right_style),        # Right Aligned Data
                Paragraph(f"${price:,.2f}", table_right_style),    # Right Aligned Data
                Paragraph(f"${row_total:,.2f}", table_right_style),# Right Aligned Data
            ])

        items_table = Table(table_data, colWidths=[w_desc, w_qty, w_price, w_total])
        items_table.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,0), 0.5, colors.HexColor('#cccccc')),
            ('LINEBELOW', (0,1), (-1,-1), 0.5, colors.HexColor('#eeeeee')),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (0,-1), 0),       # No Left Padding on Col 1
            ('RIGHTPADDING', (-1,0), (-1,-1), 0),    # No Right Padding on Last Col
        ]))
        elements.append(items_table)

        # --- 6. TOTALS ---
        subtotal = Decimal(quote['subtotal'])
        tax = Decimal(quote['tax_amount'])
        grand_total = Decimal(quote['total'])
        
        summary_data = []
        # Use table_right_style for the monetary values
        summary_data.append([Paragraph("Subtotal", normal_style), Paragraph(f"${subtotal:,.2f}", table_right_style)])
        if tax > 0:
            summary_data.append([Paragraph(f"Tax ({quote.get('tax_rate',0)}%)", normal_style), Paragraph(f"${tax:,.2f}", table_right_style)])
        
        summary_data.append([Paragraph("Total", normal_style), Paragraph(f"${grand_total:,.2f}", table_right_style)])
        
        w_sum_label = 1.5 * inch
        w_sum_val = 1.0 * inch
        
        summary_table = Table(summary_data, colWidths=[w_sum_label, w_sum_val])
        summary_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'RIGHT'), # Cell alignment
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('LINEABOVE', (0,-1), (-1,-1), 0.5, colors.black),
        ]))

        wrapper_table = Table([[ "", summary_table ]], colWidths=[content_width - (w_sum_label + w_sum_val), (w_sum_label + w_sum_val)])
        wrapper_table.setStyle(TableStyle([
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        elements.append(wrapper_table)

        # --- 7. FOOTER ---
        elements.append(Spacer(1, 0.4 * inch))
        if show_notes and quote.get('notes'):
            elements.append(Paragraph("Notes", heading_style))
            elements.append(Paragraph(convert_links_to_pdf_format(quote['notes']), normal_style))
            elements.append(Spacer(1, 0.1 * inch))

        if show_terms and quote.get('terms'):
            elements.append(Paragraph("Terms", heading_style))
            elements.append(Paragraph(convert_links_to_pdf_format(quote['terms']), normal_style))
            elements.append(Spacer(1, 0.1 * inch))

        validity_text = "This quote is valid for 30 days from the date of issue."
        if quote.get('expiration_date'):
            exp_date = datetime.fromisoformat(quote['expiration_date']).strftime('%B %d, %Y')
            validity_text = f"This quote is valid until {exp_date}."
            
        elements.append(Spacer(1, 0.2 * inch))
        elements.append(Paragraph(validity_text, ParagraphStyle('Footer', parent=normal_style, fontSize=8, textColor=colors.gray)))

        doc.build(elements)
        buffer.seek(0)
        filename = f"{quote['quote_number']}.pdf"
        
        return Response(content=buffer.read(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})
        
    except Exception as e:
        print(f"PDF Gen Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
