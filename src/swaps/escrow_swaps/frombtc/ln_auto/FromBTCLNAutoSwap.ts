import {decode as bolt11Decode} from "@atomiqlabs/bolt11";
import {SwapType} from "../../../../enums/SwapType";
import {
    ChainSwapType,
    ChainType,
    isAbstractSigner,
    SwapClaimWitnessMessage,
    SwapCommitState,
    SwapCommitStateType,
    SwapData,
} from "@atomiqlabs/base";
import {Buffer} from "buffer";
import {LNURL} from "../../../../lnurl/LNURL";
import {UserError} from "../../../../errors/UserError";
import {
    IntermediaryAPI,
    InvoiceStatusResponse,
    InvoiceStatusResponseCodes
} from "../../../../intermediaries/apis/IntermediaryAPI";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {extendAbortController, toBigInt} from "../../../../utils/Utils";
import {Fee} from "../../../../types/fees/Fee";
import {IAddressSwap} from "../../../IAddressSwap";
import {FromBTCLNAutoDefinition, FromBTCLNAutoWrapper} from "./FromBTCLNAutoWrapper";
import {ISwapWithGasDrop} from "../../../ISwapWithGasDrop";
import {MinimalLightningNetworkWalletInterface} from "../../../../types/wallets/MinimalLightningNetworkWalletInterface";
import {IClaimableSwap} from "../../../IClaimableSwap";
import {IEscrowSwap, IEscrowSwapInit, isIEscrowSwapInit} from "../../IEscrowSwap";
import {FeeType} from "../../../../enums/FeeType";
import {ppmToPercentage} from "../../../../types/fees/PercentagePPM";
import {TokenAmount, toTokenAmount} from "../../../../types/TokenAmount";
import {BitcoinTokens, BtcToken, SCToken} from "../../../../types/Token";
import {getLogger, LoggerType} from "../../../../utils/Logger";
import {timeoutPromise} from "../../../../utils/TimeoutUtils";
import {isLNURLWithdraw, LNURLWithdraw, LNURLWithdrawParamsWithUrl} from "../../../../types/lnurl/LNURLWithdraw";
import {
    deserializePriceInfoType,
    isPriceInfoType,
    PriceInfoType,
    serializePriceInfoType
} from "../../../../types/PriceInfoType";
import {sha256} from "@noble/hashes/sha2";

/**
 * State enum for FromBTCLNAuto swaps
 * @category Swaps/Lightning → Smart chain
 */
export enum FromBTCLNAutoSwapState {
    FAILED = -4,
    QUOTE_EXPIRED = -3,
    QUOTE_SOFT_EXPIRED = -2,
    EXPIRED = -1,
    PR_CREATED = 0,
    PR_PAID = 1,
    CLAIM_COMMITED = 2,
    CLAIM_CLAIMED = 3
}

export type FromBTCLNAutoSwapInit<T extends SwapData> = IEscrowSwapInit<T> & {
    pr?: string,
    secret?: string,
    initialSwapData: T,

    btcAmountSwap?: bigint,
    btcAmountGas?: bigint,

    gasSwapFeeBtc: bigint,
    gasSwapFee: bigint,
    gasPricingInfo?: PriceInfoType,

    lnurl?: string,
    lnurlK1?: string,
    lnurlCallback?: string
};

export function isFromBTCLNAutoSwapInit<T extends SwapData>(obj: any): obj is FromBTCLNAutoSwapInit<T> {
    return (obj.pr==null || typeof obj.pr==="string") &&
        (obj.secret==null || typeof obj.secret==="string") &&
        (obj.btcAmountSwap==null || typeof obj.btcAmountSwap==="bigint") &&
        (obj.btcAmountGas==null || typeof obj.btcAmountGas==="bigint") &&
        typeof obj.gasSwapFeeBtc==="bigint" &&
        typeof obj.gasSwapFee==="bigint" &&
        (obj.gasPricingInfo==null || isPriceInfoType(obj.gasPricingInfo)) &&
        (obj.lnurl==null || typeof(obj.lnurl)==="string") &&
        (obj.lnurlK1==null || typeof(obj.lnurlK1)==="string") &&
        (obj.lnurlCallback==null || typeof(obj.lnurlCallback)==="string") &&
        isIEscrowSwapInit(obj);
}

/**
 * New escrow based (HTLC) swaps for Bitcoin Lightning -> Smart chain swaps not requiring manual settlement on
 *  the destination by the user, and instead letting the LP initiate the escrow. Permissionless watchtower network
 *  handles the claiming of HTLC, with the swap secret broadcasted over Nostr. Also adds a possibility for the user
 *  to receive a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Lightning → Smart chain
 */
