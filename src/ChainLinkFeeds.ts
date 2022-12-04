import * as constants from "./constants"
import { Address, log } from "@graphprotocol/graph-ts"
import { PriceInfo } from "./PriceInfo"
import { ChainLinkContract } from "../generated/Lido/ChainLinkContract"

export function getChainLinkContract(): ChainLinkContract {
  return ChainLinkContract.bind(constants.CHAIN_LINK_CONTRACT_ADDRESS)
}

export function getTokenPriceFromChainLink(tokenAddress: Address): PriceInfo {
  const chainLinkContract = getChainLinkContract()

  if (!chainLinkContract) {
    return new PriceInfo()
  }

  let result = chainLinkContract.try_latestRoundData(tokenAddress, constants.CHAIN_LINK_USD_ADDRESS)

  if (!result.reverted) {
    log.info("[ChainLinkFeed] Contract call result for tokenAddress({}) : Amount: {}, RoundID: {}, StartedAt: {}, UpdatedAt: {}, AnsweredInRound: {}", [tokenAddress.toHexString(), result.value.value1.toString(), result.value.value0.toString(), result.value.value2.toString(), result.value.value3.toString(), result.value.value4.toString()])

    let decimals = chainLinkContract.try_decimals(tokenAddress, constants.CHAIN_LINK_USD_ADDRESS)

    if (decimals.reverted) {
      new PriceInfo()
    }

    return PriceInfo.initialize(result.value.value1.toBigDecimal(), decimals.value)
  }

  return new PriceInfo()
}
