import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { store, ethereum } from '@graphprotocol/graph-ts'
import {
  Stopped,
  Resumed,
  Transfer,
  Approval,
  FeeSet,
  FeeDistributionSet,
  WithdrawalCredentialsSet,
  Submitted,
  Unbuffered,
  Withdrawal,
  ELRewardsReceived,
  ELRewardsVaultSet as ELRewardsVaultSetEvent,
  ELRewardsWithdrawalLimitSet as ELRewardsWithdrawalLimitSetEvent,
  ProtocolContactsSet as ProtocolContactsSetEvent,
  StakingLimitRemoved,
  StakingLimitSet as StakingLimitSetEvent,
  StakingResumed,
  StakingPaused,
  TransferShares,
  SharesBurnt,
  BeaconValidatorsUpdated,
} from '../generated/Lido/Lido'
import {
  LidoStopped,
  LidoResumed,
  LidoTransfer,
  LidoApproval,
  LidoFee,
  LidoFeeDistribution,
  LidoWithdrawalCredential,
  LidoSubmission,
  LidoUnbuffered,
  LidoWithdrawal,
  TotalReward,
  NodeOperatorFees,
  Totals,
  NodeOperatorsShares,
  Shares,
  Holder,
  Stats,
  CurrentFees,
  ELRewardsVaultSet,
  ELRewardsWithdrawalLimitSet,
  ProtocolContactsSet,
  StakingLimitRemove,
  StakingLimitSet,
  StakingResume,
  StakingPause,
  SharesTransfer,
  SharesBurn,
  Settings,
  HourlyUsageSnapshot,
  DailyUsageSnapshot,
  Protocol,
} from '../generated/schema'

import { loadLidoContract, loadNosContract } from './contracts'

import {
  ZERO,
  getAddress,
  ONE,
  CALCULATION_UNIT,
  ZERO_ADDRESS,
  ZERO_BIG_DECIMAL,
  HOUR_IN_SECONDS,
  DAY_IN_SECONDS
} from './constants'

import { wcKeyCrops } from './wcKeyCrops'

