-- Add Side Embroidery Information to Knowledge Base
-- This helps the AI understand and explain side embroidery options to customers

INSERT INTO knowledge_embeddings (id, category, title, content, metadata, created_at, updated_at) VALUES
  (
    gen_random_uuid(),
    'products',
    'Side Embroidery for Custom Hats',
    'Side Embroidery Options: Custom hats can include side embroideries on the left side, right side, or both sides. Maximum of 2 side embroideries per hat (one left, one right). For orders under 300 units, each side embroidery costs $1.00 per hat. For orders of 300 or more units, side embroideries are included at no additional cost. Always ask customers about side embroidery preferences when creating hat quotes.',
    jsonb_build_object('product', 'Custom Hats', 'feature', 'side_embroidery'),
    NOW(),
    NOW()
  )
ON CONFLICT DO NOTHING;


