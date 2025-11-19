-- Add Business Context Q&A to Knowledge Base
-- Questions end with question marks, answers are in * * markings

-- 1. Artwork and Design Guidelines

-- File Formats
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'process',
  'File Formats',
  'What files do you accept? *AI, .EPS, .PDF, .JPG, .PNG*',
  jsonb_build_object('type', 'faq', 'topic', 'artwork', 'subtopic', 'file_formats'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'process' AND title = 'File Formats' AND content LIKE '%What files do you accept%'
);

-- Logo Digitization/Setup Fees
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'pricing',
  'Logo Digitization Setup Fees',
  'Is there a one-time fee to turn a logo into a stitch file? *There are no digitization fees. The price per hat that is offered includes all setup costs to make the hats*',
  jsonb_build_object('type', 'faq', 'topic', 'pricing', 'subtopic', 'setup_fees'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'pricing' AND title = 'Logo Digitization Setup Fees'
);

-- Design Limitations
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Design Limitations',
  'Are there limits on colors? Can you do gradients? How small can text be before it becomes unreadable on a hat? *There are no limits on colors for the hat itself, we can Pantone-match your exact brand colors. For the band, we have an extensive selection of options but we do not make the bands to-order. We are able to do gradient-embroidery, which is something that is very rare in our industry. We have top-of-the-line embroidery machines, but there are still some limitations when it comes to the size of the text. If the text gets too small, there is a chance that it becomes unreadable or below our standard of crispness. We will keep you in the loop with this, and you will be able to approve all embroideries before we start mass production.*',
  jsonb_build_object('type', 'faq', 'topic', 'artwork', 'subtopic', 'design_limitations'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Design Limitations'
);

-- Mockups/Proofs
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'process',
  'Mockups and Proofs',
  'Will the customer see a digital proof before production begins? What is the approval process? *Yes, we have two levels of approvals that happen before we start production on your custom hats. First, before anything else, we will have you approve the digital proof of your hat. Then, we make a sample hat for each order and will send professional photos for your approval. Only after both of these have been approved will we start production.*',
  jsonb_build_object('type', 'faq', 'topic', 'process', 'subtopic', 'approvals'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'process' AND title = 'Mockups and Proofs'
);

-- 2. Order Management & Logistics

-- Minimum Order Quantities
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'pricing',
  'Minimum Order Quantities',
  'Can they buy just one hat, or is there a minimum of 12/24? Does the MOQ differ for coozies? *MOQ for hats is 100, and MOQ for coozies is 250*',
  jsonb_build_object('type', 'faq', 'topic', 'pricing', 'subtopic', 'moq'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'pricing' AND title = 'Minimum Order Quantities'
);

-- Changes and Cancellations
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'process',
  'Changes and Cancellations',
  'Can they change the address or logo after the order is placed but before it ships? Is there a cancellation fee? *Yes, you will be able to change logo details up until the sample is completed and approved and we move to mass production. Please note that if we need to make a second hat sample, there is a chance that there will be a small fee. For shipping, you will be able to change the delivery address up until the time that the products have been shipped from our warehouse.*',
  jsonb_build_object('type', 'faq', 'topic', 'process', 'subtopic', 'order_changes'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'process' AND title = 'Changes and Cancellations'
);

-- Reordering
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'process',
  'Reordering',
  'How easy is it to order the exact same design again? Do they pay setup fees again on reorders? *Reordering with Reel48 is extremely simple. We keep Pre-Production samples for every order that we make, so whenever you are ready to order we will already have everything needed to remake your hats or coozies. In fact, since you are reordering the same product, we are able to save time on the sample process which means you get your products sooner than you did the first time.*',
  jsonb_build_object('type', 'faq', 'topic', 'process', 'subtopic', 'reordering'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'process' AND title = 'Reordering'
);

-- Rush Orders
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'shipping',
  'Rush Orders and Shipping Methods',
  'Do you offer expedited production (not just shipping) for a fee? *Yes, we offer three shipping methods: Expedited, Normal, and Relaxed. For most orders, customers choose Normal shipping. This is our standard shipping method and is included in every order by default. For Expedited orders, there will be an additional fee added to the order. For Relaxed orders, orders where the buyer purchases multiple months in advance of when the hats are needed, we are able to give a discount on the order which is a huge win for a lot of our clients.*',
  jsonb_build_object('type', 'faq', 'topic', 'shipping', 'subtopic', 'shipping_methods'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'shipping' AND title = 'Rush Orders and Shipping Methods'
);

-- 3. Returns & Issues

-- Return Policy
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'policies',
  'Return Policy for Custom Goods',
  'What is your return policy? *Custom items are final sale unless defective.*',
  jsonb_build_object('type', 'faq', 'topic', 'policies', 'subtopic', 'returns'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'policies' AND title = 'Return Policy for Custom Goods'
);

-- Misprints/Defects
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'policies',
  'Misprints and Defects',
  'What happens if the embroidery is crooked or the coozie print is peeling? How do they file a claim? *For all orders, there is a 5-day window after the product has been delivered where customers can report product defects. We do detailed quality checks on all of our products before shipping them, but if there is a problem we will go out of our way to make sure that our customers are taken care of.*',
  jsonb_build_object('type', 'faq', 'topic', 'policies', 'subtopic', 'defects'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'policies' AND title = 'Misprints and Defects'
);

