import { Address, BigDecimal, log } from "@graphprotocol/graph-ts"
import { getTokenPriceFromChainLink } from "./ChainLinkFeeds"
import { ZERO_ADDRESS, ZERO_BIG_DECIMAL } from "./constants"
import { PriceInfo } from "./PriceInfo"

export function getUsdPricePerToken(tokenAddress: Address): PriceInfo {
    if (tokenAddress == ZERO_ADDRESS) {
      return new PriceInfo()
    }
    let chainLinkPrice = getTokenPriceFromChainLink(tokenAddress)
    if (!chainLinkPrice.reverted) {
      log.warning("[ChainLinkFeed] tokenAddress: {}, Price: {}", [
        tokenAddress.toHexString(),
        chainLinkPrice.usdPrice.div(chainLinkPrice.decimalsBaseTen).toString(),
      ])
      return chainLinkPrice
    }
  
    log.warning("Failed to Fetch Price, tokenAddress: {}", [
      tokenAddress.toHexString(),
    ])
  
    return new PriceInfo()
  }
  
  export function getUsdPrice(tokenAddress: Address, amount: BigDecimal): BigDecimal {
    let tokenPrice = getUsdPricePerToken(tokenAddress)
  
    if (!tokenPrice.reverted) {
      return tokenPrice.usdPrice.times(amount).div(tokenPrice.decimalsBaseTen)
    }
  
    return ZERO_BIG_DECIMAL
  }