export function handleStopped(event: Stopped): void {
  let entity = new LidoStopped(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp

  entity.save()
}

export function handleResumed(event: Resumed): void {
  let entity = new LidoResumed(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp

  entity.save()
}

export function handleTransfer(event: Transfer): void {
  let entity = new LidoTransfer(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.from = event.params.from
  entity.to = event.params.to
  entity.value = event.params.value

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex
  entity.transactionLogIndex = event.transactionLogIndex

  let fromZeros = event.params.from == ZERO_ADDRESS

  let totalRewardsEntity = TotalReward.load(event.transaction.hash)

  // We know that for rewards distribution shares are minted with same from 0x0 address as staking
  // We can save this indicator which helps us distinguish such mints from staking events
  entity.mintWithoutSubmission = totalRewardsEntity ? true : false

  // Entity is already created at this point
  let totals = Totals.load('') as Totals

  entity.totalPooledEther = totals.totalPooledEther
  entity.totalShares = totals.totalShares

  let shares = event.params.value
    .times(totals.totalShares)
    .div(totals.totalPooledEther)

  if (!fromZeros) {
    entity.shares = shares
  }

  // We'll save the entity later

  /**
  Handling fees, in order:
  
  1. Insurance Fund Transfer
  2. Node Operator Reward Transfers
  3. Treasury Fund Transfer with remaining dust or just rounding dust
  **/

  let isInsuranceFee =
    fromZeros && event.params.to == getAddress('Insurance Fund')
  let isMintToTreasury = fromZeros && event.params.to == getAddress('Treasury')

  // If insuranceFee on totalRewards exists, then next transfer is of dust to treasury
  // We need this if treasury and insurance fund is the same address
  let insuranceFeeExists =
    !!totalRewardsEntity && totalRewardsEntity.insuranceFee !== null

  if (totalRewardsEntity && isInsuranceFee && !insuranceFeeExists) {
    // Handling the Insurance Fee transfer event

    entity.shares = totalRewardsEntity.sharesToInsuranceFund

    totalRewardsEntity.insuranceFee = event.params.value

    totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(
      event.params.value
    )
    totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(
      event.params.value
    )

    totalRewardsEntity.save()
  } else if (totalRewardsEntity && isMintToTreasury && insuranceFeeExists) {
    // Handling the Treasury Fund transfer event

    // Dust exists only when treasuryFeeBasisPoints is 0
    let currentFees = CurrentFees.load('')!
    let isDust = currentFees.treasuryFeeBasisPoints!.equals(ZERO)

    if (isDust) {
      entity.shares = totalRewardsEntity.dustSharesToTreasury
      totalRewardsEntity.dust = event.params.value
      totalRewardsEntity.treasuryFee = ZERO
    } else {
      entity.shares = totalRewardsEntity.sharesToTreasury
      totalRewardsEntity.treasuryFee = event.params.value
      totalRewardsEntity.dust = ZERO
    }

    totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(
      event.params.value
    )
    totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(
      event.params.value
    )

    totalRewardsEntity.save()
  } else if (totalRewardsEntity && fromZeros) {
    // Handling node operator fee transfer to node operator

    // Entity should be existent at this point
    let nodeOperatorsShares = NodeOperatorsShares.load(
      event.transaction.hash.toHex() + '-' + event.params.to.toHexString()
    ) as NodeOperatorsShares

    let sharesToOperator = nodeOperatorsShares.shares

    entity.shares = sharesToOperator

    let nodeOperatorFees = new NodeOperatorFees(
      event.transaction.hash.toHex() + '-' + event.logIndex.toString()
    )

    // Reference to TotalReward entity
    nodeOperatorFees.totalReward = event.transaction.hash

    nodeOperatorFees.address = event.params.to
    nodeOperatorFees.fee = event.params.value

    totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(
      event.params.value
    )
    totalRewardsEntity.operatorsFee = totalRewardsEntity.operatorsFee.plus(
      event.params.value
    )
    totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(
      event.params.value
    )

    totalRewardsEntity.save()
    nodeOperatorFees.save()
  }

  if (entity.shares) {
    // Decreasing from address shares
    // No point in changing 0x0 shares
    if (!fromZeros) {
      let sharesFromEntity = Shares.load(event.params.from)
      // Address must already have shares, HOWEVER:
      // Someone can and managed to produce events of 0 to 0 transfers
      if (!sharesFromEntity) {
        sharesFromEntity = new Shares(event.params.from)
        sharesFromEntity.shares = ZERO
      }

      entity.sharesBeforeDecrease = sharesFromEntity.shares
      sharesFromEntity.shares = sharesFromEntity.shares.minus(entity.shares!)
      entity.sharesAfterDecrease = sharesFromEntity.shares

      sharesFromEntity.save()

      // Calculating new balance
      entity.balanceAfterDecrease = entity
        .sharesAfterDecrease!.times(totals.totalPooledEther)
        .div(totals.totalShares)
    }

    // Increasing to address shares
    let sharesToEntity = Shares.load(event.params.to)

    if (!sharesToEntity) {
      sharesToEntity = new Shares(event.params.to)
      sharesToEntity.shares = ZERO
    }

    entity.sharesBeforeIncrease = sharesToEntity.shares
    sharesToEntity.shares = sharesToEntity.shares.plus(entity.shares!)
    entity.sharesAfterIncrease = sharesToEntity.shares

    sharesToEntity.save()

    // Calculating new balance
    entity.balanceAfterIncrease = entity
      .sharesAfterIncrease!.times(totals.totalPooledEther)
      .div(totals.totalShares)
  }

  entity.save()

  // Saving recipient address as a unique stETH holder
  if (event.params.value.gt(ZERO)) {
    let holder = Holder.load(event.params.to)

    let holderExists = !!holder

    if (!holder) {
      holder = new Holder(event.params.to)
      holder.address = event.params.to
      holder.save()
    }

    let stats = Stats.load('')

    if (!stats) {
      stats = new Stats('')
      stats.uniqueHolders = ZERO
      stats.uniqueAnytimeHolders = ZERO
    }

    if (!holderExists) {
      stats.uniqueHolders = stats.uniqueHolders!.plus(ONE)
      stats.uniqueAnytimeHolders = stats.uniqueAnytimeHolders!.plus(ONE)
    } else if (!fromZeros && entity.balanceAfterDecrease!.equals(ZERO)) {
      // Mints don't have balanceAfterDecrease

      stats.uniqueHolders = stats.uniqueHolders!.minus(ONE)
    }
    // TODO: update usage stats
    updateTransactionCount(event)
    updateActiveUniqueUserCount(event, event.params.from)
    updateTotalValueLockedUSD(event, new BigDecimal(event.params.value))
    stats.save()
  }
}

export function handleApproval(event: Approval): void {
  let entity = new LidoApproval(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  // TODO: update usage stats
  updateTransactionCount(event)
  updateActiveUniqueUserCount(event, event.params.owner)

  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value

  entity.save()
}

export function handleFeeSet(event: FeeSet): void {
  let entity = new LidoFee(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.feeBasisPoints = event.params.feeBasisPoints

  entity.save()

  let current = CurrentFees.load('')
  if (!current) current = new CurrentFees('')
  current.feeBasisPoints = BigInt.fromI32(event.params.feeBasisPoints)
  current.save()
}

export function handleFeeDistributionSet(event: FeeDistributionSet): void {
  let entity = new LidoFeeDistribution(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.treasuryFeeBasisPoints = event.params.treasuryFeeBasisPoints
  entity.insuranceFeeBasisPoints = event.params.insuranceFeeBasisPoints
  entity.operatorsFeeBasisPoints = event.params.operatorsFeeBasisPoints

  entity.save()

  let current = CurrentFees.load('')
  if (!current) current = new CurrentFees('')
  current.treasuryFeeBasisPoints = BigInt.fromI32(
    event.params.treasuryFeeBasisPoints
  )
  current.insuranceFeeBasisPoints = BigInt.fromI32(
    event.params.insuranceFeeBasisPoints
  )
  current.operatorsFeeBasisPoints = BigInt.fromI32(
    event.params.operatorsFeeBasisPoints
  )
  current.save()
}

export function handleWithdrawalCredentialsSet(
  event: WithdrawalCredentialsSet
): void {
  let entity = new LidoWithdrawalCredential(event.params.withdrawalCredentials)

  entity.withdrawalCredentials = event.params.withdrawalCredentials

  entity.block = event.block.number
  entity.blockTime = event.block.number

  entity.save()

  // Cropping unused keys on withdrawal credentials change
  if (
    event.params.withdrawalCredentials.toHexString() ==
    '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f'
  ) {
    let keys = wcKeyCrops.get(
      '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f'
    )

    let length = keys.length

    // There is no for...of loop in AS
    for (let i = 0; i < length; i++) {
      let key = keys[i]
      store.remove('NodeOperatorSigningKey', key)
    }
  }
}

export function handleSubmit(event: Submitted): void {
  /**
  Notice: Contract checks if someone submitted zero wei, no need for checking again.
  **/

  let entity = new LidoSubmission(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  // Loading totals
  let totals = Totals.load('')

  let isFirstSubmission = !totals

  if (!totals) {
    totals = new Totals('')
    totals.totalPooledEther = ZERO
    totals.totalShares = ZERO
  }

  //TODO: update usage stats
  updateTransactionCount(event)
  updateActiveUniqueUserCount(event, event.params.sender)
  updateTotalValueLockedUSD(event, new BigDecimal(event.params.amount))
  entity.sender = event.params.sender
  entity.amount = event.params.amount
  entity.referral = event.params.referral

  /**
   Use 1:1 ether-shares ratio when:
   1. Nothing was staked yet
   2. Someone staked something, but shares got rounded to 0 eg staking 1 wei
  **/

  // Check if contract has no ether or shares yet
  let shares = !isFirstSubmission
    ? event.params.amount.times(totals.totalShares).div(totals.totalPooledEther)
    : event.params.amount

  // Someone staked > 0 wei, but shares to mint got rounded to 0
  if (shares.equals(ZERO)) {
    shares = event.params.amount
  }

  entity.shares = shares

  // Increasing address shares
  let sharesEntity = Shares.load(event.params.sender)

  if (!sharesEntity) {
    sharesEntity = new Shares(event.params.sender)
    sharesEntity.shares = ZERO
  }

  entity.sharesBefore = sharesEntity.shares
  sharesEntity.shares = sharesEntity.shares.plus(shares)
  entity.sharesAfter = sharesEntity.shares

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex
  entity.transactionLogIndex = event.transactionLogIndex

  entity.totalPooledEtherBefore = totals.totalPooledEther
  entity.totalSharesBefore = totals.totalShares

  // Increasing Totals
  totals.totalPooledEther = totals.totalPooledEther.plus(event.params.amount)
  totals.totalShares = totals.totalShares.plus(shares)

  entity.totalPooledEtherAfter = totals.totalPooledEther
  entity.totalSharesAfter = totals.totalShares

  // Calculating new balance
  entity.balanceAfter = entity.sharesAfter
    .times(totals.totalPooledEther)
    .div(totals.totalShares)

  entity.save()
  sharesEntity.save()
  totals.save()
}

export function handleUnbuffered(event: Unbuffered): void {
  let entity = new LidoUnbuffered(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.amount = event.params.amount

  entity.save()
}

export function handleWithdrawal(event: Withdrawal): void {
  let entity = new LidoWithdrawal(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  //TODO: Handle usage stats

  updateTransactionCount(event)
  entity.sender = event.params.sender
  updateActiveUniqueUserCount(event, event.params.sender)
  entity.tokenAmount = event.params.tokenAmount
  entity.sentFromBuffer = event.params.sentFromBuffer // current ETH side
  entity.pubkeyHash = event.params.pubkeyHash // ETH 2.0 side
  entity.etherAmount = event.params.etherAmount // ETH 2.0 side

  entity.save()

  let totals = Totals.load('')!

  let shares = event.params.tokenAmount
    .times(totals.totalShares)
    .div(totals.totalPooledEther)

  totals.totalPooledEther = totals.totalPooledEther.minus(
    event.params.tokenAmount
  )
  totals.totalShares = totals.totalShares.minus(shares)

  totals.save()
}

export function handleBeaconValidatorsUpdated(
  // WARNING: Will break handler without event!
  _event: BeaconValidatorsUpdated
): void {
  // TODO: Check this and see if the same can be used for getting ETH vs USD price
  let contract = loadLidoContract()
  let realPooledEther = contract.getTotalPooledEther()

  let totals = Totals.load('')!
  totals.totalPooledEther = realPooledEther
  totals.save()
}

/**
We need to recalculate total rewards when there are MEV rewards.
This event is emitted only when there was something taken from MEV vault.
Most logic is the same as in Oracle's handleCompleted.

TODO: We should not skip TotalReward creation when there are no basic rewards but there are MEV rewards. 

Usual order of events:
BeaconReported -> Completed -> ELRewardsReceived

Accounting for ELRewardsReceived before Completed too for edge cases.
**/
export function handleELRewardsReceived(event: ELRewardsReceived): void {
  let totalRewardsEntity = TotalReward.load(event.transaction.hash)

  let currentFees = CurrentFees.load('')!

  // Construct TotalReward if there were no basic rewards but there are MEV rewards
  if (!totalRewardsEntity) {
    totalRewardsEntity = new TotalReward(event.transaction.hash)

    totalRewardsEntity.totalRewardsWithFees = ZERO
    totalRewardsEntity.totalRewards = ZERO
    totalRewardsEntity.totalFee = ZERO
    totalRewardsEntity.operatorsFee = ZERO

    totalRewardsEntity.feeBasis = currentFees.feeBasisPoints!
    totalRewardsEntity.treasuryFeeBasisPoints =
      currentFees.treasuryFeeBasisPoints!
    totalRewardsEntity.insuranceFeeBasisPoints =
      currentFees.insuranceFeeBasisPoints!
    totalRewardsEntity.operatorsFeeBasisPoints =
      currentFees.operatorsFeeBasisPoints!

    let totals = Totals.load('')!
    totalRewardsEntity.totalPooledEtherBefore = totals.totalPooledEther
    totalRewardsEntity.totalSharesBefore = totals.totalShares

    totalRewardsEntity.block = event.block.number
    totalRewardsEntity.blockTime = event.block.timestamp
    totalRewardsEntity.transactionIndex = event.transaction.index
    totalRewardsEntity.logIndex = event.logIndex
    totalRewardsEntity.transactionLogIndex = event.transactionLogIndex
  }

  let mevFee = event.params.amount
  totalRewardsEntity.mevFee = mevFee

  let newTotalRewards = totalRewardsEntity.totalRewardsWithFees.plus(mevFee)

  totalRewardsEntity.totalRewardsWithFees = newTotalRewards
  totalRewardsEntity.totalRewards = newTotalRewards

  let totalPooledEtherAfter =
    totalRewardsEntity.totalPooledEtherBefore.plus(newTotalRewards)

  // Overall shares for all rewards cut
  let shares2mint = newTotalRewards
    .times(totalRewardsEntity.feeBasis)
    .times(totalRewardsEntity.totalSharesBefore)
    .div(
      totalPooledEtherAfter
        .times(CALCULATION_UNIT)
        .minus(totalRewardsEntity.feeBasis.times(newTotalRewards))
    )

  let totalSharesAfter = totalRewardsEntity.totalSharesBefore.plus(shares2mint)

  let totals = Totals.load('') as Totals
  totals.totalPooledEther = totalPooledEtherAfter
  totals.totalShares = totalSharesAfter
  totals.save()

  let sharesToInsuranceFund = shares2mint
    .times(totalRewardsEntity.insuranceFeeBasisPoints)
    .div(CALCULATION_UNIT)

  let sharesToOperators = shares2mint
    .times(totalRewardsEntity.operatorsFeeBasisPoints)
    .div(CALCULATION_UNIT)

  totalRewardsEntity.shares2mint = shares2mint

  totalRewardsEntity.sharesToInsuranceFund = sharesToInsuranceFund
  totalRewardsEntity.sharesToOperators = sharesToOperators

  totalRewardsEntity.totalPooledEtherAfter = totalPooledEtherAfter
  totalRewardsEntity.totalSharesAfter = totalSharesAfter

  // We will save the entity later

  let registry = loadNosContract()
  let distr = registry.getRewardsDistribution(sharesToOperators)

  let opAddresses = distr.value0
  let opShares = distr.value1

  let sharesToOperatorsActual = ZERO

  for (let i = 0; i < opAddresses.length; i++) {
    let addr = opAddresses[i]
    let shares = opShares[i]

    // Incrementing total of actual shares distributed
    sharesToOperatorsActual = sharesToOperatorsActual.plus(shares)

    let nodeOperatorsShares = new NodeOperatorsShares(
      event.transaction.hash.toHex() + '-' + addr.toHexString()
    )
    nodeOperatorsShares.totalReward = event.transaction.hash

    nodeOperatorsShares.address = addr
    nodeOperatorsShares.shares = shares

    nodeOperatorsShares.save()
  }

  // sharesToTreasury either:
  // - contain dust already and dustSharesToTreasury is 0
  // or
  // - 0 and there's dust

  let treasuryShares = shares2mint
    .minus(sharesToInsuranceFund)
    .minus(sharesToOperatorsActual)

  let sharesToTreasury = currentFees.treasuryFeeBasisPoints!.notEqual(ZERO)
    ? treasuryShares
    : ZERO
  totalRewardsEntity.sharesToTreasury = sharesToTreasury

  let dustSharesToTreasury = currentFees.treasuryFeeBasisPoints!.equals(ZERO)
    ? treasuryShares
    : ZERO
  totalRewardsEntity.dustSharesToTreasury = dustSharesToTreasury

  totalRewardsEntity.save()
}

export function handleELRewardsVaultSet(event: ELRewardsVaultSetEvent): void {
  let entity = new ELRewardsVaultSet(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.executionLayerRewardsVault = event.params.executionLayerRewardsVault

  entity.save()
}

export function handleELRewardsWithdrawalLimitSet(
  event: ELRewardsWithdrawalLimitSetEvent
): void {
  let entity = new ELRewardsWithdrawalLimitSet(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.limitPoints = event.params.limitPoints

  entity.save()
}

export function handleProtocolContactsSet(
  event: ProtocolContactsSetEvent
): void {
  let entity = new ProtocolContactsSet(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.insuranceFund = event.params.insuranceFund
  entity.oracle = event.params.oracle
  entity.treasury = event.params.treasury

  entity.save()

  let settings = Settings.load('')
  if (!settings) settings = new Settings('')
  settings.insuranceFund = event.params.insuranceFund
  settings.oracle = event.params.oracle
  settings.treasury = event.params.treasury
  settings.save()

  getProtocol()
}

export function handleStakingLimitRemoved(event: StakingLimitRemoved): void {
  let entity = new StakingLimitRemove(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.save()
}

export function handleStakingLimitSet(event: StakingLimitSetEvent): void {
  let entity = new StakingLimitSet(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.maxStakeLimit = event.params.maxStakeLimit
  entity.stakeLimitIncreasePerBlock = event.params.stakeLimitIncreasePerBlock

  entity.save()
}

export function handleStakingResumed(event: StakingResumed): void {
  let entity = new StakingResume(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.save()
}

export function handleStakingPaused(event: StakingPaused): void {
  let entity = new StakingPause(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.save()
}

/**
Not modifying user's shares here as we are doing it when handling transfers.
**/
export function handleTransferShares(event: TransferShares): void {
  let entity = new SharesTransfer(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.from = event.params.from
  entity.sharesValue = event.params.sharesValue
  entity.to = event.params.to

  entity.save()
}

export function handleSharesBurnt(event: SharesBurnt): void {
  let entity = new SharesBurn(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.account = event.params.account
  entity.postRebaseTokenAmount = event.params.postRebaseTokenAmount
  entity.preRebaseTokenAmount = event.params.preRebaseTokenAmount
  entity.sharesAmount = event.params.sharesAmount

  entity.save()

  let address = event.params.account
  let sharesAmount = event.params.sharesAmount

  let shares = Shares.load(address)!
  shares.shares = shares.shares.minus(sharesAmount)
  shares.save()

  let totals = Totals.load('')!
  totals.totalShares = totals.totalShares.minus(sharesAmount)
  totals.save()
}

/**
Handling manual NOs removal on Testnet in txs:
6014681 0x45b83117a28ba9f6aed3a865004e85aea1e8611998eaef52ca81d47ac43e98d5
6014696 0x5d37899cce4086d7cdf8590f90761e49cd5dcc5c32aebbf2d9a6b2a1c00152c7

This allows us not to enable tracing.

WARNING:
If Totals are wrong just before these blocks, then graph-node tracing filter broke again.

Broken Oracle report after long broken state:
First val number went down, but then went up all when reports were not happening.
7225143 0xde2667f834746bdbe0872163d632ce79c4930a82ec7c3c11cb015373b691643b

**/

export function handleTestnetBlock(block: ethereum.Block): void {
  if (
    block.number.toString() == '6014681' ||
    block.number.toString() == '6014696' ||
    block.number.toString() == '7225143'
  ) {
    let contract = loadLidoContract()
    let realPooledEther = contract.getTotalPooledEther()

    let totals = Totals.load('')!
    totals.totalPooledEther = realPooledEther
    totals.save()
  }
}

export function getProtocol(): Protocol {
  let protocol = Protocol.load('')
  if (protocol === null) {
    protocol = new Protocol('')
    protocol.tvlUSD = ZERO_BIG_DECIMAL
    protocol.save()
  }
  return protocol
}

export function getHourlyUsageSnapshot(event: ethereum.Event): HourlyUsageSnapshot {
  let blockTimestamp = event.block.timestamp.toI32()
  let hourIndex = blockTimestamp / HOUR_IN_SECONDS, dayID = blockTimestamp / DAY_IN_SECONDS
  let hourID = dayID.toString().concat("-").concat(hourIndex.toString())

  let hourlyUsageSnapshot = HourlyUsageSnapshot.load(hourID)
  if (hourlyUsageSnapshot === null) {
    hourlyUsageSnapshot = new HourlyUsageSnapshot(hourID)
    hourlyUsageSnapshot.protocol = getProtocol().id
    hourlyUsageSnapshot.periodStartUnix = hourIndex
    hourlyUsageSnapshot.tvlUSD = ZERO_BIG_DECIMAL
    hourlyUsageSnapshot.txCount = ZERO
    hourlyUsageSnapshot.activeUsersCount = ZERO
    hourlyUsageSnapshot.activeUsers = []
    hourlyUsageSnapshot.save()
  }

  return hourlyUsageSnapshot
}

export function getDailyUsageSnapshot(event: ethereum.Event): DailyUsageSnapshot {
  let blockTimestamp = event.block.timestamp.toI32()
  let date = (blockTimestamp / DAY_IN_SECONDS)
  let dailyUsageSnapshot = DailyUsageSnapshot.load(date.toString())
  if (dailyUsageSnapshot === null) {
    dailyUsageSnapshot = new DailyUsageSnapshot(date.toString())
    dailyUsageSnapshot.protocol = getProtocol().id
    dailyUsageSnapshot.date = date
    dailyUsageSnapshot.tvlUSD = ZERO_BIG_DECIMAL
    dailyUsageSnapshot.txCount = ZERO
    dailyUsageSnapshot.activeUsersCount = ZERO
    dailyUsageSnapshot.activeUsers = []
    dailyUsageSnapshot.save()
  }

  return dailyUsageSnapshot
}

export function updateActiveUniqueUserCount(event: ethereum.Event, address: Address) : void {
  let hourlyUsageSnapshot = getHourlyUsageSnapshot(event)
  if (address != ZERO_ADDRESS && !hourlyUsageSnapshot.activeUsers.includes(address.toHexString())) {
    let hourlyActiveUsers = hourlyUsageSnapshot.activeUsers
    hourlyActiveUsers.push(address.toHexString())
    hourlyUsageSnapshot.activeUsers = hourlyActiveUsers
    hourlyUsageSnapshot.activeUsersCount = hourlyUsageSnapshot.activeUsersCount.plus(ONE)
    hourlyUsageSnapshot.save()
  }

  let dailyUsageSnapshot = getDailyUsageSnapshot(event)
  if (address != ZERO_ADDRESS && !dailyUsageSnapshot.activeUsers.includes(address.toHexString())) {
    let dailyActiveUsers = dailyUsageSnapshot.activeUsers
    dailyActiveUsers.push(address.toHexString())
    dailyUsageSnapshot.activeUsers = dailyActiveUsers
    dailyUsageSnapshot.activeUsersCount = dailyUsageSnapshot.activeUsersCount.plus(ONE)
    dailyUsageSnapshot.save()
  }
}

export function updateTransactionCount(event: ethereum.Event) : void {
  let hourlyUsageSnapshot = getHourlyUsageSnapshot(event)
  hourlyUsageSnapshot.txCount = hourlyUsageSnapshot.txCount.plus(ONE)
  hourlyUsageSnapshot.save()

  let dailyUsageSnapshot = getDailyUsageSnapshot(event)
  dailyUsageSnapshot.txCount = dailyUsageSnapshot.txCount.plus(ONE)
  dailyUsageSnapshot.save()
}

export function updateTotalValueLockedUSD(event: ethereum.Event, tvlAmout: BigDecimal) : void {
  if(tvlAmout !== ZERO_BIG_DECIMAL) {
    let protocol = getProtocol()
    protocol.tvlUSD = protocol.tvlUSD.plus(tvlAmout)
    protocol.save()
    let hourlyUsageSnapshot = getHourlyUsageSnapshot(event)
    hourlyUsageSnapshot.tvlUSD = hourlyUsageSnapshot.tvlUSD.plus(tvlAmout.times(getEthUsdPricePairInfo(event)))
    hourlyUsageSnapshot.save()
    let dailyUsageSnapshot = getDailyUsageSnapshot(event)
    dailyUsageSnapshot.tvlUSD = dailyUsageSnapshot.tvlUSD.plus(tvlAmout)
    dailyUsageSnapshot.save()
  }
}

export function getEthUsdPricePairInfo(event: ethereum.Event) : BigDecimal {
  let usdPrice = BigDecimal.fromString("1214.71") //Tempoarary hardcoded ETH / USD price
  /*
   * Note:
   *   The no of decimals for ETH / USD pair is always 8. Ref: https://ethereum.stackexchange.com/questions/90552/does-chainlink-decimal-change-over-time/90602#90602
   * 
   * Flow with only On-Chain data:
   *   1) Maintain nextRound, previousRound in each NewRound entity. We will be making a doubly linked list by storing refs for prev and next
   *   2) Maintain the global metric on rounds info in RoundsInfo entity.
   *   3) In RoundsInfo, with currentRound and initialRound, perform binary search by ignoring invalid roundIDs (Can use certain predefined delta to check and come up with a valid round).
   *   4) At the end of our binary search, we will be having our proper round for our timestamp.
   *
   * Flow with External Oracle and On-Chain validation: 
   *   1) Perform API request to external Oracle and obtain answer round, prev round and next round.
   *   2) Validate external Oracle data with on-chain data by using below steps:
   *   3) Ensure that the round order is proper by confirming:
   *        a) Confirm previous.timeStamp < searchTimestamp
   *        b) Confirm next.timeStamp > searchTimestamp
   *   4) There could be gaps in roundID when there is a phase change. Ensure that rounds are not missing by checking for rounds in between:
   *        a) If the difference in roundID between answer round and previous round is more than 1, then iterate through all possible roundID values and ensure that there are no valid round in between.
   *        a) If the difference in roundID between answer round and next round is more than 1, then iterate through all possible roundID values and ensure that there are no valid round in between.
   *   5) If all the above conditions are satisfied, we have the proper round for our timestamp.
   */
  return usdPrice
}