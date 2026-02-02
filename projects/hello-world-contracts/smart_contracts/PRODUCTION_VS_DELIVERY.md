# Production vs. Delivery: Critical Distinction

## Overview

In renewable energy projects, there's an important difference between what you **produce** and what you **deliver**:

```
PRODUCTION (Solar Panels) → LOSSES → DELIVERY (Customer Receives)
    100,000 kWh             -5,000      95,000 kWh
```

## Why This Matters for PPA Contracts

### The Problem
If you only track production:
- ❌ Buyer pays for 100,000 kWh
- ❌ Buyer only receives 95,000 kWh
- ❌ You overcharge by 5,000 kWh

### The Solution
Track both production AND delivery:
- ✅ Production: 100,000 kWh (recorded from solar meters)
- ✅ Delivery: 95,000 kWh (verified at customer's meter)
- ✅ Buyer pays only for 95,000 kWh delivered

## Types of Losses

### 1. Transmission Losses (2-8%)
Energy lost transporting electricity through the grid:
- Line resistance
- Transformer losses
- Distance from generation to customer

### 2. Technical Losses
- Inverter efficiency
- DC-to-AC conversion
- Voltage regulation

### 3. Non-Technical Losses
- Meter accuracy differences
- Timing mismatches
- Grid curtailment events

## Updated System Architecture

### Before (Production Only)
```
Solar Panels → KWhReceipt → PPA Allocation → Payment
   100k kWh      100k kWh       100k kWh      $12,000
                                              (overpaid!)
```

### After (Production + Delivery)
```
Solar Panels → KWhReceipt → Loss Tracking → PPA Allocation → Payment
   100k kWh      100k kWh      -5k kWh        95k kWh       $11,400
                                                            (correct!)
```

## Three-Contract System

### 1. KWhReceipt (Existing)
**Purpose**: Record production from solar panels  
**Data Source**: Inverter meters, SCADA  
**Records**: Total generation at point of production

```typescript
// Month end: Record what panels produced
await kwhReceiptClient.recordProduction({
  epochId: 202602,
  intervalId: 1,
  kWhAmount: 100_000  // What panels generated
})
```

### 2. DeliveryTracking (NEW)
**Purpose**: Record actual delivery to customers  
**Data Source**: Utility meters at customer location  
**Records**: What customer actually received

```typescript
// After delivery verified: Record what customer got
await deliveryTrackingClient.recordDelivery({
  agreementId: 1,
  epochId: 202602,
  deliveredKWh: 95_000,      // What customer received
  productionKWh: 100_000     // Reference production
})
// Automatically calculates: 5% loss
```

### 3. PPA Contract (Updated)
**Purpose**: Allocate and bill based on delivery  
**Data Source**: DeliveryTracking contract  
**Records**: Customer pays only for delivered kWh

```typescript
// Allocate based on DELIVERY, not production
await ppaClient.allocateProduction({
  epochId: 202602,
  agreementId: 1,
  kWhAmount: 95_000,          // Delivered amount
  expectedTotalGeneration: 100_000
})

// Invoice = 95,000 kWh × $0.12 = $11,400 (not $12,000)
```

## Monthly Workflow (Updated)

### Day 29: Record Production
```
📊 Production Recording UI
Input: 100,000 kWh generated
→ Stored in KWhReceipt contract
```

### Day 30: Verify Delivery
```
📡 Delivery Verification
Source: Utility meter data / Grid operator confirmation

Company A:
├─ Allocated: 75,000 kWh (production)
├─ Delivered: 71,250 kWh (actual)
└─ Loss: 3,750 kWh (5%)

Company B:
├─ Allocated: 25,000 kWh (production)
├─ Delivered: 23,750 kWh (actual)
└─ Loss: 1,250 kWh (5%)

→ Stored in DeliveryTracking contract
```

### Day 31: Generate Invoices
```
💰 Invoice Generation (Automatic)

Company A Invoice:
├─ kWh Delivered: 71,250 kWh
├─ Price: $0.12/kWh
└─ Total: $8,550 (not $9,000)

Company B Invoice:
├─ kWh Delivered: 23,750 kWh
├─ Price: $0.10/kWh
└─ Total: $2,375 (not $2,500)
```

### Day 32+: Buyer Pays
```
Customer sees accurate invoice based on actual delivery
Pays only for what they received
```

## Loss Factor Calculation

### Automatic Calculation
```typescript
Production: 100,000 kWh
Delivery:    95,000 kWh
Loss:         5,000 kWh

Loss Factor = (5,000 / 100,000) × 10,000 = 500 bps (5%)
```

### Stored in Contract
- Used for future estimates
- Tracked per agreement
- Can vary by location, season, etc.

## Data Sources

### Production Data (KWhReceipt)
✅ Inverter monitoring systems  
✅ SCADA  
✅ On-site meters  
✅ Solar generation data

### Delivery Data (DeliveryTracking)
✅ Utility revenue meters  
✅ Grid operator confirmations  
✅ Customer's meter readings  
✅ Smart meter data (if available)

## UI Updates Needed

### Operator Console
**New Section: Delivery Recording**

```
┌────────────────────────────────────────┐
│ 📡 Delivery Recording                  │
├────────────────────────────────────────┤
│ Epoch: 202602                          │
│                                         │
│ Agreement: Company A (#1)              │
│ Production Allocated: 75,000 kWh       │
│ Actual Delivery: [71,250] kWh         │
│ Loss: 3,750 kWh (5.0%)                │
│                                         │
│ [Record Delivery]                      │
└────────────────────────────────────────┘
```

### Buyer Portal
**Updated Invoice Display**

```
┌────────────────────────────────────────┐
│ 📄 Invoice - February 2026             │
├────────────────────────────────────────┤
│ Production Allocated: 75,000 kWh       │
│ Transmission Loss:    -3,750 kWh (5%) │
│ ────────────────────────────────       │
│ Delivered to You:     71,250 kWh       │
│                                         │
│ Price: $0.12/kWh                       │
│ Total Due: $8,550.00                   │
│                                         │
│ [💳 Pay Now]                           │
└────────────────────────────────────────┘
```

## Business Logic

### Who Bears the Loss?
**Options:**

1. **Project Bears Loss** (Recommended)
   - Customer pays only for delivered kWh
   - Project absorbs transmission losses
   - More attractive to buyers
   - Standard in most PPAs

2. **Customer Bears Loss**
   - Customer pays for allocated kWh
   - Receives less due to losses
   - Less common, may require higher price

3. **Shared Loss**
   - Split losses between parties
   - Negotiated in PPA terms

### Loss Factor Limits
```typescript
// Set maximum acceptable loss
await deliveryTrackingClient.setDefaultLossFactor(500)  // 5%

// Reject deliveries with excessive loss
if (actualLoss > 8%) {
  alert("⚠️ Loss exceeds threshold - investigate")
}
```

## Example Scenarios

### Scenario 1: Normal Operation
```
Production:  100,000 kWh
Loss (5%):    -5,000 kWh
Delivery:     95,000 kWh
Invoice:      95,000 × $0.12 = $11,400 ✅
```

### Scenario 2: High Loss Event
```
Production:  100,000 kWh
Loss (12%):  -12,000 kWh (unexpected!)
Delivery:     88,000 kWh
Invoice:      88,000 × $0.12 = $10,560
→ Investigate cause of high loss
```

### Scenario 3: Multiple Customers
```
Total Production: 100,000 kWh

Customer A:
├─ Allocated: 60,000 kWh
├─ Delivered: 57,000 kWh (5% loss)
└─ Invoice: $6,840

Customer B:
├─ Allocated: 30,000 kWh  
├─ Delivered: 28,800 kWh (4% loss)
└─ Invoice: $2,880

Total Delivered: 85,800 kWh
Total Invoiced: $9,720
Remaining: 14,200 kWh → Token Holders
```

## Integration Steps

### 1. Deploy DeliveryTracking Contract
```bash
algokit compile delivery_tracking/contract.algo.ts
# Deploy to localnet/testnet
```

### 2. Update PPA Contract Logic
```typescript
// Change from:
await ppaClient.allocateProduction(productionKWh)

// To:
const deliveredKWh = await deliveryTrackingClient.getDelivery(...)
await ppaClient.allocateProduction(deliveredKWh)
```

### 3. Add Delivery Recording UI
```
Add new tab: "📡 Delivery Recording"
Import delivery data from utility/grid
Record to DeliveryTracking contract
```

### 4. Update Buyer Portal
```
Show both production and delivery
Display loss percentage
Invoice based on delivered kWh
```

## Benefits

### For Buyers
✅ Pay only for what they receive  
✅ Transparent loss accounting  
✅ Fair pricing  
✅ Incentivizes efficient delivery

### For Operators
✅ Accurate invoicing  
✅ Loss tracking for optimization  
✅ Better customer relationships  
✅ Compliance with regulations

### For Token Holders
✅ More remaining kWh (losses don't go to PPAs)  
✅ Fair revenue split  
✅ Transparent accounting

## Summary

**Key Changes:**
1. ✅ Track production (what you generate)
2. ✅ Track delivery (what customer receives)
3. ✅ Invoice based on delivery (fair billing)
4. ✅ Monitor losses (optimize system)

**Formula:**
```
Invoice = Delivered_kWh × Price_per_kWh
(not Production_kWh × Price_per_kWh)
```

This ensures customers pay only for electricity they actually receive!
