-- Populate Knowledge Base for AI Customer Service
-- This provides general company and product information for the AI chatbot

-- Create knowledge_embeddings table if it doesn't exist (from ai_embeddings_migration.sql)
-- Note: This assumes the table already exists from the migration

-- Insert company and product knowledge
-- Note: category is a required VARCHAR column, not in metadata
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at) VALUES
  (
    gen_random_uuid(),
    'company_info',
    'About Our Company',
    'Reel48 specializes in custom hats, and we also offer custom coozies.',
    jsonb_build_object('product', 'general'),
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'products',
    'Custom Hats Information',
    'Custom Hats: We offer custom designed hats with embroidered logos. Minimum order is 100 hats. Pricing is tiered based on quantity, starting at $15.50 per hat for orders of 100-199 hats, with lower prices for larger orders. Our hats are high-quality and perfect for branding, events, or team merchandise.',
    jsonb_build_object('product', 'Custom Hats'),
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'products',
    'Custom Coozies Information',
    'Custom Coozies: We offer two types of custom coozies - with magnet and without magnet. Both have a minimum order of 250 coozies. Coozies without magnets start at $2.00 per coozie for orders of 250-499, with lower prices for larger orders. Coozies with magnets start at $3.00 per coozie for orders of 250-499, with lower prices for larger orders. Coozies are great for events, promotions, and branded merchandise.',
    jsonb_build_object('product', 'Custom Coozies'),
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'process',
    'How to Order',
    'Ordering Process: To place an order, customers work with our team to create quotes. Once a quote is approved, orders are processed and delivered. We handle everything from design consultation to final product delivery. Contact us through the chat or your account dashboard to get started.',
    jsonb_build_object('type', 'ordering'),
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'pricing',
    'Pricing Information',
    'Pricing: Our pricing is based on quantity - the more you order, the better the price per unit. All products have minimum order quantities. Custom hats require a minimum of 100 hats. Custom coozies require a minimum of 250 coozies. We offer competitive pricing for bulk orders.',
    jsonb_build_object('type', 'pricing'),
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'quality',
    'Product Quality',
    'Product Quality: We pride ourselves on high-quality products. Our custom hats feature professional embroidery and durable materials. Our coozies are made with quality materials and can be customized with or without magnets. All products are designed to last and represent your brand well.',
    jsonb_build_object('type', 'quality'),
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'shipping',
    'Production and Shipping Times',
    'Lead Times: Production times vary based on order size and complexity. Generally, orders are processed within 2-4 weeks after approval and payment. Rush orders may be available for an additional fee. Contact us for specific timeline information for your order.',
    jsonb_build_object('type', 'shipping'),
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'services',
    'Design Services',
    'Design Services: We work with you to create custom designs for your products. You can submit your own designs or work with our team to create something new. We ensure your logo and branding look great on our products.',
    jsonb_build_object('type', 'design'),
    NOW(),
    NOW()
  )
ON CONFLICT DO NOTHING;

