import {
    ChainEvent,
    ChainSwapType,
    ChainType,
    InitializeEvent,
    SpvVaultClaimEvent,
    SpvVaultCloseEvent,
    SpvVaultFrontEvent,
    SwapEvent
} from "@atomiqlabs/base";
import {ISwap} from "../swaps/ISwap";
import {EventListener} from "@atomiqlabs/base/src/events/ChainEvents";
import {SwapType} from "../enums/SwapType";
import {UnifiedSwapStorage} from "../storage/UnifiedSwapStorage";

import {getLogger} from "../utils/Logger";

function chainEventToEscrowHash(event: ChainEvent<any>): string | undefined {
    if(event instanceof SwapEvent) return event.escrowHash;
    if(
        event instanceof SpvVaultFrontEvent ||
        event instanceof SpvVaultClaimEvent ||
        event instanceof SpvVaultCloseEvent
    ) return event.btcTxId;
}

export type SwapEventListener<
    T extends ChainType,
    S extends ISwap<T>
> = (event: ChainEvent<T["Data"]>, swap: S) => Promise<void>;

const logger = getLogger("UnifiedSwapEventListener: ");

export class UnifiedSwapEventListener<
    T extends ChainType
> {

    readonly storage: UnifiedSwapStorage<T>;
    readonly events: T["Events"];
    readonly listeners: {
        [key in SwapType]?: {
            listener: SwapEventListener<T, any>,
            reviver: new (obj: any) => ISwap<T>
        }
    } = {};

    constructor(unifiedStorage: UnifiedSwapStorage<T>, events: T["Events"]) {
        this.storage = unifiedStorage;
        this.events = events;
    }

    async processEvents(events: ChainEvent<T["Data"]>[]) {
        const escrowHashesDeduped = new Set<string>();
        events.forEach(event => {
            const escrowHash = chainEventToEscrowHash(event);
            if(escrowHash!=null) escrowHashesDeduped.add(escrowHash);
        });
        const escrowHashes = Array.from(escrowHashesDeduped);

        logger.debug("processEvents(): Processing events with escrow hashes: ", escrowHashes);

        const swaps = await this.storage.query<ISwap<T>>(
            [
                [{key: "escrowHash", value: escrowHashes}]
            ],
            (val: any) => {
                const obj = this.listeners?.[val.type as SwapType];
                if(obj==null) return null;
                return new obj.reviver(val);
            }
        );
        const swapsByEscrowHash: {[key: string]: ISwap<T>} = {};
        swaps.forEach(swap => {
            const escrowHash = swap._getEscrowHash();
            if(escrowHash!=null) swapsByEscrowHash[escrowHash] = swap;
        });

        //We need to do this because FromBTCLNAutoSwaps might not yet know its escrowHash
        // hence we try to get the claimHash and try to query based on that, FromBTCLNAutoSwaps
        // will use their claimHash as escrowHash before they know the real escrowHash
        const htlcCheckInitializeEvents: {[claimHash: string]: InitializeEvent<T["Data"]>} = {};

        for(let event of events) {
            const escrowHash = chainEventToEscrowHash(event);
            if(escrowHash!=null) {
                const swap = swapsByEscrowHash[escrowHash];
                if(swap!=null) {
                    const obj = this.listeners[swap.getType()];
                    if(obj==null) continue;
                    await obj.listener(event, swap);
                    continue;
                }
            }
            if(event instanceof InitializeEvent) {
                if(event.swapType===ChainSwapType.HTLC) {
                    const swapData: T["Data"] = await event.swapData();
                    htlcCheckInitializeEvents[swapData.getClaimHash()] = event;
                }
            }
        }

        logger.debug("processEvents(): Additionally checking HTLC claim hashes: ", Object.keys(htlcCheckInitializeEvents));

        if(Object.keys(htlcCheckInitializeEvents).length===0) return;

        //Try to query based on claimData
        const claimDataSwaps = await this.storage.query<ISwap<T>>(
            [
                [{key: "escrowHash", value: Object.keys(htlcCheckInitializeEvents)}]
            ],
            (val: any) => {
                const obj = this.listeners?.[val.type as SwapType];
                if(obj==null) return null;
                return new obj.reviver(val);
            }
        );
        const swapsByClaimDataHash: {[claimData: string]: ISwap<T>} = {};
        claimDataSwaps.forEach(swap => {
            const escrowHash = swap._getEscrowHash();
            if(escrowHash!=null) swapsByClaimDataHash[escrowHash] = swap;
        });

        logger.debug("processEvents(): Additional HTLC swaps founds: ", swapsByClaimDataHash);

        for(let claimData in htlcCheckInitializeEvents) {
            const event = htlcCheckInitializeEvents[claimData];
            const swap = swapsByClaimDataHash[claimData];
            if(swap!=null) {
                const obj = this.listeners[swap.getType()];
                if(obj==null) continue;
                await obj.listener(event, swap);
            }
        }

    }

    listener?: EventListener<T["Data"]>;
    async start() {
        if(this.listener!=null) return;
        logger.info("start(): Starting unified swap event listener");
        await this.storage.init();
        logger.debug("start(): Storage initialized");
        await this.events.init();
        logger.debug("start(): Events initialized");
        this.events.registerListener(this.listener = async (events) => {
            await this.processEvents(events);
            return true;
        });
        logger.info("start(): Successfully initiated the unified swap event listener!");
    }

    stop(): Promise<void> {
        logger.info("stop(): Stopping unified swap event listener");
        if(this.listener!=null) this.events.unregisterListener(this.listener);
        return this.events.stop();
    }

    registerListener<S extends ISwap<T>>(type: SwapType, listener: SwapEventListener<T, S>, reviver: new (val: any) => S): void {
        this.listeners[type] = {
            listener,
            reviver
        };
    }

    unregisterListener(type: SwapType): boolean {
        if(this.listeners[type]) return false;
        delete this.listeners[type];
        return true;
    }

}
