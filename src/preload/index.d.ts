import { ElectronAPI } from '@electron-toolkit/preload'

export interface PmgOpenResult {
  readonly path: string
  readonly data: Uint8Array
}

export interface PmgApi {
  openPmg(): Promise<PmgOpenResult | null>
  openPmgPath(path: string): Promise<PmgOpenResult | null>
  savePmg(path: string, data: Uint8Array): Promise<void>
  savePmgAs(defaultName: string, data: Uint8Array): Promise<string | null>
}

export interface FxOpenResult {
  readonly path: string
  readonly data: Uint8Array
}

export interface FxApi {
  openFx(): Promise<FxOpenResult | null>
  openFxPath(path: string): Promise<FxOpenResult | null>
  saveFx(path: string, data: Uint8Array): Promise<void>
  saveFxAs(defaultName: string, data: Uint8Array): Promise<string | null>
}

export interface ExportApi {
  exportObj(defaultName: string, obj: string, mtl: string): Promise<string | null>
  exportGlb(defaultName: string, data: Uint8Array): Promise<string | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: PmgApi & FxApi & ExportApi
  }
}
