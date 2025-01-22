import { BitcoinRpc, ChainType } from "@atomiqlabs/base";
import { BitcoinNetwork, CtorChainData, SwapperOptions } from "@atomiqlabs/sdk-lib";
import { AssetData } from "../SmartChainAssets";
export type SdkChainType = {
    ChainType: ChainType;
    Options: {};
    Assets: AssetData;
};
export type SdkChain<T extends SdkChainType> = {
    getCtorData: (options: SwapperOptions, bitcoinRpc: BitcoinRpc<any>, network: BitcoinNetwork) => CtorChainData<T["ChainType"]>;
    assets: AssetData;
    chainIdentifier: string;
};
