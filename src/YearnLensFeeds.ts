import * as constants from "./constants"
import { Address, log } from "@graphprotocol/graph-ts"
import { PriceInfo } from "./PriceInfo"
import { YearnLensContract } from "../generated/Lido/YearnLensContract"
import { bigIntToBigDecimal } from "./utils"

export function getYearnLensContract(): YearnLensContract {
  return YearnLensContract.bind(constants.YEARN_LENS_CONTRACT_ADDRESS)
}

export function getTokenPriceFromYearnLens(tokenAddress: Address): PriceInfo {
  const YearnLensContract = getYearnLensContract()

  if (!YearnLensContract) {
    return new PriceInfo()
  }

  let result = YearnLensContract.try_getPriceUsdcRecommended(tokenAddress)

  if (!result.reverted) {
    log.info("[YearnLens] Contract call result for tokenAddress({}) : Amount: {}", [tokenAddress.toHexString(), result.value.toString()])

    return PriceInfo.initialize(bigIntToBigDecimal(result.value, constants.ZERO_I32), constants.ZERO_I32)
  }

  return new PriceInfo()
}