export class FromBTCLNAutoSwap<T extends ChainType = ChainType>
    extends IEscrowSwap<T, FromBTCLNAutoDefinition<T>>
    implements IAddressSwap, ISwapWithGasDrop<T>, IClaimableSwap<T, FromBTCLNAutoDefinition<T>, FromBTCLNAutoSwapState> {

    protected readonly TYPE: SwapType.FROM_BTCLN_AUTO = SwapType.FROM_BTCLN_AUTO;
    /**
     * @internal
     */
    protected readonly logger: LoggerType;
    /**
     * @internal
     */
    protected readonly inputToken: BtcToken<true> = BitcoinTokens.BTCLN;

    private readonly lnurlFailSignal: AbortController = new AbortController();
    private readonly usesClaimHashAsId: boolean;
    private readonly initialSwapData: T["Data"];

    private readonly btcAmountSwap?: bigint;
    private readonly btcAmountGas?: bigint;

    private readonly gasSwapFeeBtc: bigint;
    private readonly gasSwapFee: bigint;

    private readonly gasPricingInfo?: PriceInfoType;

    /**
     * In case the swap is recovered from on-chain data, the pr saved here is just a payment hash,
     *  as it is impossible to retrieve the actual lightning network invoice paid purely from on-chain
     *  data
     * @private
     */
    private pr?: string;
    private secret?: string;

    private lnurl?: string;
    private lnurlK1?: string;
    private lnurlCallback?: string;
    private prPosted?: boolean = false;

    private broadcastTickCounter: number = 0;

    /**
     * Sets the LNURL data for the swap
     *
     * @internal
     */
    _setLNURLData(lnurl: string, lnurlK1: string, lnurlCallback: string) {
        this.lnurl = lnurl;
        this.lnurlK1 = lnurlK1;
        this.lnurlCallback = lnurlCallback;
    }

    constructor(wrapper: FromBTCLNAutoWrapper<T>, init: FromBTCLNAutoSwapInit<T["Data"]>);
    constructor(wrapper: FromBTCLNAutoWrapper<T>, obj: any);
    constructor(
        wrapper: FromBTCLNAutoWrapper<T>,
        initOrObject: FromBTCLNAutoSwapInit<T["Data"]> | any
    ) {
        if(isFromBTCLNAutoSwapInit(initOrObject) && initOrObject.url!=null) initOrObject.url += "/frombtcln_auto";
        super(wrapper, initOrObject);
        if(isFromBTCLNAutoSwapInit(initOrObject)) {
            this._state = FromBTCLNAutoSwapState.PR_CREATED;
            this.pr = initOrObject.pr;
            this.secret = initOrObject.secret;
            this.initialSwapData = initOrObject.initialSwapData;
            this.btcAmountSwap = initOrObject.btcAmountSwap;
            this.btcAmountGas = initOrObject.btcAmountGas;
            this.gasSwapFeeBtc = initOrObject.gasSwapFeeBtc;
            this.gasSwapFee = initOrObject.gasSwapFee;
            this.gasPricingInfo = initOrObject.gasPricingInfo;
            this.lnurl = initOrObject.lnurl;
            this.lnurlK1 = initOrObject.lnurlK1;
            this.lnurlCallback = initOrObject.lnurlCallback;
            this.usesClaimHashAsId = true;
        } else {
            this.pr = initOrObject.pr;
            this.secret = initOrObject.secret;

            if(initOrObject.initialSwapData==null) {
                this.initialSwapData = this._data!;
            } else {
                this.initialSwapData = SwapData.deserialize<T["Data"]>(initOrObject.initialSwapData);
            }

            this.btcAmountSwap = toBigInt(initOrObject.btcAmountSwap);
            this.btcAmountGas = toBigInt(initOrObject.btcAmountGas);
            this.gasSwapFeeBtc = toBigInt(initOrObject.gasSwapFeeBtc);
            this.gasSwapFee = toBigInt(initOrObject.gasSwapFee);
            this.gasPricingInfo = deserializePriceInfoType(initOrObject.gasPricingInfo);

            this._commitTxId = initOrObject.commitTxId;
            this._claimTxId = initOrObject.claimTxId;

            this.lnurl = initOrObject.lnurl;
            this.lnurlK1 = initOrObject.lnurlK1;
            this.lnurlCallback = initOrObject.lnurlCallback;
            this.prPosted = initOrObject.prPosted;
            this.usesClaimHashAsId = initOrObject.usesClaimHashAsId ?? false;
        }
        this.tryRecomputeSwapPrice();
        this.logger = getLogger("FromBTCLNAuto("+this.getIdentifierHashString()+"): ");
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected getSwapData(): T["Data"] {
        return this._data ?? this.initialSwapData;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected upgradeVersion() { /*NOOP*/ }

    /**
     * @inheritDoc
     * @internal
     */
    protected tryRecomputeSwapPrice() {
        if(this.pricingInfo==null || this.btcAmountSwap==null) return;
        if(this.pricingInfo.swapPriceUSatPerToken==null) {
            const priceUsdPerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
            this.pricingInfo = this.wrapper._prices.recomputePriceInfoReceive(
                this.chainIdentifier,
                this.btcAmountSwap,
                this.pricingInfo.satsBaseFee,
                this.pricingInfo.feePPM,
                this.getOutputAmountWithoutFee(),
                this.getSwapData().getToken()
            );
            this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
        }
    }


    //////////////////////////////
    //// Pricing

    /**
     * @inheritDoc
     */
    async refreshPriceData(): Promise<void> {
        if(this.pricingInfo==null || this.btcAmountSwap==null) return;
        const usdPricePerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
        this.pricingInfo = await this.wrapper._prices.isValidAmountReceive(
            this.chainIdentifier,
            this.btcAmountSwap,
            this.pricingInfo.satsBaseFee,
            this.pricingInfo.feePPM,
            this.getOutputAmountWithoutFee(),
            this.getSwapData().getToken()
        );
        this.pricingInfo.realPriceUsdPerBitcoin = usdPricePerBtc;
    }


    //////////////////////////////
    //// Getters & utils

    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash(): string | null {
        //Use claim hash in case the data is not yet known
        return this._data == null ? this.initialSwapData?.getClaimHash() : this._data?.getEscrowHash();
    }

    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string {
        return this.getSwapData().getClaimer();
    }

    /**
     * @inheritDoc
     */
    getId(): string {
        return this.getIdentifierHashString();
    }

    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null {
        return this._getInitiator();
    }

    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null {
        return this._claimTxId ?? null;
    }

    /**
     * @inheritDoc
     */
    requiresAction(): boolean {
        return this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected getIdentifierHashString(): string {
        const id: string = this.usesClaimHashAsId
            ? this.getClaimHash()
            : this.getPaymentHash()!.toString("hex");
        if(this._randomNonce==null) return id;
        return id + this._randomNonce;
    }

    /**
     * Returns the payment hash of the swap and lightning network invoice, or `null` if not known (i.e. if
     *  the swap was recovered from on-chain data, the payment hash might not be known)
     *
     * @internal
     */
    protected getPaymentHash(): Buffer | null {
        if(this.pr==null) return null;
        if(this.pr.toLowerCase().startsWith("ln")) {
            const parsed = bolt11Decode(this.pr);
            if(parsed.tagsObject.payment_hash==null) throw new Error("Swap invoice has no payment hash field!");
            return Buffer.from(parsed.tagsObject.payment_hash, "hex");
        }
        return Buffer.from(this.pr, "hex");
    }

    /**
     * @inheritDoc
     */
    getInputAddress(): string | null {
        return this.lnurl ?? this.pr ?? null;
    }

    /**
     * @inheritDoc
     */
    getInputTxId(): string | null {
        const paymentHash = this.getPaymentHash();
        if(paymentHash==null) return null;
        return paymentHash.toString("hex");
    }

    /**
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap
     */
    getAddress(): string {
        return this.pr ?? "";
    }

    /**
     * @inheritDoc
     */
    getHyperlink(): string {
        return this.pr==null ? "" : "lightning:"+this.pr.toUpperCase();
    }

    /**
     * Returns the timeout time (in UNIX milliseconds) when the swap will definitelly be considered as expired
     *  if the LP doesn't make it expired sooner
     */
    getDefinitiveExpiryTime(): number {
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln")) return 0;
        const decoded = bolt11Decode(this.pr);
        if(decoded.tagsObject.min_final_cltv_expiry==null) throw new Error("Swap invoice doesn't contain final ctlv delta field!");
        if(decoded.timeExpireDate==null) throw new Error("Swap invoice doesn't contain expiry date field!");
        const finalCltvExpiryDelta = decoded.tagsObject.min_final_cltv_expiry ?? 144;
        const finalCltvExpiryDelay = finalCltvExpiryDelta * this.wrapper._options.bitcoinBlocktime * this.wrapper._options.safetyFactor;
        return (decoded.timeExpireDate + finalCltvExpiryDelay)*1000;
    }

    /**
     * Returns timeout time (in UNIX milliseconds) when the swap htlc will expire
     */
    getHtlcTimeoutTime(): number | null {
        return this._data==null ? null : Number(this.wrapper._getHtlcTimeout(this._data))*1000;
    }

    /**
     * @inheritDoc
     */
    isFinished(): boolean {
        return this._state===FromBTCLNAutoSwapState.CLAIM_CLAIMED || this._state===FromBTCLNAutoSwapState.QUOTE_EXPIRED || this._state===FromBTCLNAutoSwapState.FAILED;
    }

    /**
     * @inheritDoc
     */
    isClaimable(): boolean {
        return this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED;
    }

    /**
     * @inheritDoc
     */
    isSuccessful(): boolean {
        return this._state===FromBTCLNAutoSwapState.CLAIM_CLAIMED;
    }

    /**
     * @inheritDoc
     */
    isFailed(): boolean {
        return this._state===FromBTCLNAutoSwapState.FAILED || this._state===FromBTCLNAutoSwapState.EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isQuoteExpired(): boolean {
        return this._state===FromBTCLNAutoSwapState.QUOTE_EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isQuoteSoftExpired(): boolean {
        return this._state===FromBTCLNAutoSwapState.QUOTE_EXPIRED;
    }

    /**
     * @inheritDoc
     */
    _verifyQuoteDefinitelyExpired(): Promise<boolean> {
        return Promise.resolve(this.getDefinitiveExpiryTime()<Date.now());
    }

    /**
     * @inheritDoc
     */
    _verifyQuoteValid(): Promise<boolean> {
        return Promise.resolve(this.getQuoteExpiry()>Date.now());
    }


    //////////////////////////////
    //// Amounts & fees

    /**
     * Returns the satoshi amount of the lightning network invoice, or `null` if the lightning network
     *  invoice is not known (i.e. when the swap was recovered from on-chain data, the paid invoice
     *  cannot be recovered because it is purely off-chain)
     *
     * @internal
     */
    protected getLightningInvoiceSats(): bigint | null {
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln")) return null;

        const parsed = bolt11Decode(this.pr);
        if(parsed.millisatoshis==null) throw new Error("Swap invoice doesn't contain msat amount field!");
        return (BigInt(parsed.millisatoshis) + 999n) / 1000n;
    }

    /**
     * Returns the watchtower fee paid in BTC satoshis, or null if known (i.e. if the swap was recovered from
     *  on-chain data)
     *
     * @protected
     */
    protected getWatchtowerFeeAmountBtc(): bigint | null {
        if(this.btcAmountGas==null) return null;
        return (this.btcAmountGas - this.gasSwapFeeBtc) * this.getSwapData().getClaimerBounty() / this.getSwapData().getTotalDeposit();
    }

    /**
     * Returns the input amount for the actual swap (excluding the input amount used to cover the "gas drop"
     *  part of the swap), excluding fees
     *
     * @internal
     */
    protected getInputSwapAmountWithoutFee(): bigint | null {
        if(this.btcAmountSwap==null) return null;
        return this.btcAmountSwap - this.swapFeeBtc;
    }

    /**
     * Returns the input amount purely for the "gas drop" part of the swap (this much BTC in sats will be
     *  swapped into the native gas token on the destination chain), excluding fees
     *
     * @internal
     */
    protected getInputGasAmountWithoutFee(): bigint | null {
        if(this.btcAmountGas==null) return null;
        return this.btcAmountGas - this.gasSwapFeeBtc;
    }

    /**
     * Get total btc amount in sats on the input, excluding the swap fee and watchtower fee
     *
     * @internal
     */
    protected getInputAmountWithoutFee(): bigint | null {
        if(this.btcAmountGas==null || this.btcAmountSwap) return null;
        return this.getInputSwapAmountWithoutFee()! + this.getInputGasAmountWithoutFee()! - this.getWatchtowerFeeAmountBtc()!;
    }

    /**
     * Returns the "would be" output amount if the swap charged no swap fee
     *
     * @internal
     */
    protected getOutputAmountWithoutFee(): bigint {
        return this.getSwapData().getAmount() + this.swapFee;
    }

    /**
     * @inheritDoc
     */
    getInputToken(): BtcToken<true> {
        return BitcoinTokens.BTCLN;
    }

    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<T["ChainId"], BtcToken<true>> {
        return toTokenAmount(this.getLightningInvoiceSats(), this.inputToken, this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken<true>> {
        return toTokenAmount(this.getInputAmountWithoutFee(), this.inputToken, this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    getOutputToken(): SCToken<T["ChainId"]> {
        return this.wrapper._tokens[this.getSwapData().getToken()];
    }

    /**
     * @inheritDoc
     */
    getOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true> {
        return toTokenAmount(this.getSwapData().getAmount(), this.wrapper._tokens[this.getSwapData().getToken()], this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    getGasDropOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true> {
        return toTokenAmount(
            this.getSwapData().getSecurityDeposit() - this.getSwapData().getClaimerBounty(),
            this.wrapper._tokens[this.getSwapData().getDepositToken()], this.wrapper._prices, this.gasPricingInfo
        );
    }

    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>> {
        if(this.pricingInfo==null) throw new Error("No pricing info known, cannot estimate fee!");

        const outputToken = this.wrapper._tokens[this.getSwapData().getToken()];
        const gasSwapFeeInOutputToken = this.gasSwapFeeBtc
            * (10n ** BigInt(outputToken.decimals))
            * 1_000_000n
            / this.pricingInfo.swapPriceUSatPerToken;

        const feeWithoutBaseFee = this.gasSwapFeeBtc + this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const inputSats = this.getLightningInvoiceSats();
        const swapFeePPM = inputSats!=null
            ? feeWithoutBaseFee * 1000000n / (inputSats - this.swapFeeBtc - this.gasSwapFeeBtc)
            : 0n;

        const amountInSrcToken = toTokenAmount(this.swapFeeBtc + this.gasSwapFeeBtc, BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(this.swapFee + gasSwapFeeInOutputToken, outputToken, this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            usdValue: amountInSrcToken.usdValue,
            composition: {
                base: toTokenAmount(this.pricingInfo.satsBaseFee, BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo),
                percentage: ppmToPercentage(swapFeePPM)
            }
        };
    }

    /**
     * Returns the fee to be paid to watchtowers on the destination chain to automatically
     *  process and settle this swap without requiring any user interaction
     *
     * @internal
     */
    protected getWatchtowerFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>> {
        if(this.pricingInfo==null) throw new Error("No pricing info known, cannot estimate fee!");

        const btcWatchtowerFee = this.getWatchtowerFeeAmountBtc();
        const outputToken = this.wrapper._tokens[this.getSwapData().getToken()];
        const watchtowerFeeInOutputToken = btcWatchtowerFee==null ? 0n : btcWatchtowerFee
            * (10n ** BigInt(outputToken.decimals))
            * 1_000_000n
            / this.pricingInfo.swapPriceUSatPerToken;

        const amountInSrcToken = toTokenAmount(btcWatchtowerFee, BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(watchtowerFeeInOutputToken, outputToken, this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
        };
    }

    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>> {
        const swapFee = this.getSwapFee();
        const watchtowerFee = this.getWatchtowerFee();

        const amountInSrcToken = toTokenAmount(
          swapFee.amountInSrcToken.rawAmount + watchtowerFee.amountInSrcToken.rawAmount,
            BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo
        );
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(
              swapFee.amountInDstToken.rawAmount + watchtowerFee.amountInDstToken.rawAmount,
                this.wrapper._tokens[this.getSwapData().getToken()], this.wrapper._prices, this.pricingInfo
            ),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
        };
    }

    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [
        {type: FeeType.SWAP, fee: Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>},
        {type: FeeType.NETWORK_OUTPUT, fee: Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>}
    ] {
        return [
            {
                type: FeeType.SWAP,
                fee: this.getSwapFee()
            },
            {
                type: FeeType.NETWORK_OUTPUT,
                fee: this.getWatchtowerFee()
            }
        ];
    }

    private isValidSecretPreimage(secret: string) {
        const paymentHash = Buffer.from(sha256(Buffer.from(secret, "hex")));
        const claimHash = this.wrapper._contract.getHashForHtlc(paymentHash).toString("hex");
        return this.getSwapData().getClaimHash()===claimHash;
    }


    //////////////////////////////
    //// Execution

    /**
     * Executes the swap with the provided bitcoin lightning network wallet or LNURL
     *
     * @param walletOrLnurlWithdraw Bitcoin lightning wallet to use to pay the lightning network invoice, or an LNURL-withdraw
     *  link, wallet is not required and the LN invoice can be paid externally as well (just pass null or undefined here)
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     * @param secret A swap secret to broadcast to watchtowers, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @returns {boolean} Whether a swap was settled automatically by swap watchtowers or requires manual claim by the
     *  user, in case `false` is returned the user should call `swap.claim()` to settle the swap on the destination manually
     */
    async execute(
        walletOrLnurlWithdraw?: MinimalLightningNetworkWalletInterface | LNURLWithdraw | string | null | undefined,
        callbacks?: {
            onSourceTransactionReceived?: (sourceTxId: string) => void,
            onSwapSettled?: (destinationTxId: string) => void
        },
        options?: {
            abortSignal?: AbortSignal,
            lightningTxCheckIntervalSeconds?: number,
            maxWaitTillAutomaticSettlementSeconds?: number
        },
        secret?: string
    ): Promise<boolean> {
        if(this._state===FromBTCLNAutoSwapState.FAILED) throw new Error("Swap failed!");
        if(this._state===FromBTCLNAutoSwapState.EXPIRED) throw new Error("Swap HTLC expired!");
        if(this._state===FromBTCLNAutoSwapState.QUOTE_EXPIRED || this._state===FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) throw new Error("Swap quote expired!");
        if(this._state===FromBTCLNAutoSwapState.CLAIM_CLAIMED) throw new Error("Swap already settled!");

        let abortSignal = options?.abortSignal;

        if(this._state===FromBTCLNAutoSwapState.PR_CREATED) {
            if(walletOrLnurlWithdraw!=null && this.lnurl==null) {
                if(this.pr==null || !this.pr.toLowerCase().startsWith("ln"))
                    throw new Error("Input lightning network invoice not available, the swap was probably recovered!");

                if(typeof(walletOrLnurlWithdraw)==="string" || isLNURLWithdraw(walletOrLnurlWithdraw)) {
                    await this.settleWithLNURLWithdraw(walletOrLnurlWithdraw);
                } else {
                    const paymentPromise = walletOrLnurlWithdraw.payInvoice(this.pr);

                    const abortController = new AbortController();
                    paymentPromise.catch(e => abortController.abort(e));
                    if(options?.abortSignal!=null) options.abortSignal.addEventListener("abort", () => abortController.abort(options?.abortSignal?.reason));
                    abortSignal = abortController.signal;
                }
            }
        }

        if(this._state===FromBTCLNAutoSwapState.PR_CREATED || this._state===FromBTCLNAutoSwapState.PR_PAID) {
            const paymentSuccess = await this.waitForPayment(callbacks?.onSourceTransactionReceived, options?.lightningTxCheckIntervalSeconds, abortSignal);
            if (!paymentSuccess) throw new Error("Failed to receive lightning network payment");
        }

        if((this._state as FromBTCLNAutoSwapState)===FromBTCLNAutoSwapState.CLAIM_CLAIMED) return true;

        if(this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED) {
            if(this.secret==null && secret==null)
                throw new Error("Tried to wait till settlement, but no secret pre-image is known, please pass the secret pre-image as an argument!");
            const success = await this.waitTillClaimed(options?.maxWaitTillAutomaticSettlementSeconds ?? 60, options?.abortSignal, secret);
            if (success && callbacks?.onSwapSettled != null) callbacks.onSwapSettled(this.getOutputTxId()!);
            return success;
        }

        throw new Error("Invalid state reached!");
    }

    /**
     * @inheritDoc
     */
    async txsExecute() {
        if (this._state === FromBTCLNAutoSwapState.PR_CREATED) {
            if (!await this._verifyQuoteValid()) throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment" as const,
                    description: "Initiates the swap by paying up the lightning network invoice",
                    chain: "LIGHTNING" as const,
                    txs: [
                        {
                            type: "BOLT11_PAYMENT_REQUEST" as const,
                            address: this.getAddress(),
                            hyperlink: this.getHyperlink()
                        }
                    ]
                }
            ];
        }

        throw new Error("Invalid swap state to obtain execution txns, required PR_CREATED");
    }


    //////////////////////////////
    //// Payment

    /**
     * Checks whether the LP received the LN payment
     *
     * @param save If the new swap state should be saved
     *
     * @internal
     */
    async _checkIntermediaryPaymentReceived(save: boolean = true): Promise<boolean | null> {
        if(
            this._state===FromBTCLNAutoSwapState.PR_PAID ||
            this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED ||
            this._state===FromBTCLNAutoSwapState.CLAIM_CLAIMED ||
            this._state===FromBTCLNAutoSwapState.FAILED ||
            this._state===FromBTCLNAutoSwapState.EXPIRED
        ) return true;
        if(this._state===FromBTCLNAutoSwapState.QUOTE_EXPIRED) return false;
        if(this.url==null) return false;

        const paymentHash = this.getPaymentHash();
        if(paymentHash==null)
            throw new Error("Failed to check LP payment received, payment hash not known (probably recovered swap?)");

        const resp = await IntermediaryAPI.getInvoiceStatus(this.url, paymentHash.toString("hex"));
        switch(resp.code) {
            case InvoiceStatusResponseCodes.PAID:
                const data = new this.wrapper._swapDataDeserializer(resp.data.data);
                if(this._state===FromBTCLNAutoSwapState.PR_CREATED || this._state===FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) try {
                    await this._saveRealSwapData(data, save);
                    return true;
                } catch (e) {}
                return null;
            case InvoiceStatusResponseCodes.EXPIRED:
                this._state = FromBTCLNAutoSwapState.QUOTE_EXPIRED;
                this.initiated = true;
                if(save) await this._saveAndEmit();
                return false;
            default:
                return null;
        }
    }

    /**
     * Checks and overrides the swap data for this swap. This is used to set the swap data from
     *  on-chain events.
     *
     * @param data Swap data of the escrow swap
     * @param save If the new data should be saved
     *
     * @internal
     */
    async _saveRealSwapData(data: T["Data"], save?: boolean): Promise<boolean> {
        await this.checkIntermediaryReturnedData(data);
        if(this._state===FromBTCLNAutoSwapState.PR_CREATED || this._state===FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
            this._state = FromBTCLNAutoSwapState.PR_PAID;
            this._data = data;
            this.initiated = true;
            if(save) await this._saveAndEmit();
            return true;
        }
        return false;
    }

    /**
     * Checks the data returned by the intermediary in the payment auth request
     *
     * @param data Parsed swap data as returned by the intermediary
     *
     * @throws {IntermediaryError} If the returned are not valid
     * @throws {Error} If the swap is already committed on-chain
     *
     * @private
     */
    private async checkIntermediaryReturnedData(data: T["Data"]): Promise<void> {
        if (!data.isPayOut()) throw new IntermediaryError("Invalid not pay out");
        if (data.getType() !== ChainSwapType.HTLC) throw new IntermediaryError("Invalid swap type");
        if (!data.isOfferer(this.getSwapData().getOfferer())) throw new IntermediaryError("Invalid offerer used");
        if (!data.isClaimer(this._getInitiator())) throw new IntermediaryError("Invalid claimer used");
        if (!data.isToken(this.getSwapData().getToken())) throw new IntermediaryError("Invalid token used");
        if (data.getSecurityDeposit() !== this.getSwapData().getSecurityDeposit()) throw new IntermediaryError("Invalid security deposit!");
        if (data.getClaimerBounty() !== this.getSwapData().getClaimerBounty()) throw new IntermediaryError("Invalid security deposit!");
        if (data.getAmount() < this.getSwapData().getAmount()) throw new IntermediaryError("Invalid amount received!");
        if (data.getClaimHash() !== this.getSwapData().getClaimHash()) throw new IntermediaryError("Invalid payment hash used!");
        if (!data.isDepositToken(this.getSwapData().getDepositToken())) throw new IntermediaryError("Invalid deposit token used!");
        if (data.hasSuccessAction()) throw new IntermediaryError("Invalid has success action");

        if (await this.wrapper._contract.isExpired(this._getInitiator(), data)) throw new IntermediaryError("Not enough time to claim!");
        if (this.wrapper._getHtlcTimeout(data) <= (Date.now()/1000)) throw new IntermediaryError("HTLC expires too soon!");
    }

    /**
     * Waits till a lightning network payment is received by the intermediary, and the intermediary
     *  initiates the swap HTLC on the smart chain side. After the HTLC is initiated you can wait
     *  for an automatic settlement by the watchtowers with the {@link waitTillClaimed} function,
     *  or settle manually using the {@link claim} or {@link txsClaim} functions.
     *
     * If this swap is using an LNURL-withdraw link as input, it automatically posts the
     *  generated invoice to the LNURL service to pay it.
     *
     * @param onPaymentReceived Callback as for when the LP reports having received the ln payment
     * @param abortSignal Abort signal to stop waiting for payment
     * @param checkIntervalSeconds How often to poll the intermediary for answer (default 5 seconds)
     */
    async waitForPayment(onPaymentReceived?: (txId: string) => void, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<boolean> {
        checkIntervalSeconds ??= 5;
        if(this._state===FromBTCLNAutoSwapState.PR_PAID) {
            await this.waitTillCommited(checkIntervalSeconds, abortSignal);
        }
        if(this._state>=FromBTCLNAutoSwapState.CLAIM_COMMITED) return true;
        if(
            this._state!==FromBTCLNAutoSwapState.PR_CREATED
        ) throw new Error("Must be in PR_CREATED state!");

        const abortController = new AbortController();
        if(abortSignal!=null) abortSignal.addEventListener("abort", () => abortController.abort(abortSignal.reason));

        let save = false;

        if(this.lnurl!=null && this.lnurlK1!=null && this.lnurlCallback!=null && !this.prPosted) {
            if(this.pr==null || !this.pr.toLowerCase().startsWith("ln"))
                throw new Error("Input lightning network invoice not available, the swap was probably recovered!");

            LNURL.postInvoiceToLNURLWithdraw({k1: this.lnurlK1, callback: this.lnurlCallback}, this.pr).catch(e => {
                this.lnurlFailSignal.abort(e);
            });
            this.prPosted = true;
            save ||= true;
        }

        if(!this.initiated) {
            this.initiated = true;
            save ||= true;
        }

        if(save) await this._saveAndEmit();

        let lnurlFailListener = () => abortController.abort(this.lnurlFailSignal.signal.reason);
        this.lnurlFailSignal.signal.addEventListener("abort", lnurlFailListener);
        this.lnurlFailSignal.signal.throwIfAborted();

        const paymentHash = this.getPaymentHash();
        if(paymentHash==null)
            throw new Error("Swap payment hash not available, the swap was probably recovered!");

        if(this.wrapper._messenger.warmup!=null) await this.wrapper._messenger.warmup().catch(e => {
            this.logger.warn("waitForPayment(): Failed to warmup messenger: ", e);
        });

        if(this._state===FromBTCLNAutoSwapState.PR_CREATED) {
            const promises: Promise<boolean | undefined>[] = [
                this.waitTillState(FromBTCLNAutoSwapState.PR_PAID, "gte", abortController.signal).then(() => true)
            ];
            if(this.url!=null) promises.push((async () => {
                let resp: InvoiceStatusResponse = {code: InvoiceStatusResponseCodes.PENDING, msg: ""};
                while(!abortController.signal.aborted && resp.code===InvoiceStatusResponseCodes.PENDING) {
                    resp = await IntermediaryAPI.getInvoiceStatus(this.url!, paymentHash.toString("hex"));
                    if(resp.code===InvoiceStatusResponseCodes.PENDING)
                        await timeoutPromise(checkIntervalSeconds*1000, abortController.signal);
                }
                this.lnurlFailSignal.signal.removeEventListener("abort", lnurlFailListener);
                abortController.signal.throwIfAborted();

                if(resp.code===InvoiceStatusResponseCodes.PAID) {
                    const swapData = new this.wrapper._swapDataDeserializer(resp.data.data);
                    return await this._saveRealSwapData(swapData, true);
                }

                if(this._state===FromBTCLNAutoSwapState.PR_CREATED || this._state===FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
                    if(resp.code===InvoiceStatusResponseCodes.EXPIRED) {
                        await this._saveAndEmit(FromBTCLNAutoSwapState.QUOTE_EXPIRED);
                    }
                    return false;
                }
            })());
            const paymentResult = await Promise.race(promises);
            abortController.abort();

            if(!paymentResult) return false;
            if(onPaymentReceived!=null) onPaymentReceived(this.getInputTxId()!);
        }

        if((this._state as FromBTCLNAutoSwapState)===FromBTCLNAutoSwapState.PR_PAID) {
            await this.waitTillCommited(checkIntervalSeconds, abortSignal);
        }

        return this._state>=FromBTCLNAutoSwapState.CLAIM_COMMITED;
    }


    //////////////////////////////
    //// Commit

    /**
     * Waits till the intermediary (LP) initiates the swap HTLC escrow on the destination smart chain side
     *
     * @param checkIntervalSeconds How often to check via a polling watchdog
     * @param abortSignal Abort signal
     *
     * @internal
     */
    protected async waitTillCommited(checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<void> {
        if(this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED || this._state===FromBTCLNAutoSwapState.CLAIM_CLAIMED) return Promise.resolve();
        if(this._state!==FromBTCLNAutoSwapState.PR_PAID) throw new Error("Invalid state");

        const abortController = extendAbortController(abortSignal);
        let result: number | boolean;
        try {
            result = await Promise.race([
                this.watchdogWaitTillCommited(checkIntervalSeconds, abortController.signal),
                this.waitTillState(FromBTCLNAutoSwapState.CLAIM_COMMITED, "gte", abortController.signal).then(() => 0)
            ]);
            abortController.abort();
        } catch (e) {
            abortController.abort();
            throw e;
        }

        if(result===false) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - HTLC expired");
            if(
                this._state===FromBTCLNAutoSwapState.PR_PAID
            ) {
                await this._saveAndEmit(FromBTCLNAutoSwapState.EXPIRED);
            }
            return;
        }

        if(
            this._state===FromBTCLNAutoSwapState.PR_PAID
        ) {
            await this._saveAndEmit(FromBTCLNAutoSwapState.CLAIM_COMMITED);
        }

        if(result===0) this.logger.debug("waitTillCommited(): Resolved from state changed");
        if(result===true) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - commited");
            if(this.secret!=null) await this._broadcastSecret().catch(e => {
                this.logger.error("waitTillCommited(): Error broadcasting swap secret: ", e);
            });
        }
    }


    //////////////////////////////
    //// Claim

    /**
     * @inheritDoc
     *
     * @param _signer Optional signer address to use for claiming the swap, can also be different from the initializer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be {@link FromBTCLNAutoSwapState.CLAIM_COMMITED})
     */
    async txsClaim(_signer?: T["Signer"] | T["NativeSigner"], secret?: string): Promise<T["TX"][]> {
        if(this._state!==FromBTCLNAutoSwapState.CLAIM_COMMITED) throw new Error("Must be in CLAIM_COMMITED state!");
        if(this._data==null) throw new Error("Unknown data, wrong state?");

        const useSecret = secret ?? this.secret;
        if(useSecret==null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as an argument");
        if(!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");

        return await this.wrapper._contract.txsClaimWithSecret(
            _signer==null ?
                this._getInitiator() :
                (isAbstractSigner(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer)),
            this._data, useSecret, true, true
        );
    }

    /**
     * @inheritDoc
     *
     * @param _signer Signer to sign the transactions with, can also be different to the initializer
     * @param abortSignal Abort signal to stop waiting for transaction confirmation
     * @param onBeforeTxSent
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async claim(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, onBeforeTxSent?: (txId: string) => void, secret?: string): Promise<string> {
        const signer = isAbstractSigner(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        let txCount = 0;
        const txs = await this.txsClaim(_signer, secret);
        const result = await this.wrapper._chain.sendAndConfirm(
            signer, txs, true, abortSignal, undefined, (txId: string) => {
                txCount++;
                if(onBeforeTxSent!=null && txCount===1) onBeforeTxSent(txId);
                return Promise.resolve();
            }
        );

        this._claimTxId = result[0];
        if(this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED || this._state===FromBTCLNAutoSwapState.EXPIRED || this._state===FromBTCLNAutoSwapState.FAILED) {
            await this._saveAndEmit(FromBTCLNAutoSwapState.CLAIM_CLAIMED);
        }
        return result[0];
    }

    /**
     * Waits till the swap is successfully settled (claimed), should be called after sending the claim (settlement)
     *  transactions manually to wait till the SDK processes the settlement and updates the swap state accordingly.
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled
     * @param abortSignal AbortSignal
     * @param secret A swap secret to broadcast to watchtowers, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If swap is in invalid state (must be {@link FromBTCLNAutoSwapState.CLAIM_COMMITED})
     * @throws {Error} If the LP refunded sooner than we were able to claim
     * @returns {boolean} whether the swap was claimed in time or not
     */
    async waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal, secret?: string): Promise<boolean> {
        if(this._state===FromBTCLNAutoSwapState.CLAIM_CLAIMED) return Promise.resolve(true);
        if(this._state!==FromBTCLNAutoSwapState.CLAIM_COMMITED) throw new Error("Invalid state (not CLAIM_COMMITED)");

        if(secret!=null) {
            if(!this.isValidSecretPreimage(secret))
                throw new Error("Invalid swap secret pre-image provided!");
            this.secret = secret;
        }

        const abortController = new AbortController();
        if(abortSignal!=null) abortSignal.addEventListener("abort", () => abortController.abort(abortSignal.reason));
        let timedOut: boolean = false;
        if(maxWaitTimeSeconds!=null) {
            const timeout = setTimeout(() => {
                timedOut = true;
                abortController.abort();
            }, maxWaitTimeSeconds * 1000);
            abortController.signal.addEventListener("abort", () => clearTimeout(timeout));
        }

        let res: 0 | 1 | SwapCommitState;
        try {
            res = await Promise.race([
                this.watchdogWaitTillResult(undefined, abortController.signal),
                this.waitTillState(FromBTCLNAutoSwapState.CLAIM_CLAIMED, "eq", abortController.signal).then(() => 0 as const),
                this.waitTillState(FromBTCLNAutoSwapState.EXPIRED, "eq", abortController.signal).then(() => 1 as const),
            ]);
            abortController.abort();
        } catch (e) {
            abortController.abort();
            if(timedOut) return false;
            throw e;
        }

        if(res===0) {
            this.logger.debug("waitTillClaimed(): Resolved from state change (CLAIM_CLAIMED)");
            return true;
        }
        if(res===1) {
            this.logger.debug("waitTillClaimed(): Resolved from state change (EXPIRED)");
            throw new Error("Swap expired during claiming");
        }
        this.logger.debug("waitTillClaimed(): Resolved from watchdog");

        if(res?.type===SwapCommitStateType.PAID) {
            if((this._state as FromBTCLNAutoSwapState)!==FromBTCLNAutoSwapState.CLAIM_CLAIMED) {
                this._claimTxId = await res.getClaimTxId();
                await this._saveAndEmit(FromBTCLNAutoSwapState.CLAIM_CLAIMED);
            }
        }
        if(res?.type===SwapCommitStateType.NOT_COMMITED || res?.type===SwapCommitStateType.EXPIRED) {
            if(
                (this._state as FromBTCLNAutoSwapState)!==FromBTCLNAutoSwapState.CLAIM_CLAIMED &&
                (this._state as FromBTCLNAutoSwapState)!==FromBTCLNAutoSwapState.FAILED
            ) {
                await this._saveAndEmit(FromBTCLNAutoSwapState.FAILED);
            }
            throw new Error("Swap expired during claiming");
        }
        return true;
    }


    //////////////////////////////
    //// LNURL

    /**
     * Whether this swap uses an LNURL-withdraw link
     */
    isLNURL(): boolean {
        return this.lnurl!=null;
    }

    /**
     * Gets the used LNURL or `null` if this is not an LNURL-withdraw swap
     */
    getLNURL(): string | null {
        return this.lnurl ?? null;
    }

    /**
     * Pay the generated lightning network invoice with an LNURL-withdraw link, this
     *  is useful when you want to display a lightning payment QR code and also want to
     *  allow payments using LNURL-withdraw NFC cards.
     *
     * Note that the swap needs to be created **without** an LNURL to begin with for this function
     *  to work. If this swap is already using an LNURL-withdraw link, this function throws.
     */
    async settleWithLNURLWithdraw(lnurl: string | LNURLWithdraw): Promise<void> {
        if(
            this._state!==FromBTCLNAutoSwapState.PR_CREATED &&
            this._state!==FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED
        ) throw new Error("Must be in PR_CREATED state!");

        if(this.lnurl!=null) throw new Error("Cannot settle LNURL-withdraw swap with different LNURL");
        let lnurlParams: LNURLWithdrawParamsWithUrl;
        if(typeof(lnurl)==="string") {
            const parsedLNURL = await LNURL.getLNURL(lnurl);
            if(parsedLNURL==null || parsedLNURL.tag!=="withdrawRequest")
                throw new UserError("Invalid LNURL-withdraw to settle the swap");
            lnurlParams = parsedLNURL;
        } else {
            lnurlParams = lnurl.params;
        }

        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln"))
            throw new Error("Input lightning network invoice not available, the swap was probably recovered!");

        LNURL.useLNURLWithdraw(lnurlParams, this.pr).catch(e => this.lnurlFailSignal.abort(e));
        this.lnurl = lnurlParams.url;
        this.lnurlCallback = lnurlParams.callback;
        this.lnurlK1 = lnurlParams.k1;
        this.prPosted = true;
        await this._saveAndEmit();
    }


    //////////////////////////////
    //// Storage

    /**
     * @inheritDoc
     */
    serialize(): any {
        return {
            ...super.serialize(),
            data: this._data==null ? null : this._data.serialize(),
            commitTxId: this._commitTxId,
            claimTxId: this._claimTxId,
            btcAmountSwap: this.btcAmountSwap==null ? null : this.btcAmountSwap.toString(10),
            btcAmountGas: this.btcAmountGas==null ? null : this.btcAmountGas.toString(10),
            gasSwapFeeBtc: this.gasSwapFeeBtc==null ? null : this.gasSwapFeeBtc.toString(10),
            gasSwapFee: this.gasSwapFee==null ? null : this.gasSwapFee.toString(10),
            gasPricingInfo: serializePriceInfoType(this.gasPricingInfo),
            pr: this.pr,
            secret: this.secret,
            lnurl: this.lnurl,
            lnurlK1: this.lnurlK1,
            lnurlCallback: this.lnurlCallback,
            prPosted: this.prPosted,
            initialSwapData: this.initialSwapData.serialize(),
            usesClaimHashAsId: this.usesClaimHashAsId
        };
    }


    //////////////////////////////
    //// Swap ticks & sync

    /**
     * Checks the swap's state on-chain and compares it to its internal state, updates/changes it according to on-chain
     *  data
     *
     * @private
     */
    private async syncStateFromChain(quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState): Promise<boolean> {
        if(
            this._state===FromBTCLNAutoSwapState.PR_PAID ||
            this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED ||
            this._state===FromBTCLNAutoSwapState.EXPIRED
        ) {
            //Check for expiry before the getCommitStatus to prevent race conditions
            let quoteExpired: boolean = false;
            if(this._state===FromBTCLNAutoSwapState.PR_PAID) {
                quoteExpired = quoteDefinitelyExpired ?? await this._verifyQuoteDefinitelyExpired();
            }

            //Check if it's already successfully paid
            commitStatus ??= await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data!);
            if(commitStatus!=null && await this._forciblySetOnchainState(commitStatus)) return true;

            if(this._state===FromBTCLNAutoSwapState.PR_PAID) {
                if(quoteExpired) {
                    this._state = FromBTCLNAutoSwapState.QUOTE_EXPIRED;
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchOnchainState(): boolean {
        return this._state===FromBTCLNAutoSwapState.PR_PAID || this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED || this._state===FromBTCLNAutoSwapState.EXPIRED;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchExpiryStatus(): boolean {
        return this._state===FromBTCLNAutoSwapState.PR_PAID;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _shouldCheckIntermediary(): boolean {
        return this._state===FromBTCLNAutoSwapState.PR_CREATED || this._state===FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED;
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save?: boolean, quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState, skipLpCheck?: boolean): Promise<boolean> {
        let changed = false;

        if(this._state===FromBTCLNAutoSwapState.PR_CREATED || this._state===FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
            if(this._state!==FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED && this.getQuoteExpiry()<Date.now()) {
                this._state = FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED;
                changed ||= true;
            }

            if(!skipLpCheck) try {
                const result = await this._checkIntermediaryPaymentReceived(false);
                if (result !== null) changed ||= true;
            } catch(e) {
                this.logger.error("_sync(): Failed to synchronize swap, error: ", e);
            }

            if(this._state===FromBTCLNAutoSwapState.PR_CREATED || this._state===FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
                if(await this._verifyQuoteDefinitelyExpired()) {
                    this._state = FromBTCLNAutoSwapState.QUOTE_EXPIRED;
                    changed ||= true;
                }
            }
        }

        if(await this.syncStateFromChain(quoteDefinitelyExpired, commitStatus)) changed = true;

        if(this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED) {
            const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data!);
            if(expired) {
                this._state = FromBTCLNAutoSwapState.EXPIRED;
                changed = true;
            }
        }

        if(save && changed) await this._saveAndEmit();

        if(this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED && this.secret!=null) await this._broadcastSecret().catch(e => {
            this.logger.error("_sync(): Error when broadcasting swap secret: ", e);
        });

        return changed;
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _forciblySetOnchainState(commitStatus: SwapCommitState): Promise<boolean> {
        switch(commitStatus?.type) {
            case SwapCommitStateType.PAID:
                if(this._claimTxId==null) this._claimTxId = await commitStatus.getClaimTxId();
                if(this.secret==null || this.pr==null) this._setSwapSecret(await commitStatus.getClaimResult());
                this._state = FromBTCLNAutoSwapState.CLAIM_CLAIMED;
                return true;
            case SwapCommitStateType.NOT_COMMITED:
                if(this._refundTxId==null && commitStatus.getRefundTxId!=null) this._refundTxId = await commitStatus.getRefundTxId();
                if(this._refundTxId!=null) {
                    this._state = FromBTCLNAutoSwapState.FAILED;
                    return true;
                }
                break;
            case SwapCommitStateType.EXPIRED:
                if(this._refundTxId==null && commitStatus.getRefundTxId!=null) this._refundTxId = await commitStatus.getRefundTxId();
                this._state = this._refundTxId==null ? FromBTCLNAutoSwapState.QUOTE_EXPIRED : FromBTCLNAutoSwapState.FAILED;
                return true;
            case SwapCommitStateType.COMMITED:
                if(this._state!==FromBTCLNAutoSwapState.CLAIM_COMMITED && this._state!==FromBTCLNAutoSwapState.EXPIRED) {
                    this._state = FromBTCLNAutoSwapState.CLAIM_COMMITED;
                    return true;
                }
                break;
        }
        return false;
    }

    /**
     * Broadcasts the swap secret to the underlying data propagation layer (e.g. Nostr by default)
     *
     * @param noCheckExpiry Whether a swap expiration check should be skipped broadcasting
     * @param secret An optional secret pre-image for the swap to broadcast
     *
     * @internal
     */
    async _broadcastSecret(noCheckExpiry?: boolean, secret?: string): Promise<void> {
        if(this._state!==FromBTCLNAutoSwapState.CLAIM_COMMITED) throw new Error("Must be in CLAIM_COMMITED state to broadcast swap secret!");
        if(this._data==null) throw new Error("Unknown data, wrong state?");

        const useSecret = secret ?? this.secret;
        if(useSecret==null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as an argument");
        if(!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");

        if(!noCheckExpiry) {
            if(await this.wrapper._contract.isExpired(this._getInitiator(), this._data)) throw new Error("On-chain HTLC already expired!");
        }
        await this.wrapper._messenger.broadcast(new SwapClaimWitnessMessage(this._data, useSecret));
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _tick(save?: boolean): Promise<boolean> {
        switch(this._state) {
            case FromBTCLNAutoSwapState.PR_CREATED:
                if(this.getQuoteExpiry() < Date.now()) {
                    this._state = FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED:
                if(this.getDefinitiveExpiryTime() < Date.now()) {
                    this._state = FromBTCLNAutoSwapState.QUOTE_EXPIRED;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNAutoSwapState.PR_PAID:
            case FromBTCLNAutoSwapState.CLAIM_COMMITED:
                const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data!);
                if(expired) {
                    this._state = FromBTCLNAutoSwapState.EXPIRED;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                if(this._state===FromBTCLNAutoSwapState.CLAIM_COMMITED) {
                    //Broadcast the secret over the provided messenger channel
                    if(this.broadcastTickCounter===0 && this.secret!=null) await this._broadcastSecret(true).catch(e => {
                        this.logger.warn("_tick(): Error when broadcasting swap secret: ", e);
                    });
                    this.broadcastTickCounter = (this.broadcastTickCounter + 1) % 3; //Broadcast every 3rd tick
                }
                break;
        }

        return false;
    }

    /**
     * Forcibly sets the swap secret pre-image from on-chain data
     *
     * @internal
     */
    _setSwapSecret(secret: string) {
        this.secret = secret;
        if(this.pr==null) {
            this.pr = Buffer.from(sha256(Buffer.from(secret, "hex"))).toString("hex");
        }
    }

}