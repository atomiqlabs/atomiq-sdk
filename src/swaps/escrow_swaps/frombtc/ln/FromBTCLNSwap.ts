import {decode as bolt11Decode} from "@atomiqlabs/bolt11";
import {FromBTCLNDefinition, FromBTCLNWrapper} from "./FromBTCLNWrapper";
import {IFromBTCSelfInitSwap} from "../IFromBTCSelfInitSwap";
import {SwapType} from "../../../../enums/SwapType";
import {
    ChainSwapType,
    ChainType, isAbstractSigner,
    SignatureData,
    SwapCommitState,
    SwapCommitStateType,
    SwapData,
    SignatureVerificationError
} from "@atomiqlabs/base";
import {Buffer} from "buffer";
import {LNURL} from "../../../../lnurl/LNURL";
import {UserError} from "../../../../errors/UserError";
import {
    IntermediaryAPI,
    PaymentAuthorizationResponse,
    PaymentAuthorizationResponseCodes
} from "../../../../intermediaries/apis/IntermediaryAPI";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {extendAbortController} from "../../../../utils/Utils";
import {MinimalLightningNetworkWalletInterface} from "../../../../types/wallets/MinimalLightningNetworkWalletInterface";
import {IClaimableSwap} from "../../../IClaimableSwap";
import {IAddressSwap} from "../../../IAddressSwap";
import {IEscrowSelfInitSwapInit, isIEscrowSelfInitSwapInit} from "../../IEscrowSelfInitSwap";
import {TokenAmount, toTokenAmount} from "../../../../types/TokenAmount";
import {BitcoinTokens, BtcToken, SCToken} from "../../../../types/Token";
import {getLogger, LoggerType} from "../../../../utils/Logger";
import {timeoutPromise} from "../../../../utils/TimeoutUtils";
import {isLNURLWithdraw, LNURLWithdraw, LNURLWithdrawParamsWithUrl} from "../../../../types/lnurl/LNURLWithdraw";
import {sha256} from "@noble/hashes/sha2";
import {SwapExecutionAction} from "../../../../types/SwapExecutionAction";

/**
 * State enum for legacy Lightning -> Smart chain swaps
 * @category Swaps/Legacy/Lightning → Smart chain
 */
export enum FromBTCLNSwapState {
    /**
     * Swap has failed as the user didn't settle the HTLC on the destination before expiration
     */
    FAILED = -4,
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    QUOTE_EXPIRED = -3,
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    QUOTE_SOFT_EXPIRED = -2,
    /**
     * Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     *  swap on the destination smart chain.
     */
    EXPIRED = -1,
    /**
     * Swap quote was created, use {@link FromBTCLNSwap.getAddress} or {@link FromBTCLNSwap.getHyperlink}
     *  to get the bolt11 lightning network invoice to pay to initiate the swap, then use the
     *  {@link FromBTCLNSwap.waitForPayment} to wait till the lightning network payment is received
     *  by the intermediary (LP)
     */
    PR_CREATED = 0,
    /**
     * Lightning network payment has been received by the intermediary (LP), the user can now settle
     *  the swap on the destination smart chain side with {@link FromBTCLNSwap.commitAndClaim} (if
     *  the underlying chain supports it - check with {@link FromBTCLNSwap.canCommitAndClaimInOneShot}),
     *  or by calling {@link FromBTCLNSwap.commit} and {@link FromBTCLNSwap.claim} separately.
     */
    PR_PAID = 1,
    /**
     * Swap escrow HTLC has been created on the destination chain. Continue by claiming it with the
     *  {@link FromBTCLNSwap.claim} or {@link FromBTCLNSwap.txsClaim} function.
     */
    CLAIM_COMMITED = 2,
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    CLAIM_CLAIMED = 3
}

const FromBTCLNSwapStateDescription = {
    [FromBTCLNSwapState.FAILED]: `Swap has failed as the user didn't settle the HTLC on the destination before expiration`,
    [FromBTCLNSwapState.QUOTE_EXPIRED]: `Swap has expired for good and there is no way how it can be executed anymore`,
    [FromBTCLNSwapState.QUOTE_SOFT_EXPIRED]: `Swap is expired, though there is still a chance that it will be processed`,
    [FromBTCLNSwapState.EXPIRED]: `Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     swap on the destination smart chain.`,
    [FromBTCLNSwapState.PR_CREATED]: `Swap quote was created, pay the bolt11 lightning network invoice to initiate the swap,
     then use the wait till the lightning network payment is received by the intermediary (LP)`,
    [FromBTCLNSwapState.PR_PAID]: `Lightning network payment has been received by the intermediary (LP), the user can now settle
     the swap on the destination smart chain side.`,
    [FromBTCLNSwapState.CLAIM_COMMITED]: `Swap escrow HTLC has been created on the destination chain. Continue by claiming it.`,
    [FromBTCLNSwapState.CLAIM_CLAIMED]: `Swap successfully settled and funds received on the destination chain`
};

export type FromBTCLNSwapInit<T extends SwapData> = IEscrowSelfInitSwapInit<T> & {
    pr?: string,
    secret?: string,
    initialSwapData: T,
    lnurl?: string,
    lnurlK1?: string,
    lnurlCallback?: string
};

