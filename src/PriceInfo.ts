import * as constants from "./constants"
import { BigDecimal, BigInt } from "@graphprotocol/graph-ts"

export class Wrapped<T> {
  inner: T

  constructor(inner: T) {
    this.inner = inner
  }
}

export class PriceInfo {
  // `null` indicates a reverted call.
  private _usdPrice: Wrapped<BigDecimal>
  private _decimals: Wrapped<i32>

  constructor() {
    this._usdPrice = new Wrapped(constants.ZERO_BIG_DECIMAL)
    this._decimals = new Wrapped(constants.ZERO.toI32() as u8)
  }

  static initialize(
    _usdPrice: BigDecimal,
    _decimals: i32 = 0
  ): PriceInfo {
    const result = new PriceInfo()
    result._usdPrice = new Wrapped(_usdPrice)
    result._decimals = new Wrapped(_decimals as u8)

    return result
  }

  get reverted(): bool {
    return this._usdPrice.inner == constants.ZERO_BIG_DECIMAL
  }

  get usdPrice(): BigDecimal {
    return changetype<Wrapped<BigDecimal>>(this._usdPrice).inner
  }

  get decimals(): i32 {
    return changetype<Wrapped<i32>>(this._decimals).inner
  }

  get decimalsBaseTen(): BigDecimal {
    return BigInt.fromI32(10).pow(this.decimals as u8).toBigDecimal()
  }
}
