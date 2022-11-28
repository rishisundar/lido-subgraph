import {
  NewRound as NewRoundEvent,
} from "../generated/ChainlinkPriceFeed/ChainlinkPriceFeed"
import {
  NewRound,
  RoundsInfo,
} from "../generated/schema"


export function getRoundsInfo(): RoundsInfo {
  let roundInfo = RoundsInfo.load('')
  if (roundInfo === null) {
    roundInfo = new RoundsInfo('')
    roundInfo.save()
  }
  return roundInfo
}

export function handleNewRound(event: NewRoundEvent): void {
  let newRound = new NewRound(event.params.roundId.toString()) //RoundID here is computed from phaseID and aggregator round ID and won't be duplicate.
  newRound.roundId = event.params.roundId
  newRound.startedBy = event.params.startedBy
  newRound.startedAt = event.params.startedAt
  newRound.blockNumber = event.block.number
  newRound.blockTimestamp = event.block.timestamp
  newRound.transactionHash = event.transaction.hash
  newRound.save()
  let roundsInfo = getRoundsInfo()
  if(!!roundsInfo.currentRound) {
    roundsInfo.initialRound = newRound.id
  }
  roundsInfo.currentRound = newRound.id
  roundsInfo.save()
}