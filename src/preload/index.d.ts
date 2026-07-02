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

export interface FxTextureResult {
  readonly path: string
  readonly data: Uint8Array
}

export interface FxTextureApi {
  readFxTexture(dataRoot: string, textureName: string): Promise<FxTextureResult | null>
  /** Directory picker for the FX texture data root; null when cancelled. */
  pickFxDataRoot(): Promise<string | null>
}

export interface DdsOpenResult {
  readonly path: string
  readonly data: Uint8Array
}

export interface DdsApi {
  openDds(): Promise<DdsOpenResult | null>
  openDdsPath(path: string): Promise<DdsOpenResult | null>
  saveDds(path: string, data: Uint8Array): Promise<void>
  saveDdsAs(defaultName: string, data: Uint8Array): Promise<string | null>
  importPng(): Promise<DdsOpenResult | null>
  exportPng(defaultName: string, data: Uint8Array): Promise<string | null>
}

export interface AniOpenResult {
  readonly path: string
  readonly data: Uint8Array
}

export interface AniApi {
  openAni(): Promise<AniOpenResult | null>
  openAniPath(path: string): Promise<AniOpenResult | null>
}

export interface FrmOpenResult {
  readonly path: string
  readonly data: Uint8Array
}

export interface FrmApi {
  openFrm(): Promise<FrmOpenResult | null>
  openFrmPath(path: string): Promise<FrmOpenResult | null>
}

export interface EffectIndexResult {
  readonly dirPath: string
  /** Lowercased emitter name -> absolute effect XML path. */
  readonly entries: Readonly<Record<string, string>>
  readonly fileCount: number
}

export interface EffectIndexApi {
  /** Builds (or reuses) the emitter-name index; null when no effect dir. */
  buildEffectIndex(dataRoot: string): Promise<EffectIndexResult | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: PmgApi & FxApi & ExportApi & FxTextureApi & DdsApi & AniApi & FrmApi & EffectIndexApi
  }
}