export function isFromBTCLNSwapInit<T extends SwapData>(obj: any): obj is FromBTCLNSwapInit<T> {
    return (obj.pr==null || typeof obj.pr==="string") &&
        (obj.secret==null || typeof obj.secret==="string") &&
        (obj.lnurl==null || typeof(obj.lnurl)==="string") &&
        (obj.lnurlK1==null || typeof(obj.lnurlK1)==="string") &&
        (obj.lnurlCallback==null || typeof(obj.lnurlCallback)==="string") &&
        isIEscrowSelfInitSwapInit(obj);
}

/**
 * Legacy escrow (HTLC) based swap for Bitcoin Lightning -> Smart chains, requires manual settlement
 *  of the swap on the destination network once the lightning network payment is received by the LP.
 *
 * @category Swaps/Legacy/Lightning → Smart chain
 */
export class FromBTCLNSwap<T extends ChainType = ChainType>
    extends IFromBTCSelfInitSwap<T, FromBTCLNDefinition<T>, FromBTCLNSwapState>
    implements IAddressSwap, IClaimableSwap<T, FromBTCLNDefinition<T>, FromBTCLNSwapState> {

    protected readonly TYPE = SwapType.FROM_BTCLN;
    /**
     * @internal
     */
    protected readonly swapStateName = (state: number) => FromBTCLNSwapState[state];
    /**
     * @internal
     */
    protected readonly swapStateDescription = FromBTCLNSwapStateDescription;
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

    constructor(wrapper: FromBTCLNWrapper<T>, init: FromBTCLNSwapInit<T["Data"]>);
    constructor(wrapper: FromBTCLNWrapper<T>, obj: any);
    constructor(
        wrapper: FromBTCLNWrapper<T>,
        initOrObject: FromBTCLNSwapInit<T["Data"]> | any
    ) {
        if(isFromBTCLNSwapInit(initOrObject) && initOrObject.url!=null) initOrObject.url += "/frombtcln";
        super(wrapper, initOrObject);
        if(isFromBTCLNSwapInit(initOrObject)) {
            this._state = FromBTCLNSwapState.PR_CREATED;
            this.pr = initOrObject.pr;
            this.secret = initOrObject.secret;
            this.initialSwapData = initOrObject.initialSwapData;
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

            this.lnurl = initOrObject.lnurl;
            this.lnurlK1 = initOrObject.lnurlK1;
            this.lnurlCallback = initOrObject.lnurlCallback;
            this.prPosted = initOrObject.prPosted;

            if(this._state===FromBTCLNSwapState.PR_CREATED && this._data!=null) {
                this.initialSwapData = this._data;
                delete this._data;
            }
            this.usesClaimHashAsId = initOrObject.usesClaimHashAsId ?? false;
        }
        this.tryRecomputeSwapPrice();
        this.logger = getLogger("FromBTCLN("+this.getIdentifierHashString()+"): ");
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
    protected upgradeVersion() {
        if (this.version == null) {
            switch (this._state) {
                case -2:
                    this._state = FromBTCLNSwapState.QUOTE_EXPIRED;
                    break;
                case -1:
                    this._state = FromBTCLNSwapState.FAILED;
                    break;
                case 0:
                    this._state = FromBTCLNSwapState.PR_CREATED
                    break;
                case 1:
                    this._state = FromBTCLNSwapState.PR_PAID
                    break;
                case 2:
                    this._state = FromBTCLNSwapState.CLAIM_COMMITED
                    break;
                case 3:
                    this._state = FromBTCLNSwapState.CLAIM_CLAIMED
                    break;
            }
            this.version = 1;
        }
    }

    //////////////////////////////
    //// Getters & utils

    /**
     * @inheritDoc
     * @internal
     */
    protected getIdentifierHash(): Buffer {
        const idBuffer: Buffer = this.usesClaimHashAsId
            ? Buffer.from(this.getClaimHash(), "hex")
            : this.getPaymentHash()!;
        if(this._randomNonce==null) return idBuffer;
        return Buffer.concat([idBuffer, Buffer.from(this._randomNonce, "hex")]);
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
     * @internal
     */
    protected canCommit(): boolean {
        return this._state===FromBTCLNSwapState.PR_PAID;
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
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap.
     *
     * In case the swap is recovered from on-chain data, the address returned might be just a payment hash,
     *  as it is impossible to retrieve the actual lightning network invoice paid purely from on-chain
     *  data.
     */
    getAddress(): string {
        return this.pr ?? "";
    }

    /**
     * A hyperlink representation of the address + amount that the user needs to sends on the source chain.
     *  This is suitable to be displayed in a form of QR code.
     *
     * @remarks
     * In case the swap is recovered from on-chain data, the address returned might be just a payment hash,
     *  as it is impossible to retrieve the actual lightning network invoice paid purely from on-chain
     *  data.
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
        if(decoded.timeExpireDate==null) throw new Error("Swap invoice doesn't contain expiry date field!");
        const finalCltvExpiryDelta = decoded.tagsObject.min_final_cltv_expiry ?? 144;
        const finalCltvExpiryDelay = finalCltvExpiryDelta * this.wrapper._options.bitcoinBlocktime * this.wrapper._options.safetyFactor;
        return (decoded.timeExpireDate + finalCltvExpiryDelay)*1000;
    }

    /**
     * Returns timeout time (in UNIX milliseconds) when the swap htlc will expire
     */
    getHtlcTimeoutTime(): number | null {
        if(this._data==null) return null;
        return Number(this.wrapper._getHtlcTimeout(this._data))*1000;
    }

    /**
     * Returns timeout time (in UNIX milliseconds) when the LN invoice will expire
     */
    getTimeoutTime(): number {
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln")) return 0;
        const decoded = bolt11Decode(this.pr);
        if(decoded.timeExpireDate==null) throw new Error("Swap invoice doesn't contain expiry date field!");
        return (decoded.timeExpireDate*1000);
    }

    /**
     * @inheritDoc
     */
    isFinished(): boolean {
        return this._state===FromBTCLNSwapState.CLAIM_CLAIMED || this._state===FromBTCLNSwapState.QUOTE_EXPIRED || this._state===FromBTCLNSwapState.FAILED;
    }

    /**
     * @inheritDoc
     */
    isClaimable(): boolean {
        return this._state===FromBTCLNSwapState.CLAIM_COMMITED;
    }

    /**
     * @inheritDoc
     */
    isSuccessful(): boolean {
        return this._state===FromBTCLNSwapState.CLAIM_CLAIMED;
    }

    /**
     * @inheritDoc
     */
    isFailed(): boolean {
        return this._state===FromBTCLNSwapState.FAILED || this._state===FromBTCLNSwapState.EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isQuoteExpired(): boolean {
        return this._state===FromBTCLNSwapState.QUOTE_EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isQuoteSoftExpired(): boolean {
        return this._state===FromBTCLNSwapState.QUOTE_EXPIRED || this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteDefinitelyExpired(): Promise<boolean> {
        if(this._state===FromBTCLNSwapState.PR_CREATED || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData==null)) {
            return Promise.resolve(this.getDefinitiveExpiryTime()<Date.now());
        }
        return super._verifyQuoteDefinitelyExpired();
    }

    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteValid(): Promise<boolean> {
        if(
            this._state===FromBTCLNSwapState.PR_CREATED ||
            (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData==null)
        ) {
            return Promise.resolve(this.getTimeoutTime()>Date.now());
        }
        return super._verifyQuoteValid();
    }


    //////////////////////////////
    //// Amounts & fees

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
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln"))
            return toTokenAmount(null, this.inputToken, this.wrapper._prices, this.pricingInfo);

        const parsed = bolt11Decode(this.pr);
        if(parsed.millisatoshis==null) throw new Error("Swap invoice doesn't contain msat amount field!");
        const amount = (BigInt(parsed.millisatoshis) + 999n) / 1000n;
        return toTokenAmount(amount, this.inputToken, this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    getSmartChainNetworkFee(): Promise<TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>> {
        return this.getCommitAndClaimNetworkFee();
    }

    /**
     * @inheritDoc
     */
    async hasEnoughForTxFees(): Promise<{
        enoughBalance: boolean,
        balance: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>,
        required: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>
    }> {
        const [balance, feeRate] = await Promise.all([
            this.wrapper._contract.getBalance(this._getInitiator(), this.wrapper._chain.getNativeCurrencyAddress(), false),
            this.feeRate!=null ? Promise.resolve<string>(this.feeRate) : this.wrapper._contract.getInitFeeRate(
                this.getSwapData().getOfferer(),
                this.getSwapData().getClaimer(),
                this.getSwapData().getToken(),
                this.getSwapData().getClaimHash()
            )
        ]);
        const commitFee = await this.wrapper._contract.getCommitFee(this._getInitiator(), this.getSwapData(), feeRate);
        const claimFee = await this.wrapper._contract.getClaimFee(this._getInitiator(), this.getSwapData(), feeRate);
        const totalFee = commitFee + claimFee + this.getSwapData().getTotalDeposit();
        return {
            enoughBalance: balance >= totalFee,
            balance: toTokenAmount(balance, this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo),
            required: toTokenAmount(totalFee, this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo)
        };
    }

    private isValidSecretPreimage(secret: string) {
        const paymentHash = Buffer.from(sha256(Buffer.from(secret, "hex")));
        const claimHash = this.wrapper._contract.getHashForHtlc(paymentHash).toString("hex");
        return this.getSwapData().getClaimHash()===claimHash;
    }

    /**
     * Sets the secret preimage for the swap, in case it is not known already
     *
     * @param secret Secret preimage that matches the expected payment hash
     *
     * @throws {Error} If an invalid secret preimage is provided
     */
    setSecretPreimage(secret: string) {
        if(!this.isValidSecretPreimage(secret)) throw new Error("Invalid secret preimage provided, hash doesn't match!");
        this.secret = secret;
    }

    /**
     * Returns whether the secret preimage for this swap is known
     */
    hasSecretPreimage(): boolean {
        return this.secret != null;
    }


    //////////////////////////////
    //// Execution

    /**
     * Executes the swap with the provided bitcoin lightning network wallet or LNURL
     *
     * @param dstSigner Signer on the destination network, needs to have the same address as the one specified when
     *  quote was created, this is required for legacy swaps because the destination wallet needs to actively claim
     *  the swap funds on the destination (this also means you need native token to cover gas costs)
     * @param walletOrLnurlWithdraw Bitcoin lightning wallet to use to pay the lightning network invoice, or an LNURL-withdraw
     *  link, wallet is not required and the LN invoice can be paid externally as well (just pass null or undefined here)
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async execute(
        dstSigner: T["Signer"] | T["NativeSigner"],
        walletOrLnurlWithdraw?: MinimalLightningNetworkWalletInterface | LNURLWithdraw | string | null | undefined,
        callbacks?: {
            onSourceTransactionReceived?: (sourceTxId: string) => void,
            onDestinationCommitSent?: (destinationCommitTxId: string) => void,
            onDestinationClaimSent?: (destinationClaimTxId: string) => void,
            onSwapSettled?: (destinationTxId: string) => void
        },
        options?: {
            abortSignal?: AbortSignal,
            secret?: string,
            lightningTxCheckIntervalSeconds?: number,
            delayBetweenCommitAndClaimSeconds?: number
        }
    ): Promise<void> {
        if(this._state===FromBTCLNSwapState.FAILED) throw new Error("Swap failed!");
        if(this._state===FromBTCLNSwapState.EXPIRED) throw new Error("Swap HTLC expired!");
        if(this._state===FromBTCLNSwapState.QUOTE_EXPIRED || this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) throw new Error("Swap quote expired!");
        if(this._state===FromBTCLNSwapState.CLAIM_CLAIMED) throw new Error("Swap already settled!");

        let abortSignal = options?.abortSignal;

        if(this._state===FromBTCLNSwapState.PR_CREATED) {
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
            const paymentSuccess = await this.waitForPayment(callbacks?.onSourceTransactionReceived, options?.lightningTxCheckIntervalSeconds, abortSignal);
            if (!paymentSuccess) throw new Error("Failed to receive lightning network payment");
        }

        if(this._state===FromBTCLNSwapState.PR_PAID || this._state===FromBTCLNSwapState.CLAIM_COMMITED) {
            if(this.canCommitAndClaimInOneShot()) {
                await this.commitAndClaim(dstSigner, options?.abortSignal, undefined, callbacks?.onDestinationCommitSent, callbacks?.onDestinationClaimSent, options?.secret);
            } else {
                if(this._state===FromBTCLNSwapState.PR_PAID) {
                    await this.commit(dstSigner, options?.abortSignal, undefined, callbacks?.onDestinationCommitSent);
                    if(options?.delayBetweenCommitAndClaimSeconds!=null) await timeoutPromise(options.delayBetweenCommitAndClaimSeconds * 1000, options?.abortSignal);
                }
                if(this._state===FromBTCLNSwapState.CLAIM_COMMITED) {
                    await this.claim(dstSigner, options?.abortSignal, callbacks?.onDestinationClaimSent, options?.secret);
                }
            }
        }

        // @ts-ignore
        if(this._state===FromBTCLNSwapState.CLAIM_CLAIMED) {
            if(callbacks?.onSwapSettled!=null) callbacks.onSwapSettled(this.getOutputTxId()!);
        }
    }

    /**
     * @inheritDoc
     *
     * @param options
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap
     *  wasn't commited yet (this is handled on swap creation, if you commit right after quoting, you
     *  can use `skipChecks=true`)
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async txsExecute(options?: {
        skipChecks?: boolean,
        secret?: string
    }) {
        if(this._state===FromBTCLNSwapState.PR_CREATED) {
            if(!await this._verifyQuoteValid()) throw new Error("Quote already expired or close to expiry!");
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

        if(this._state===FromBTCLNSwapState.PR_PAID) {
            if(!await this._verifyQuoteValid()) throw new Error("Quote already expired or close to expiry!");
            const txsCommit = await this.txsCommit(options?.skipChecks);
            const txsClaim = await this._txsClaim(undefined, options?.secret);
            return [
                {
                    name: "Commit" as const,
                    description: `Creates the HTLC escrow on the ${this.chainIdentifier} side`,
                    chain: this.chainIdentifier,
                    txs: txsCommit
                },
                {
                    name: "Claim" as const,
                    description: `Settles & claims the funds from the HTLC escrow on the ${this.chainIdentifier} side`,
                    chain: this.chainIdentifier,
                    txs: txsClaim
                },
            ];
        }

        if(this._state===FromBTCLNSwapState.CLAIM_COMMITED) {
            const txsClaim = await this.txsClaim(undefined, options?.secret);
            return [
                {
                    name: "Claim" as const,
                    description: `Settles & claims the funds from the HTLC escrow on the ${this.chainIdentifier} side`,
                    chain: this.chainIdentifier,
                    txs: txsClaim
                },
            ];
        }

        throw new Error("Invalid swap state to obtain execution txns, required PR_CREATED, PR_PAID or CLAIM_COMMITED");
    }

    /**
     * @inheritDoc
     *
     * @param options
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap
     *  wasn't commited yet (this is handled on swap creation, if you commit right after quoting, you
     *  can use `skipChecks=true`)
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async getCurrentActions(options?: {
        skipChecks?: boolean,
        secret?: string
    }): Promise<SwapExecutionAction<T>[]> {
        try {
            return await this.txsExecute(options);
        } catch (e) {
            return [];
        }
    }


    //////////////////////////////
    //// Payment

    /**
     * Checks whether the LP received the LN payment and we can continue by committing & claiming the HTLC on-chain
     *
     * @param save If the new swap state should be saved
     *
     * @internal
     */
    async _checkIntermediaryPaymentReceived(save: boolean = true): Promise<boolean | null> {
        if(
            this._state===FromBTCLNSwapState.PR_PAID ||
            this._state===FromBTCLNSwapState.CLAIM_COMMITED ||
            this._state===FromBTCLNSwapState.CLAIM_CLAIMED ||
            this._state===FromBTCLNSwapState.FAILED ||
            this._state===FromBTCLNSwapState.EXPIRED
        ) return true;
        if(this._state===FromBTCLNSwapState.QUOTE_EXPIRED || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData!=null)) return false;
        if(this.url==null) return false;

        const paymentHash = this.getPaymentHash();
        if(paymentHash==null)
            throw new Error("Failed to check LP payment received, payment hash not known (probably recovered swap?)");

        const resp = await IntermediaryAPI.getPaymentAuthorization(this.url, paymentHash.toString("hex"));
        switch(resp.code) {
            case PaymentAuthorizationResponseCodes.AUTH_DATA:
                const data = new this.wrapper._swapDataDeserializer(resp.data.data);
                try {
                    await this.checkIntermediaryReturnedAuthData(this._getInitiator(), data, resp.data);
                    this.expiry = await this.wrapper._contract.getInitAuthorizationExpiry(
                        data,
                        resp.data
                    );
                    this._state = FromBTCLNSwapState.PR_PAID;
                    this._data = data;
                    this.signatureData = {
                        prefix: resp.data.prefix,
                        timeout: resp.data.timeout,
                        signature: resp.data.signature
                    };
                    this.initiated = true;
                    if(save) await this._saveAndEmit();
                    return true;
                } catch (e) {}
                return null;
            case PaymentAuthorizationResponseCodes.EXPIRED:
                this._state = FromBTCLNSwapState.QUOTE_EXPIRED;
                this.initiated = true;
                if(save) await this._saveAndEmit();
                return false;
            default:
                return null;
        }
    }

    /**
     * Checks the data returned by the intermediary in the payment auth request
     *
     * @param signer Smart chain signer's address initiating the swap
     * @param data Parsed swap data as returned by the intermediary
     * @param signature Signature data as returned by the intermediary
     *
     * @throws {IntermediaryError} If the returned are not valid
     * @throws {SignatureVerificationError} If the returned signature is not valid
     * @throws {Error} If the swap is already committed on-chain
     *
     * @internal
     */
    protected async checkIntermediaryReturnedAuthData(signer: string, data: T["Data"], signature: SignatureData): Promise<void> {
        data.setClaimer(signer);

        if (data.getType() !== ChainSwapType.HTLC) throw new IntermediaryError("Invalid swap type");
        if (!data.isOfferer(this.getSwapData().getOfferer())) throw new IntermediaryError("Invalid offerer used");
        if (!data.isClaimer(this._getInitiator())) throw new IntermediaryError("Invalid claimer used");
        if (!data.isToken(this.getSwapData().getToken())) throw new IntermediaryError("Invalid token used");
        if (data.getSecurityDeposit() > this.getSwapData().getSecurityDeposit()) throw new IntermediaryError("Invalid security deposit!");
        if (data.getClaimerBounty() !== 0n) throw new IntermediaryError("Invalid claimer bounty!");
        if (data.getAmount() < this.getSwapData().getAmount()) throw new IntermediaryError("Invalid amount received!");
        if (data.getClaimHash() !== this.getSwapData().getClaimHash()) throw new IntermediaryError("Invalid payment hash used!");
        if (!data.isDepositToken(this.getSwapData().getDepositToken())) throw new IntermediaryError("Invalid deposit token used!");
        if (data.hasSuccessAction()) throw new IntermediaryError("Invalid has success action");

        await Promise.all([
            this.wrapper._contract.isValidInitAuthorization(this._getInitiator(), data, signature, this.feeRate),
            this.wrapper._contract.getCommitStatus(data.getClaimer(), data)
                .then(status => {
                    if (status?.type !== SwapCommitStateType.NOT_COMMITED)
                        throw new Error("Swap already committed on-chain!");
                })
        ]);
    }

    /**
     * Waits till a lightning network payment is received by the intermediary and client
     *  can continue by initiating (committing) & settling (claiming) the HTLC by calling
     *  either the {@link commitAndClaim} function (if the underlying chain allows commit
     *  and claim in a single transaction - check with {@link canCommitAndClaimInOneShot}).
     *  Or call {@link commit} and then {@link claim} separately.
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
        if(
            this._state!==FromBTCLNSwapState.PR_CREATED &&
            (this._state!==FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData!=null)
        ) throw new Error("Must be in PR_CREATED state!");
        if(this.url==null) throw new Error("LP URL not known, cannot await the payment!");

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

        let resp: PaymentAuthorizationResponse = {code: PaymentAuthorizationResponseCodes.PENDING, msg: ""};
        while(!abortController.signal.aborted && resp.code===PaymentAuthorizationResponseCodes.PENDING) {
            resp = await IntermediaryAPI.getPaymentAuthorization(this.url, paymentHash.toString("hex"));
            if(resp.code===PaymentAuthorizationResponseCodes.PENDING)
                await timeoutPromise(checkIntervalSeconds*1000, abortController.signal);
        }
        this.lnurlFailSignal.signal.removeEventListener("abort", lnurlFailListener);
        abortController.signal.throwIfAborted();

        if(resp.code===PaymentAuthorizationResponseCodes.AUTH_DATA) {
            const sigData = resp.data;
            const swapData = new this.wrapper._swapDataDeserializer(resp.data.data);
            await this.checkIntermediaryReturnedAuthData(this._getInitiator(), swapData, sigData);
            this.expiry = await this.wrapper._contract.getInitAuthorizationExpiry(
                swapData,
                sigData
            );
            if(onPaymentReceived!=null) onPaymentReceived(this.getInputTxId()!);
            if(this._state===FromBTCLNSwapState.PR_CREATED || this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
                this._data = swapData;
                this.signatureData = {
                    prefix: sigData.prefix,
                    timeout: sigData.timeout,
                    signature: sigData.signature
                };
                await this._saveAndEmit(FromBTCLNSwapState.PR_PAID);
            }
            return true;
        }

        if(this._state===FromBTCLNSwapState.PR_CREATED || this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            if(resp.code===PaymentAuthorizationResponseCodes.EXPIRED) {
                await this._saveAndEmit(FromBTCLNSwapState.QUOTE_EXPIRED);
            }

            return false;
        }

        throw new IntermediaryError("Invalid response from the LP");
    }


    //////////////////////////////
    //// Commit

    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commit(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean, onBeforeTxSent?: (txId: string) => void): Promise<string> {
        const signer = isAbstractSigner(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        this.checkSigner(signer);
        let txCount = 0;
        const txs = await this.txsCommit(skipChecks);
        const result = await this.wrapper._chain.sendAndConfirm(
            signer, txs, true, abortSignal, undefined, (txId: string) => {
                txCount++;
                if(onBeforeTxSent!=null && txCount===txs.length) onBeforeTxSent(txId);
                return Promise.resolve();
            }
        );

        this._commitTxId = result[result.length-1];
        if(this._state===FromBTCLNSwapState.PR_PAID || this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_COMMITED);
        }
        return this._commitTxId;
    }

    /**
     * @inheritDoc
     */
    async waitTillCommited(abortSignal?: AbortSignal): Promise<void> {
        if(this._state===FromBTCLNSwapState.CLAIM_COMMITED || this._state===FromBTCLNSwapState.CLAIM_CLAIMED) return Promise.resolve();
        if(this._state!==FromBTCLNSwapState.PR_PAID && (this._state!==FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData!=null)) throw new Error("Invalid state");

        const abortController = extendAbortController(abortSignal);
        const result = await Promise.race([
            this.watchdogWaitTillCommited(undefined, abortController.signal),
            this.waitTillState(FromBTCLNSwapState.CLAIM_COMMITED, "gte", abortController.signal).then(() => 0)
        ]);
        abortController.abort();

        if(result===0) this.logger.debug("waitTillCommited(): Resolved from state changed");
        if(result===true) this.logger.debug("waitTillCommited(): Resolved from watchdog - commited");
        if(result===false) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - signature expired");
            if(
                this._state===FromBTCLNSwapState.PR_PAID ||
                this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED
            ) {
                await this._saveAndEmit(FromBTCLNSwapState.QUOTE_EXPIRED);
            }
            return;
        }

        if(
            this._state===FromBTCLNSwapState.PR_PAID ||
            this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED
        ) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_COMMITED);
        }
    }


    //////////////////////////////
    //// Claim

    /**
     * Unsafe txs claim getter without state checking!
     *
     * @param _signer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @internal
     */
    private async _txsClaim(_signer?: T["Signer"] | T["NativeSigner"], secret?: string): Promise<T["TX"][]> {
        if(this._data==null) throw new Error("Unknown data, wrong state?");
        const useSecret = secret ?? this.secret;
        if(useSecret==null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as an argument");
        if(!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");

        return this.wrapper._contract.txsClaimWithSecret(
            _signer==null ?
                this._getInitiator() :
                (isAbstractSigner(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer)),
            this._data, useSecret, true, true
        );
    }

    /**
     * @inheritDoc
     *
     * @param _signer Optional signer address to use for claiming the swap, can also be different from the initializer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be {@link FromBTCLNSwapState.CLAIM_COMMITED})
     */
    async txsClaim(_signer?: T["Signer"] | T["NativeSigner"], secret?: string): Promise<T["TX"][]> {
        if(this._state!==FromBTCLNSwapState.CLAIM_COMMITED) throw new Error("Must be in CLAIM_COMMITED state!");
        return this._txsClaim(_signer, secret);
    }

    /**
     * @inheritDoc
     *
     * @param _signer
     * @param abortSignal
     * @param onBeforeTxSent
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async claim(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, onBeforeTxSent?: (txId: string) => void, secret?: string): Promise<string> {
        const signer = isAbstractSigner(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        let txCount = 0;
        const result = await this.wrapper._chain.sendAndConfirm(
            signer, await this.txsClaim(_signer, secret), true, abortSignal, undefined, (txId: string) => {
                txCount++;
                if(onBeforeTxSent!=null && txCount===1) onBeforeTxSent(txId);
                return Promise.resolve();
            }
        );

        this._claimTxId = result[0];
        if(this._state===FromBTCLNSwapState.CLAIM_COMMITED || this._state===FromBTCLNSwapState.EXPIRED || this._state===FromBTCLNSwapState.FAILED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
        }
        return result[0];
    }

    /**
     * @inheritDoc
     *
     * @throws {Error} If swap is in invalid state (must be {@link FromBTCLNSwapState.CLAIM_COMMITED})
     * @throws {Error} If the LP refunded sooner than we were able to claim
     */
    async waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean> {
        if(this._state===FromBTCLNSwapState.CLAIM_CLAIMED) return Promise.resolve(true);
        if(this._state!==FromBTCLNSwapState.CLAIM_COMMITED) throw new Error("Invalid state (not CLAIM_COMMITED)");

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
                this.waitTillState(FromBTCLNSwapState.CLAIM_CLAIMED, "eq", abortController.signal).then(() => 0 as const),
                this.waitTillState(FromBTCLNSwapState.EXPIRED, "eq", abortController.signal).then(() => 1 as const),
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
            if((this._state as FromBTCLNSwapState)!==FromBTCLNSwapState.CLAIM_CLAIMED) {
                this._claimTxId = await res.getClaimTxId();
                await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
            }
        }
        if(res?.type===SwapCommitStateType.NOT_COMMITED || res?.type===SwapCommitStateType.EXPIRED) {
            if(
                (this._state as FromBTCLNSwapState)!==FromBTCLNSwapState.CLAIM_CLAIMED &&
                (this._state as FromBTCLNSwapState)!==FromBTCLNSwapState.FAILED
            ) {
                if(res.getRefundTxId!=null) this._refundTxId = await res.getRefundTxId();
                await this._saveAndEmit(FromBTCLNSwapState.FAILED);
            }
            throw new Error("Swap expired while waiting for claim!");
        }
        return true;
    }


    //////////////////////////////
    //// Commit & claim

    /**
     * Estimated transaction fee for commit & claim transactions combined, required
     *  to settle the swap on the smart chain destination side.
     */
    async getCommitAndClaimNetworkFee(): Promise<TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>> {
        const swapContract: T["Contract"] = this.wrapper._contract;
        const feeRate = this.feeRate ?? await swapContract.getInitFeeRate(
            this.getSwapData().getOfferer(),
            this.getSwapData().getClaimer(),
            this.getSwapData().getToken(),
            this.getSwapData().getClaimHash()
        );
        const commitFee = await (
            swapContract.getRawCommitFee!=null ?
                swapContract.getRawCommitFee(this._getInitiator(), this.getSwapData(), feeRate) :
                swapContract.getCommitFee(this._getInitiator(), this.getSwapData(), feeRate)
        );
        const claimFee = await (
            swapContract.getRawClaimFee!=null ?
                swapContract.getRawClaimFee(this._getInitiator(), this.getSwapData(), feeRate) :
                swapContract.getClaimFee(this._getInitiator(), this.getSwapData(), feeRate)
        );

        return toTokenAmount(
            commitFee + claimFee,
            this.wrapper._getNativeToken(),
            this.wrapper._prices
        );
    }

    /**
     * Returns whether the underlying chain supports calling commit and claim in a single call,
     *  such that you can use the {@link commitAndClaim} function. If not you have to manually
     *  call {@link commit} first and then {@link claim}.
     */
    canCommitAndClaimInOneShot(): boolean {
        return this.wrapper._contract.initAndClaimWithSecret!=null;
    }

    /**
     * Returns transactions for both commit & claim operation together, such that they can be signed all at once by
     *  the wallet. **WARNING**: transactions must be sent sequentially, such that the claim (2nd) transaction is only
     *  sent after the commit (1st) transaction confirms. Failure to do so can reveal the HTLC pre-image too soon,
     *  opening a possibility for the LP to steal funds!
     *
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be PR_PAID or CLAIM_COMMITED)
     */
    async txsCommitAndClaim(skipChecks?: boolean, secret?: string): Promise<T["TX"][]> {
        if(this._state===FromBTCLNSwapState.CLAIM_COMMITED) return await this.txsClaim(undefined, secret);
        if(
            this._state!==FromBTCLNSwapState.PR_PAID &&
            (this._state!==FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData==null)
        ) throw new Error("Must be in PR_PAID state!");
        if(this._data==null) throw new Error("Unknown data, wrong state?");

        const useSecret = secret ?? this.secret;
        if(useSecret==null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as second argument");
        if(!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");

        const initTxs = await this.txsCommit(skipChecks);
        const claimTxs = await this.wrapper._contract.txsClaimWithSecret(
            this._getInitiator(), this._data, useSecret,
            true, true, undefined,
            true
        );

        return initTxs.concat(claimTxs);
    }

    /**
     * Commits and claims the swap, in a way that the transactions can be signed together by the provided signer and
     *  then automatically sent sequentially by the SDK. To check if the underlying chain supports this flow check
     *  the {@link canCommitAndClaimInOneShot} function.
     *
     * @param _signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal to stop waiting for the transaction confirmation and abort
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param onBeforeCommitTxSent Optional callback called before the initialization (commit) transaction is
     *  broadcasted
     * @param onBeforeClaimTxSent Optional callback called before the settlement (claim) transaction is
     *  broadcasted
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be PR_PAID or CLAIM_COMMITED)
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commitAndClaim(
        _signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean,
        onBeforeCommitTxSent?: (txId: string) => void, onBeforeClaimTxSent?: (txId: string) => void,
        secret?: string
    ): Promise<string[]> {
        const signer = isAbstractSigner(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        if(!this.canCommitAndClaimInOneShot()) throw new Error("Cannot commitAndClaim in single action, please run commit and claim separately!");
        this.checkSigner(signer);
        if(this._state===FromBTCLNSwapState.CLAIM_COMMITED) return [await this.claim(signer, abortSignal, onBeforeClaimTxSent, secret)];

        let txCount = 0;
        const txs = await this.txsCommitAndClaim(skipChecks, secret);
        const result = await this.wrapper._chain.sendAndConfirm(
            signer, txs, true, abortSignal, undefined, (txId: string) => {
                txCount++;
                if(onBeforeCommitTxSent!=null && txCount===1) onBeforeCommitTxSent(txId);
                if(onBeforeClaimTxSent!=null && txCount===txs.length) onBeforeClaimTxSent(txId);
                return Promise.resolve();
            }
        );

        this._commitTxId = result[0] ?? this._commitTxId;
        this._claimTxId = result[result.length-1] ?? this._claimTxId;
        if(this._state!==FromBTCLNSwapState.CLAIM_CLAIMED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
        }

        return result;
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
            this._state!==FromBTCLNSwapState.PR_CREATED &&
            (this._state!==FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData!=null)
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
            this._state===FromBTCLNSwapState.PR_PAID ||
            (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData!=null) ||
            this._state===FromBTCLNSwapState.CLAIM_COMMITED ||
            this._state===FromBTCLNSwapState.EXPIRED
        ) {
            //Check for expiry before the getCommitStatus to prevent race conditions
            let quoteExpired: boolean = false;
            if(this._state===FromBTCLNSwapState.PR_PAID || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData!=null)) {
                quoteExpired = quoteDefinitelyExpired ?? await this._verifyQuoteDefinitelyExpired();
            }

            //Check if it's already successfully paid
            commitStatus ??= await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data!);
            if(commitStatus!=null && await this._forciblySetOnchainState(commitStatus)) return true;

            //Set the state on expiry here
            if(this._state===FromBTCLNSwapState.PR_PAID || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData!=null)) {
                if(quoteExpired) {
                    this._state = FromBTCLNSwapState.QUOTE_EXPIRED;
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
    _shouldFetchExpiryStatus(): boolean {
        return this._state===FromBTCLNSwapState.PR_PAID || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData!=null);
    }

    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchOnchainState(): boolean {
        return this._state===FromBTCLNSwapState.PR_PAID || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData!=null) ||
            this._state===FromBTCLNSwapState.CLAIM_COMMITED || this._state===FromBTCLNSwapState.EXPIRED;
    }

    /**
     * Whether an intermediary (LP) should be contacted to get the state of this swap.
     *
     * @internal
     */
    _shouldCheckIntermediary(): boolean {
        return this._state===FromBTCLNSwapState.PR_CREATED || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData==null);
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save?: boolean, quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState, skipLpCheck?: boolean): Promise<boolean> {
        let changed = false;

        if(this._state===FromBTCLNSwapState.PR_CREATED || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData==null)) {
            if(this._state!=FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.getTimeoutTime()<Date.now()) {
                this._state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
                changed ||= true;
            }

            if(!skipLpCheck) try {
                const result = await this._checkIntermediaryPaymentReceived(false);
                if(result!==null) changed ||= true;
            } catch (e) {
                this.logger.error("_sync(): Failed to synchronize swap, error: ", e);
            }

            if(this._state===FromBTCLNSwapState.PR_CREATED || (this._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData==null)) {
                if(await this._verifyQuoteDefinitelyExpired()) {
                    this._state = FromBTCLNSwapState.QUOTE_EXPIRED;
                    changed ||= true;
                }
            }
        }

        if(await this.syncStateFromChain(quoteDefinitelyExpired, commitStatus)) changed = true;

        if(this._state===FromBTCLNSwapState.CLAIM_COMMITED) {
            const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data!);
            if(expired) {
                this._state = FromBTCLNSwapState.EXPIRED;
                changed = true;
            }
        }

        if(save && changed) await this._saveAndEmit();

        return changed;
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _forciblySetOnchainState(commitStatus: SwapCommitState): Promise<boolean> {
        switch(commitStatus.type) {
            case SwapCommitStateType.PAID:
                if(this._claimTxId==null) this._claimTxId = await commitStatus.getClaimTxId();
                if(this.secret==null || this.pr==null) this._setSwapSecret(await commitStatus.getClaimResult());
                this._state = FromBTCLNSwapState.CLAIM_CLAIMED;
                return true;
            case SwapCommitStateType.NOT_COMMITED:
                if(this._refundTxId==null && commitStatus.getRefundTxId) this._refundTxId = await commitStatus.getRefundTxId();
                if(this._refundTxId!=null) {
                    this._state = FromBTCLNSwapState.FAILED;
                    return true;
                }
                break;
            case SwapCommitStateType.EXPIRED:
                if(this._refundTxId==null && commitStatus.getRefundTxId) this._refundTxId = await commitStatus.getRefundTxId();
                this._state = this._refundTxId==null ? FromBTCLNSwapState.QUOTE_EXPIRED : FromBTCLNSwapState.FAILED;
                return true;
            case SwapCommitStateType.COMMITED:
                if(this._state!==FromBTCLNSwapState.CLAIM_COMMITED && this._state!==FromBTCLNSwapState.EXPIRED) {
                    this._state = FromBTCLNSwapState.CLAIM_COMMITED;
                    return true;
                }
                break;
        }
        return false;
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _tick(save?: boolean): Promise<boolean> {
        switch(this._state) {
            case FromBTCLNSwapState.PR_CREATED:
                if(this.getTimeoutTime()<Date.now()) {
                    this._state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNSwapState.PR_PAID:
                if(this.expiry<Date.now()) {
                    this._state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNSwapState.CLAIM_COMMITED:
                const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data!);
                if(expired) {
                    this._state = FromBTCLNSwapState.EXPIRED;
                    if(save) await this._saveAndEmit();
                    return true;
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