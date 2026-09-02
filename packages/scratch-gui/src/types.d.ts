declare module '!arraybuffer-loader!.*' {
  declare const value: ArrayBuffer;
  export default value;
}

declare module '!raw-loader!.*' {
  declare const value: string;
  export default value;
}

declare module '@scratch/scratch-paint';

declare module '@scratch/scratch-storage' {
    export class ScratchStorage {
        [key: string]: any;
    }
    export class Asset {
        [key: string]: any;
    }
    export type AssetId = string | number;
}

declare module '@scratch/scratch-vm';
