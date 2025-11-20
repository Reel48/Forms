# How to Make Your AI Chatbot Robust

To make your chatbot the "best customer service rep possible," you need to feed it detailed information. The AI uses a "Knowledge Base" (a table in your database) to find answers to customer questions.

## 🚀 Strategy for Robustness

The AI is only as smart as the information you give it. To cover all bases, you should add entries for:

1.  **Specific Product Details**: Materials, care instructions, available colors, sizing.
2.  **Policies**: Returns, refunds, cancellations, artwork rights.
3.  **Contact & Support**: Hours of operation, phone numbers, specific emails for departments.
4.  **Troubleshooting**: "What if my order is late?", "What if I need to change my address?"
5.  **Brand Voice**: You can even add an entry about "Tone and Voice" if you want it to speak in a specific way (e.g., "We are casual and outdoorsy").

## 📝 How to Add Information

You can add information by running SQL commands in your Supabase SQL Editor.

### Step 1: Use the Template
Open `database/add_knowledge_template.sql`. Copy the `INSERT` statement structure and fill it with your data.

### Step 2: Categories
Use consistent categories to help the AI understand the type of info:
- `company_info` (General about us)
- `product` (Specific item details)
- `policy` (Rules and regulations)
- `process` (How things work)
- `shipping` (Timeframes and methods)
- `faq` (Common questions)

### Step 3: Run in Supabase
1. Go to your Supabase Project Dashboard.
2. Click on **SQL Editor**.
3. Paste your SQL commands.
4. Click **Run**.

## 💡 Examples of What to Add

**Q: "Do you sell single hats?"**
*Entry Title:* Minimum Order Quantities
*Content:* "Our minimum order quantity (MOQ) for custom hats is 24 units per design. For coozies, the MOQ is 50 units. We cannot fulfill single-item orders due to the setup required for custom production."

**Q: "Can I wash my hat?"**
*Entry Title:* Hat Care Instructions
*Content:* "We recommend spot cleaning your custom hats with warm water and mild soap. Do not put hats in the washing machine or dishwasher, as this can damage the structure and the decoration (embroidery/patch)."

**Q: "Where are you located?"**
*Entry Title:* Location
*Content:* "Reel48 is based in [City, State]. While we are an online-first company, we ship nationwide across the USA."

## 🔄 Maintenance

- **Update Regularly**: If you change a policy (e.g., shipping times), update the corresponding entry in the database.
- **Monitor Chat**: Read the chat logs periodically. If the AI says "I don't know," add that information to the knowledge base!

