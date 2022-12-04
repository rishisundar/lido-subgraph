import { Address, log } from "@graphprotocol/graph-ts";
import { getTokenPriceFromChainLink } from "./ChainLinkFeeds";
import { ZERO_ADDRESS, ZERO_BIG_DECIMAL } from "./constants";
import { PriceInfo } from "./PriceInfo";

export function getUsdPricePerToken(tokenAddr: Address): PriceInfo {
    if (tokenAddr == ZERO_ADDRESS) {
      return new PriceInfo();
    }
    let network = "mainnet"
    let chainLinkPrice = getTokenPriceFromChainLink(tokenAddr);
    if (!chainLinkPrice.reverted) {
      log.warning("[ChainLinkFeed] tokenAddress: {}, Price: {}", [
        tokenAddr.toHexString(),
        chainLinkPrice.usdPrice.div(chainLinkPrice.decimalsBaseTen).toString(),
      ]);
      return chainLinkPrice;
    }
  
    log.warning("Failed to Fetch Price, tokenAddr: {}", [
      tokenAddr.toHexString(),
    ]);
  
    return new PriceInfo();
  }
  
  export function getUsdPrice(tokenAddr: Address, amount: BigDecimal): BigDecimal {
    let tokenPrice = getUsdPricePerToken(tokenAddr);
  
    if (!tokenPrice.reverted) {
      return tokenPrice.usdPrice.times(amount).div(tokenPrice.decimalsBaseTen);
    }
  
    return ZERO_BIG_DECIMAL;
  }