import { Address, BigDecimal, log } from "@graphprotocol/graph-ts"
import { getTokenPriceFromChainLink } from "./ChainLinkFeeds"
import { ZERO_ADDRESS, ZERO_BIG_DECIMAL } from "./constants"
import { PriceInfo } from "./PriceInfo"
import { getTokenPriceFromYearnLens } from "./YearnLensFeeds"

export function getUsdPricePerToken(tokenAddress: Address): PriceInfo {
    if (tokenAddress == ZERO_ADDRESS) {
      return new PriceInfo()
    }

    log.info("[FetchingPrice]Fetching price for tokenAddress: {}", [tokenAddress.toHexString()])

    let yearnLensPrice = getTokenPriceFromYearnLens(tokenAddress)
    
    if (!yearnLensPrice.reverted) {
      log.warning("[YearnLens] tokenAddress: {}, Price: {}", [
        tokenAddress.toHexString(),
        yearnLensPrice.usdPrice.div(yearnLensPrice.decimalsBaseTen).toString(),
      ])
      return yearnLensPrice
    }
    log.warning("[FetchingPrice] Yearn Lens price fetch failed for tokenAddress: {}", [tokenAddress.toHexString()])

    let chainLinkPrice = getTokenPriceFromChainLink(tokenAddress)
    if (!chainLinkPrice.reverted) {
      log.warning("[ChainLinkFeed] tokenAddress: {}, Price: {}", [
        tokenAddress.toHexString(),
        chainLinkPrice.usdPrice.div(chainLinkPrice.decimalsBaseTen).toString(),
      ])
      return chainLinkPrice
    }
  
    log.warning("[FetchingPrice] Failed to Fetch Price, tokenAddress: {}", [tokenAddress.toHexString()])
  
    return new PriceInfo()
  }
  
  export function getUsdPrice(tokenAddress: Address, amount: BigDecimal): BigDecimal {
    let tokenPrice = getUsdPricePerToken(tokenAddress)
  
    if (!tokenPrice.reverted) {
      return tokenPrice.usdPrice.times(amount).div(tokenPrice.decimalsBaseTen)
    }
  
    return ZERO_BIG_DECIMAL
  }