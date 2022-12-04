import * as constants from "./constants";
import { Address } from "@graphprotocol/graph-ts";
import { PriceInfo } from "./PriceInfo";
import { ChainLinkContract } from "../generated/Lido/ChainLinkContract";

export function getChainLinkContract(): ChainLinkContract {
  return ChainLinkContract.bind(constants.CHAIN_LINK_CONTRACT_ADDRESS);
}

export function getTokenPriceFromChainLink(tokenAddr: Address): PriceInfo {
  const chainLinkContract = getChainLinkContract();

  if (!chainLinkContract) {
    return new PriceInfo();
  }

  let result = chainLinkContract.try_latestRoundData(tokenAddr, constants.CHAIN_LINK_USD_ADDRESS);

  if (!result.reverted) {
    let decimals = chainLinkContract.try_decimals(tokenAddr, constants.CHAIN_LINK_USD_ADDRESS);

    if (decimals.reverted) {
      new PriceInfo();
    }

    return PriceInfo.initialize(result.value.value1.toBigDecimal(), decimals.value);
  }

  return new PriceInfo();
}
