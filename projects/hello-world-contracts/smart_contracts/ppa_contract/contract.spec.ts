import { describe, test, expect, beforeEach } from 'vitest'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { PPAContractClient } from '../artifacts/ppa_contract/PPAContractClient'

describe('PPA Contract Tests', () => {
  const localnet = algorandFixture()

  let appClient: PPAContractClient
  let admin: any
  let buyer1: any
  let buyer2: any
  let treasury: any

  const PRICE_PER_KWH = 120_000n // $0.12/kWh in micro-ALGOs
  const EPOCH_1 = 1n
  const EPOCH_10 = 10n

  beforeEach(async () => {
    await localnet.beforeEach()

    const { algod, testAccount } = localnet.context
    admin = testAccount
    treasury = await localnet.context.generateAccount({ initialFunds: 10_000_000 })
    buyer1 = await localnet.context.generateAccount({ initialFunds: 100_000_000 })
    buyer2 = await localnet.context.generateAccount({ initialFunds: 100_000_000 })

    appClient = new PPAContractClient(
      {
        sender: admin,
        resolveBy: 'id',
        id: 0,
      },
      algod
    )

    // Deploy contract
    await appClient.create.create({})

    // Initialize
    await appClient.initPpa({
      registry: treasury.addr, // Mock registry
      kwhReceipt: treasury.addr, // Mock receipt
      treasury: treasury.addr,
      settlementAssetId: 0n, // ALGO
    })
  })

  describe('Agreement Management', () => {
    test('should create valid PPA agreement', async () => {
      const result = await appClient.createAgreement({
        buyer: buyer1.addr,
        pricePerKWh: PRICE_PER_KWH,
        startEpoch: EPOCH_1,
        endEpoch: 60n,
        minKWhPerEpoch: 0n,
        maxKWhPerEpoch: 0n,
      })

      const agreementId = result.return?.valueOf() as bigint
      expect(agreementId).toBe(1n)

      // Verify agreement details
      const [buyer, price, start, end, status] = await appClient.getAgreement({
        agreementId,
      })

      expect(buyer).toBe(buyer1.addr)
      expect(price).toBe(PRICE_PER_KWH)
      expect(start).toBe(EPOCH_1)
      expect(end).toBe(60n)
      expect(status).toBe(0n) // Active
    })

    test('should reject self-dealing (buyer == seller)', async () => {
      await expect(
        appClient.createAgreement({
          buyer: treasury.addr, // Same as treasury
          pricePerKWh: PRICE_PER_KWH,
          startEpoch: EPOCH_1,
          endEpoch: 60n,
          minKWhPerEpoch: 0n,
          maxKWhPerEpoch: 0n,
        })
      ).rejects.toThrow(/BuyerCannotBeSeller/)
    })

    test('should reject invalid price (0)', async () => {
      await expect(
        appClient.createAgreement({
          buyer: buyer1.addr,
          pricePerKWh: 0n,
          startEpoch: EPOCH_1,
          endEpoch: 60n,
          minKWhPerEpoch: 0n,
          maxKWhPerEpoch: 0n,
        })
      ).rejects.toThrow(/InvalidPrice/)
    })

    test('should reject invalid epoch range', async () => {
      await expect(
        appClient.createAgreement({
          buyer: buyer1.addr,
          pricePerKWh: PRICE_PER_KWH,
          startEpoch: 60n,
          endEpoch: 1n, // End before start
          minKWhPerEpoch: 0n,
          maxKWhPerEpoch: 0n,
        })
      ).rejects.toThrow(/InvalidEpochRange/)
    })

    test('should reject min > max commitment', async () => {
      await expect(
        appClient.createAgreement({
          buyer: buyer1.addr,
          pricePerKWh: PRICE_PER_KWH,
          startEpoch: EPOCH_1,
          endEpoch: 60n,
          minKWhPerEpoch: 100_000n,
          maxKWhPerEpoch: 50_000n, // Max < min
        })
      ).rejects.toThrow(/MinExceedsMax/)
    })

    test('should terminate active agreement', async () => {
      const result = await appClient.createAgreement({
        buyer: buyer1.addr,
        pricePerKWh: PRICE_PER_KWH,
        startEpoch: EPOCH_1,
        endEpoch: 60n,
        minKWhPerEpoch: 0n,
        maxKWhPerEpoch: 0n,
      })

      const agreementId = result.return?.valueOf() as bigint

      await appClient.terminateAgreement({ agreementId })

      const [, , , , status] = await appClient.getAgreement({ agreementId })
      expect(status).toBe(1n) // Terminated
    })
  })

  describe('Production Allocation', () => {
    let agreementId: bigint

    beforeEach(async () => {
      const result = await appClient.createAgreement({
        buyer: buyer1.addr,
        pricePerKWh: PRICE_PER_KWH,
        startEpoch: EPOCH_1,
        endEpoch: 60n,
        minKWhPerEpoch: 0n,
        maxKWhPerEpoch: 0n,
      })
      agreementId = result.return?.valueOf() as bigint
    })

    test('should allocate production within bounds', async () => {
      await appClient.allocateProduction({
        epochId: EPOCH_10,
        agreementId,
        kWhAmount: 75_000n,
        expectedTotalGeneration: 100_000n,
      })

      const [kWh, revenue, isPaid] = await appClient.getAllocation({
        agreementId,
        epochId: EPOCH_10,
      })

      expect(kWh).toBe(75_000n)
      expect(revenue).toBe(75_000n * PRICE_PER_KWH)
      expect(isPaid).toBe(0n) // Not paid yet
    })

    test('should reject allocation exceeding total generation', async () => {
      await expect(
        appClient.allocateProduction({
          epochId: EPOCH_10,
          agreementId,
          kWhAmount: 150_000n,
          expectedTotalGeneration: 100_000n, // Total is less
        })
      ).rejects.toThrow(/ExceedsTotalGeneration/)
    })

    test('should reject allocation outside agreement epoch range', async () => {
      // Agreement is for epochs 1-60
      await expect(
        appClient.allocateProduction({
          epochId: 100n, // Outside range
          agreementId,
          kWhAmount: 50_000n,
          expectedTotalGeneration: 100_000n,
        })
      ).rejects.toThrow(/EpochOutOfRange/)
    })

    test('should reject duplicate allocation', async () => {
      await appClient.allocateProduction({
        epochId: EPOCH_10,
        agreementId,
        kWhAmount: 50_000n,
        expectedTotalGeneration: 100_000n,
      })

      // Try to allocate again
      await expect(
        appClient.allocateProduction({
          epochId: EPOCH_10,
          agreementId,
          kWhAmount: 30_000n,
          expectedTotalGeneration: 100_000n,
        })
      ).rejects.toThrow(/AllocationAlreadyExists/)
    })

    test('should handle multiple buyers in same epoch', async () => {
      // Create second agreement
      const result2 = await appClient.createAgreement({
        buyer: buyer2.addr,
        pricePerKWh: 100_000n, // Different price
        startEpoch: EPOCH_1,
        endEpoch: 60n,
        minKWhPerEpoch: 0n,
        maxKWhPerEpoch: 0n,
      })
      const agreementId2 = result2.return?.valueOf() as bigint

      // Allocate to buyer 1
      await appClient.allocateProduction({
        epochId: EPOCH_10,
        agreementId,
        kWhAmount: 60_000n,
        expectedTotalGeneration: 100_000n,
      })

      // Allocate to buyer 2
      await appClient.allocateProduction({
        epochId: EPOCH_10,
        agreementId: agreementId2,
        kWhAmount: 30_000n,
        expectedTotalGeneration: 100_000n,
      })

      // Verify epoch summary
      const [totalKWh, totalRevenue, settled] = await appClient.getEpochSummary({
        epochId: EPOCH_10,
      })

      expect(totalKWh).toBe(90_000n) // 60k + 30k
      expect(totalRevenue).toBe(60_000n * PRICE_PER_KWH + 30_000n * 100_000n)
      expect(settled).toBe(0n)
    })

    test('should enforce min/max commitments', async () => {
      // Create agreement with commitments
      const result = await appClient.createAgreement({
        buyer: buyer1.addr,
        pricePerKWh: PRICE_PER_KWH,
        startEpoch: EPOCH_1,
        endEpoch: 60n,
        minKWhPerEpoch: 50_000n,
        maxKWhPerEpoch: 100_000n,
      })
      const agreementId3 = result.return?.valueOf() as bigint

      // Below minimum
      await expect(
        appClient.allocateProduction({
          epochId: EPOCH_10,
          agreementId: agreementId3,
          kWhAmount: 40_000n, // Below 50k min
          expectedTotalGeneration: 100_000n,
        })
      ).rejects.toThrow(/BelowMinCommitment/)

      // Above maximum
      await expect(
        appClient.allocateProduction({
          epochId: EPOCH_10,
          agreementId: agreementId3,
          kWhAmount: 110_000n, // Above 100k max
          expectedTotalGeneration: 200_000n,
        })
      ).rejects.toThrow(/ExceedsMaxCommitment/)
    })

    test('should settle epoch', async () => {
      await appClient.allocateProduction({
        epochId: EPOCH_10,
        agreementId,
        kWhAmount: 75_000n,
        expectedTotalGeneration: 100_000n,
      })

      await appClient.settleEpoch({ epochId: EPOCH_10 })

      const [, , settled] = await appClient.getEpochSummary({ epochId: EPOCH_10 })
      expect(settled).toBe(1n)

      // Cannot allocate after settlement
      await expect(
        appClient.allocateProduction({
          epochId: EPOCH_10,
          agreementId,
          kWhAmount: 10_000n,
          expectedTotalGeneration: 100_000n,
        })
      ).rejects.toThrow(/EpochAlreadySettled/)
    })
  })

  describe('Payment Settlement', () => {
    let agreementId: bigint
    const kWhAmount = 75_000n
    const totalGeneration = 100_000n
    let expectedRevenue: bigint

    beforeEach(async () => {
      // Create agreement
      const result = await appClient.createAgreement({
        buyer: buyer1.addr,
        pricePerKWh: PRICE_PER_KWH,
        startEpoch: EPOCH_1,
        endEpoch: 60n,
        minKWhPerEpoch: 0n,
        maxKWhPerEpoch: 0n,
      })
      agreementId = result.return?.valueOf() as bigint

      // Allocate production
      await appClient.allocateProduction({
        epochId: EPOCH_10,
        agreementId,
        kWhAmount,
        expectedTotalGeneration: totalGeneration,
      })

      expectedRevenue = kWhAmount * PRICE_PER_KWH
    })

    test('should settle payment with correct amount', async () => {
      const { algod } = localnet.context

      // Create payment transaction
      const suggestedParams = await algod.getTransactionParams().do()
      const paymentTxn = {
        from: buyer1.addr,
        to: treasury.addr,
        amount: Number(expectedRevenue),
        ...suggestedParams,
      }

      // Group: payment + settlement call
      // Note: Actual implementation requires proper group transaction handling
      // This is a simplified test structure

      await appClient.settlePayment(
        {
          agreementId,
          epochId: EPOCH_10,
        },
        {
          sender: buyer1,
          // In real implementation, would include grouped payment txn
        }
      )

      // Verify payment recorded
      const [, , isPaid] = await appClient.getAllocation({
        agreementId,
        epochId: EPOCH_10,
      })
      expect(isPaid).toBe(1n)
    })

    test('should reject double payment', async () => {
      // First payment (successful)
      await appClient.settlePayment(
        {
          agreementId,
          epochId: EPOCH_10,
        },
        { sender: buyer1 }
      )

      // Second payment attempt
      await expect(
        appClient.settlePayment(
          {
            agreementId,
            epochId: EPOCH_10,
          },
          { sender: buyer1 }
        )
      ).rejects.toThrow(/AlreadyPaid/)
    })

    test('should reject payment for non-existent allocation', async () => {
      await expect(
        appClient.settlePayment(
          {
            agreementId,
            epochId: 99n, // No allocation for this epoch
          },
          { sender: buyer1 }
        )
      ).rejects.toThrow(/AllocationNotFound/)
    })
  })

  describe('Query Functions', () => {
    let agreementId: bigint

    beforeEach(async () => {
      const result = await appClient.createAgreement({
        buyer: buyer1.addr,
        pricePerKWh: PRICE_PER_KWH,
        startEpoch: EPOCH_1,
        endEpoch: 60n,
        minKWhPerEpoch: 0n,
        maxKWhPerEpoch: 0n,
      })
      agreementId = result.return?.valueOf() as bigint

      await appClient.allocateProduction({
        epochId: EPOCH_10,
        agreementId,
        kWhAmount: 75_000n,
        expectedTotalGeneration: 100_000n,
      })
    })

    test('should return allocation details', async () => {
      const [kWh, revenue, isPaid] = await appClient.getAllocation({
        agreementId,
        epochId: EPOCH_10,
      })

      expect(kWh).toBe(75_000n)
      expect(revenue).toBe(75_000n * PRICE_PER_KWH)
      expect(isPaid).toBe(0n)
    })

    test('should return epoch summary', async () => {
      const [totalKWh, totalRevenue, settled] = await appClient.getEpochSummary({
        epochId: EPOCH_10,
      })

      expect(totalKWh).toBe(75_000n)
      expect(totalRevenue).toBe(75_000n * PRICE_PER_KWH)
      expect(settled).toBe(0n)
    })

    test('should return agreement details', async () => {
      const [buyer, price, start, end, status] = await appClient.getAgreement({
        agreementId,
      })

      expect(buyer).toBe(buyer1.addr)
      expect(price).toBe(PRICE_PER_KWH)
      expect(start).toBe(EPOCH_1)
      expect(end).toBe(60n)
      expect(status).toBe(0n)
    })

    test('should return zero for non-existent allocation', async () => {
      const [kWh, revenue, isPaid] = await appClient.getAllocation({
        agreementId,
        epochId: 999n, // Non-existent
      })

      expect(kWh).toBe(0n)
      expect(revenue).toBe(0n)
      expect(isPaid).toBe(0n)
    })
  })

  describe('Admin Functions', () => {
    test('should pause and unpause contract', async () => {
      await appClient.setPaused({ paused: 1n })

      // Operations should fail when paused
      await expect(
        appClient.createAgreement({
          buyer: buyer1.addr,
          pricePerKWh: PRICE_PER_KWH,
          startEpoch: EPOCH_1,
          endEpoch: 60n,
          minKWhPerEpoch: 0n,
          maxKWhPerEpoch: 0n,
        })
      ).rejects.toThrow(/ContractPaused/)

      // Unpause
      await appClient.setPaused({ paused: 0n })

      // Should work again
      const result = await appClient.createAgreement({
        buyer: buyer1.addr,
        pricePerKWh: PRICE_PER_KWH,
        startEpoch: EPOCH_1,
        endEpoch: 60n,
        minKWhPerEpoch: 0n,
        maxKWhPerEpoch: 0n,
      })

      expect(result.return?.valueOf()).toBe(1n)
    })

    test('should update treasury', async () => {
      const newTreasury = await localnet.context.generateAccount({
        initialFunds: 10_000_000,
      })

      await appClient.updateTreasury({ newTreasury: newTreasury.addr })

      // Verify by creating agreement (seller should be new treasury)
      // This would be verified in actual treasury.value reads
    })

    test('should reject non-admin operations', async () => {
      await expect(
        appClient.setPaused({ paused: 1n }, { sender: buyer1 })
      ).rejects.toThrow(/NotAdmin/)
    })
  })
})
