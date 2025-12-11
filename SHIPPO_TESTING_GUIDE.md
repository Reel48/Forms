# Shippo Integration - Testing Guide

## Pre-Testing Checklist

✅ **Database Migration**: Already applied
✅ **Dependencies**: Shippo package installed
✅ **Code**: Pushed to main
⏳ **API Key**: Waiting for Shippo API key (system works without it, but tracking won't update automatically)

## Testing Without API Key

The system will work in "manual mode" without the Shippo API key:
- ✅ You can add shipments manually
- ✅ Shipments will be stored in the database
- ✅ Customers can view shipments
- ❌ Tracking won't auto-update from Shippo
- ❌ "Refresh" button won't fetch new tracking data

## Testing Steps

### 1. Test Adding a Shipment (Admin Only)

1. **Login as Admin**
2. **Navigate to a Folder**
   - Go to `/folders` or click on any existing folder
3. **Add a Shipment**
   - Scroll to "Shipment Tracking" section
   - Click "Add Shipment" button
   - Fill in:
     - **Carrier**: Select from dropdown (USPS, UPS, FedEx, etc.)
     - **Tracking Number**: Enter any tracking number (e.g., "1234567890")
   - Click "Add Shipment"
4. **Verify**
   - Shipment should appear in the list
   - Status should show as "Pending"
   - Carrier name should display correctly

### 2. Test Viewing Shipments (Customer)

1. **Login as Customer** (or use a customer account)
2. **Navigate to Assigned Folder**
   - Go to a folder that's assigned to this customer
3. **View Shipment Tracking**
   - Scroll to "Shipment Tracking" section
   - Should see any shipments for this folder
   - Can click on shipment to see details
   - Can see tracking history (if events exist)

### 3. Test Multiple Shipments

1. **Add Multiple Shipments** to the same folder
2. **Verify**
   - All shipments appear in the list
   - Can switch between shipments
   - Each shipment shows its own tracking info

### 4. Test Refresh Button (Requires API Key)

Once you have the Shippo API key:
1. **Add API Key** to environment variables
2. **Add a Real Tracking Number**
   - Use a valid tracking number from a real shipment
3. **Click "Refresh"**
   - Should fetch latest tracking info from Shippo
   - Status should update
   - Tracking events should populate

## Testing with Real Tracking Numbers

### USPS Test Tracking Numbers
- `9400111899223197428490` (Example format)
- `9400111899562537374569`

### UPS Test Tracking Numbers
- `1Z999AA10123456784` (Example format)

### FedEx Test Tracking Numbers
- `123456789012` (Example format)

**Note**: These are example formats. Use real tracking numbers from actual shipments for testing.

## Expected Behavior

### Without API Key
- ✅ Shipments can be created
- ✅ Shipments display in UI
- ✅ Status shows as "pending"
- ⚠️ Refresh button shows warning or doesn't update
- ⚠️ No tracking events populated

### With API Key
- ✅ All of the above, plus:
- ✅ Refresh button fetches real tracking data
- ✅ Status updates automatically (pending → in_transit → delivered)
- ✅ Tracking events populate with location and timestamps
- ✅ Estimated delivery date shows
- ✅ Actual delivery date shows when delivered

## Common Issues & Solutions

### Issue: "Failed to add shipment"
- **Check**: Are you logged in as admin?
- **Check**: Does the folder exist?
- **Check**: Backend logs for errors

### Issue: "Can't see shipments"
- **Check**: Is the shipment assigned to the correct folder?
- **Check**: Does the user have access to the folder?
- **Check**: RLS policies are working correctly

### Issue: "Refresh doesn't work"
- **Check**: Is SHIPPO_API_KEY set?
- **Check**: Is the API key valid?
- **Check**: Is the tracking number format correct for the carrier?
- **Check**: Backend logs for Shippo API errors

### Issue: "Tracking events not showing"
- **Check**: Has the shipment been refreshed?
- **Check**: Does Shippo have tracking data for this number?
- **Check**: Some carriers may not provide detailed tracking

## Testing Checklist

- [ ] Admin can add shipment
- [ ] Shipment appears in folder
- [ ] Customer can view shipment
- [ ] Multiple shipments work
- [ ] Shipment selection works
- [ ] UI displays correctly
- [ ] Refresh button works (with API key)
- [ ] Tracking events populate (with API key)
- [ ] Status updates correctly (with API key)
- [ ] RLS policies prevent unauthorized access

## Next Steps After Testing

1. **If everything works**: Add Shippo API key when received
2. **If issues found**: Check backend logs and fix
3. **If UI needs adjustments**: Update CSS/styling
4. **If features missing**: Add additional functionality

## Backend Logs

Check backend logs for:
- Shippo API calls
- Database queries
- Error messages
- Tracking update attempts

## Frontend Console

Check browser console for:
- API call errors
- Network requests
- JavaScript errors
- React warnings