-- Color Matching
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Color Matching',
  'How accurate is color matching? Will screen colors look different than thread/ink colors? *We have had a few cases where companies have given us their brand colors that looked perfect on screen, but then they looked different whenever they saw the products in person. We have done a lot of custom orders, and will do everything we can to make you aware of these issues if we think they will be a problem. This is a rare occurrence, but many customers are unaware that there is a difference. This is why we make proofs for every order and send professional pictures before starting mass production.*',
  jsonb_build_object('type', 'faq', 'topic', 'products', 'subtopic', 'color_matching'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Color Matching'
);

-- 4. Specific Product Details

-- Brands
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Product Brands',
  'Do you carry specific famous brands (e.g., Richardson 112, Yupoong, Comfort Colors)? *All Reel48 products are made from scratch in-house, and use the Reel48 brand. This allows us to offer full customization, and a better product compared to companies that buy blank hats and add embroidery on them.*',
  jsonb_build_object('type', 'faq', 'topic', 'products', 'subtopic', 'brands'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Product Brands'
);

-- Sizing Guides
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Hat Sizing',
  'What is the circumference of your hats? Do you offer "one size fits most" vs. specific fitted sizes? *Our hats are one size fits most, and we have never heard of an issue with the fit of our hats.*',
  jsonb_build_object('type', 'faq', 'topic', 'products', 'subtopic', 'sizing'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Hat Sizing'
);

-- Material Differences
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Hat Materials',
  'What material options do you offer? Mesh back vs. cotton twill vs. performance fabric? *We are able to use any materials that our customer would prefer, and we can make any style hat that our customer prefers. We have made mesh back, cotton twill, performance fabric, etc. You name it, we've most likely made it at one point or another.*',
  jsonb_build_object('type', 'faq', 'topic', 'products', 'subtopic', 'materials'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Hat Materials'
);

-- Coozie Fit
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Coozie Sizing',
  'Do coozies fit standard cans, skinny cans (White Claws), or bottles? *We offer two main coozie sizes: Regular, and Tall. Regular will fit perfectly onto normal 12 oz. cans, and Tall will fit onto seltzer cans that are taller and skinnier than regular cans.*',
  jsonb_build_object('type', 'faq', 'topic', 'products', 'subtopic', 'coozie_sizing'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Coozie Sizing'
);

-- 5. B2B / Bulk / Wholesale

-- Bulk Discounts
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'pricing',
  'Bulk Discounts',
  'Does the price drop at 200 units? 500 units? *Yes, we heavily incentivize bulk discounts. Customers receive huge discounts when ordering in bulk. We are able to handle any size order, and the price per hat will continue to decrease as the quantity of hats rises.*',
  jsonb_build_object('type', 'faq', 'topic', 'pricing', 'subtopic', 'bulk_discounts'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'pricing' AND title = 'Bulk Discounts'
);

-- Tax Exemption
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'pricing',
  'Tax Exemption and Resale Certificates',
  'How can a business submit a reseller certificate to remove sales tax? *We work with resellers all the time. Simply let us know that you want to use a resale certificate, and we will make sure that you are taken care of. We make the reselling process extremely simple. We love working with resellers!*',
  jsonb_build_object('type', 'faq', 'topic', 'pricing', 'subtopic', 'tax_exemption'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'pricing' AND title = 'Tax Exemption and Resale Certificates'
);

-- Sample Policy
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'process',
  'Sample Policy',
  'Can they order a single blank sample or a pre-production sample before committing to 500 units? *Yes, all orders come included with a pre-production sample, but customers can also purchase a sample separately and we will make it for you. We totally understand wanting to see a sample before committing thousands of dollars on your company's hats. We will also credit the cost of the sample back towards your order if you decide to place an order, so it will end up being essentially free!*',
  jsonb_build_object('type', 'faq', 'topic', 'process', 'subtopic', 'samples'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'process' AND title = 'Sample Policy'
);

-- 6. Care Instructions

-- Hat Care
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Hat Care Instructions',
  'Can they put the hats in the dishwasher (common myth) or washing machine? How to clean sweat stains? *To clean a Reel48 hat, you can spot-clean it with a mild detergent and water or hand wash it by soaking it in a bowl of cold water with a gentle detergent. For machine washing, use the gentle cycle with cold water and place the hat in a mesh bag to protect it, then air dry it to avoid shrinking.*',
  jsonb_build_object('type', 'faq', 'topic', 'products', 'subtopic', 'care_instructions'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Hat Care Instructions'
);

-- Coozie Care
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Coozie Care Instructions',
  'Are coozies machine washable? *We recommend spot cleaning or hand washing for our coozies.*',
  jsonb_build_object('type', 'faq', 'topic', 'products', 'subtopic', 'care_instructions'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Coozie Care Instructions'
);

-- Richardson Hats
INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'products',
  'Richardson Hats',
  'Do you sell Richardson hats? Can I buy Richardson hats? *All Reel48 products are made from scratch in-house, and use the Reel48 brand. This allows us to offer full customization, and a better product compared to companies that buy blank hats and add embroidery on them. We can make hats very similar to Richardson hats (with nicer quality), but they will be made in-house from scratch instead of being bought separately from Richardson. This allows us to create truly custom products and offer better prices to our customers.*',
  jsonb_build_object('type', 'faq', 'topic', 'products', 'subtopic', 'brands'),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_embeddings 
  WHERE category = 'products' AND title = 'Richardson Hats'
);

