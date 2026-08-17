import { HttpPriceProvider } from "./HttpPriceProvider.js";
export class ExchangePriceProvider extends HttpPriceProvider {
    /**
     * @inheritDoc
     */
    async fetchPrice(token, abortSignal) {
        const pairs = token.coinId.split(";");
        const prices = await Promise.all(pairs.map(pair => {
            let invert = pair.startsWith("!");
            if (invert)
                pair = pair.substring(1);
            return this.fetchPair(pair, abortSignal).then(value => invert ? 1 / value : value);
        }));
        const price = prices.reduce((previousValue, currentValue) => previousValue * currentValue, 1);
        return BigInt(Math.floor(price * 100000000000000));
    }
}
