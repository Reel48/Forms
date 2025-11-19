-- Update Knowledge Base with Detailed Company Information
-- This updates existing entries and adds more detailed information

-- Update company information
UPDATE knowledge_embeddings 
SET 
  content = 'Reel48 specializes in custom hats, and we also offer custom coozies.',
  updated_at = NOW()
WHERE category = 'company_info' AND title = 'About Our Company';

-- Update ordering process
UPDATE knowledge_embeddings 
SET 
  content = 'To place an order, you will work directly with a dedicated member of our Account/Sales Team who will manage your order from start to finish. Before placing an order for custom hats, please fill out our [Custom Hat Design Form](https://reel48.app/public/form/form-4f8ml8om) to help us collect information about your design preferences and requirements. We ensure all specifications are met, including exact design, materials, and colors. We offer exact Pantone color-matching for both hats and coozies. Our process includes: 1. Fill out the [Custom Hat Design Form](https://reel48.app/public/form/form-4f8ml8om) (for hat orders). 2. Digital Proofs for design confirmation. 3. Physical Sample Production for quality and final approval. 4. Mass Production and Shipping. This streamlined process applies to all custom hat and coozie orders.',
  updated_at = NOW()
WHERE category = 'process' AND title = 'How to Order';

-- Update product quality
UPDATE knowledge_embeddings 
SET 
  content = 'Every hat is hand-made from scratch using premium materials. We commit to providing the highest-quality custom hats available. Our core differentiator is the unmatched level of customization we offer. This includes, but is not limited to: Pantone color-matching, custom side/back embroidery, custom inside labels, choice of closure type, and selection of material.',
  updated_at = NOW()
WHERE category = 'quality' AND title = 'Product Quality';

-- Update shipping/lead times
UPDATE knowledge_embeddings 
SET 
  content = 'Custom Hat Production Timeline: Digital Proof: 1-2 days. Sample Hat Production: 2-3 weeks. Mass Production & Shipping: 4-6 weeks (following sample approval). Total Estimated Delivery: 6-9 weeks from initial order approval. Custom Coozie Production Timeline: Digital Proof: 1-2 days. Sample Coozie Production: 3-7 business days. Mass Production & Shipping: 2-3 weeks (following sample approval). Total Estimated Delivery: 3-4 weeks from initial order approval.',
  updated_at = NOW()
WHERE category = 'shipping' AND title = 'Production and Shipping Times';

-- Update design services
UPDATE knowledge_embeddings 
SET 
  content = 'We highly recommend clients submit a final, high-resolution version of their logo. While we prefer clients to provide final logo files, our in-house Design Team is available to assist with preparing your files, adjusting logo placement, or advising on color and material choices to ensure the best result. Note: We do not offer full-scale logo design services, only modifications/assistance for existing artwork.',
  updated_at = NOW()
WHERE category = 'services' AND title = 'Design Services';

-- Update Custom Hat Design Form entry
UPDATE knowledge_embeddings 
SET 
  content = 'Before placing an order for custom hats, customers should fill out the [Custom Hat Design Form](https://reel48.app/public/form/form-4f8ml8om). This form helps us collect important information about what the customer wants to order, including design preferences, colors, quantities, and other specifications. This information helps us understand how to best help them and ensures we can provide accurate quotes and meet their exact requirements.',
  metadata = jsonb_build_object('type', 'form', 'form_url', 'https://reel48.app/public/form/form-4f8ml8om', 'form_name', 'Custom Hat Design Form'),
  updated_at = NOW()
WHERE category = 'process' AND title = 'Custom Hat Design Form';

-- If entries don't exist, insert them
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'company_info',
  'About Our Company',
  'Reel48 specializes in custom hats, and we also offer custom coozies.',
  jsonb_build_object('product', 'general'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'company_info' AND title = 'About Our Company'
);

INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'process',
  'How to Order',
  'To place an order, you will work directly with a dedicated member of our Account/Sales Team who will manage your order from start to finish. Before placing an order for custom hats, please fill out our [Custom Hat Design Form](https://reel48.app/public/form/form-4f8ml8om) to help us collect information about your design preferences and requirements. We ensure all specifications are met, including exact design, materials, and colors. We offer exact Pantone color-matching for both hats and coozies. Our process includes: 1. Fill out the [Custom Hat Design Form](https://reel48.app/public/form/form-4f8ml8om) (for hat orders). 2. Digital Proofs for design confirmation. 3. Physical Sample Production for quality and final approval. 4. Mass Production and Shipping. This streamlined process applies to all custom hat and coozie orders.',
  jsonb_build_object('type', 'ordering'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'process' AND title = 'How to Order'
);

INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'quality',
  'Product Quality',
  'Every hat is hand-made from scratch using premium materials. We commit to providing the highest-quality custom hats available. Our core differentiator is the unmatched level of customization we offer. This includes, but is not limited to: Pantone color-matching, custom side/back embroidery, custom inside labels, choice of closure type, and selection of material.',
  jsonb_build_object('type', 'quality'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'quality' AND title = 'Product Quality'
);

INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'shipping',
  'Production and Shipping Times',
  'Custom Hat Production Timeline: Digital Proof: 1-2 days. Sample Hat Production: 2-3 weeks. Mass Production & Shipping: 4-6 weeks (following sample approval). Total Estimated Delivery: 6-9 weeks from initial order approval. Custom Coozie Production Timeline: Digital Proof: 1-2 days. Sample Coozie Production: 3-7 business days. Mass Production & Shipping: 2-3 weeks (following sample approval). Total Estimated Delivery: 3-4 weeks from initial order approval.',
  jsonb_build_object('type', 'shipping'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'shipping' AND title = 'Production and Shipping Times'
);

INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'services',
  'Design Services',
  'We highly recommend clients submit a final, high-resolution version of their logo. While we prefer clients to provide final logo files, our in-house Design Team is available to assist with preparing your files, adjusting logo placement, or advising on color and material choices to ensure the best result. Note: We do not offer full-scale logo design services, only modifications/assistance for existing artwork.',
  jsonb_build_object('type', 'design'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'services' AND title = 'Design Services'
);

-- Add Custom Hat Design Form entry
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'process',
  'Custom Hat Design Form',
  'Before placing an order for custom hats, customers should fill out the [Custom Hat Design Form](https://reel48.app/public/form/form-4f8ml8om). This form helps us collect important information about what the customer wants to order, including design preferences, colors, quantities, and other specifications. This information helps us understand how to best help them and ensures we can provide accurate quotes and meet their exact requirements.',
  jsonb_build_object('type', 'form', 'form_url', 'https://reel48.app/public/form/form-4f8ml8om', 'form_name', 'Custom Hat Design Form'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'process' AND title = 'Custom Hat Design Form'
);

