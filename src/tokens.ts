import { Address, BigInt } from "@graphprotocol/graph-ts";
import { getUsdPricePerToken } from "./pricing";
import {
  ZERO_BIG_DECIMAL,
  ETH_ADDRESS,
  ETH_NAME,
  ETH_SYMBOL,
} from "./constants";
import { Lido } from "../generated/Lido/Lido";
import { Token } from "../generated/schema";

export function getOrCreateToken(tokenAddress: Address, blockNumber: BigInt): Token {
  const tokenId = tokenAddress.toHexString();
  let token = Token.load(tokenId);

  if (!token) {
    token = new Token(tokenId);

    if (tokenAddress == ETH_ADDRESS) {
      token.name = ETH_NAME;
      token.symbol = ETH_SYMBOL;
      token.decimals = 18;
    } else {
      token.name = fetchTokenName(tokenAddress);
      token.symbol = fetchTokenSymbol(tokenAddress);
      token.decimals = fetchTokenDecimals(tokenAddress) as i32;
    }
  }

const price = getUsdPricePerToken(tokenAddress);
  if (price.reverted) {
    token.lastPriceUSD = ZERO_BIG_DECIMAL;
  } else {
    token.lastPriceUSD = price.usdPrice.div(price.decimalsBaseTen);
  }
  token.lastPriceBlockNumber = blockNumber;
  token.save();

  return token;
}

function fetchTokenName(tokenAddress: Address): string {
  const tokenContract = Lido.bind(tokenAddress);
  const call = tokenContract.try_name();
  if (call.reverted) {
    return tokenAddress.toHexString();
  } else {
    return call.value;
  }
}

function fetchTokenSymbol(tokenAddress: Address): string {
  const tokenContract = Lido.bind(tokenAddress);
  const call = tokenContract.try_symbol();
  if (call.reverted) {
    return " ";
  } else {
    return call.value;
  }
}

function fetchTokenDecimals(tokenAddress: Address): number {
  const tokenContract = Lido.bind(tokenAddress);
  const call = tokenContract.try_decimals();
  if (call.reverted) {
    return 0;
  } else {
    return call.value;
  }
}
