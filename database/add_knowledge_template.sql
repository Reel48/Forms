-- Template for adding new knowledge base entries
-- Usage: Replace the values in the INSERT statement below
-- You can run this in the Supabase SQL Editor

-- 1. FAQ: Return Policy
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'policy', -- category: company_info, process, quality, shipping, services, policy, product, faq
  'Return Policy', -- title
  'Due to the custom nature of our products, we do not accept returns on decorated items unless there is a manufacturing defect. If you receive a defective item, please contact us within 7 days of delivery with photos of the issue. We will work with you to resolve the issue via replacement or credit.', -- content
  jsonb_build_object('type', 'policy'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings WHERE title = 'Return Policy'
);

-- 2. Product: Custom Patch Hats
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'product',
  'Leather Patch Hats',
  'Our leather patch hats feature 100% genuine leather patches, laser-engraved with your logo. The patches are stitched onto the hat for maximum durability. We offer various leather colors including natural, amber, coffee, and black. These are our most popular option for a premium, rustic look.',
  jsonb_build_object('product_type', 'hats', 'style', 'leather_patch'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings WHERE title = 'Leather Patch Hats'
);

-- 3. Contact Information
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'company_info',
  'Contact Information',
  'You can reach our support team via email at support@reel48.com or by phone at (555) 123-4567 during business hours (M-F, 9am-5pm EST). For new orders, please use the quote request form on our website.',
  jsonb_build_object('type', 'contact'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings WHERE title = 'Contact Information'
);


