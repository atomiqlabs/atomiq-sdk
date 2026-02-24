import {CoinType, CtorCoinTypes, IPriceProvider} from "../abstract/IPriceProvider";
import {MultiChain} from "../../swapper/Swapper";
import {CustomPriceFunction} from "../../types/CustomPriceFunction";

/**
 * Price provider using custom pricing function
 *
 * @category Pricing
 */
export class CustomPriceProvider<T extends MultiChain> extends IPriceProvider<T> {

    readonly getUsdPriceFn: CustomPriceFunction;

    /**
     * @param coinsMap Mapping of token tickers to token addresses
     * @param getUsdPriceFn Pricing function, used to retrieve USD prices of the tokens
     */
    constructor(coinsMap: CtorCoinTypes<T>, getUsdPriceFn: CustomPriceFunction) {
        super(coinsMap);
        this.getUsdPriceFn = getUsdPriceFn;
    }

    /**
     * @inheritDoc
     */
    protected async fetchPrice(token: CoinType, abortSignal?: AbortSignal): Promise<bigint> {
        const [btcPrice, tokenPrice] = await this.getUsdPriceFn(["BTC",token.coinId], abortSignal);
        const priceInBtc = tokenPrice / btcPrice;
        return BigInt(Math.floor(priceInBtc*100_000_000*1_000_000));
    }

    /**
     * @inheritDoc
     */
    protected async fetchUsdPrice(abortSignal?: AbortSignal): Promise<number> {
        const [btcPrice] = await this.getUsdPriceFn(["BTC"], abortSignal);
        return btcPrice / 100_000_000;
    }

}
