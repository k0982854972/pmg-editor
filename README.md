# PMG Editor

瑪奇（Mabinogi）PMG 模型編輯器，內建 FX 特效編輯器。Electron + TypeScript + Three.js 桌面應用。

## 功能

### 模型（PMG）
- 開啟/解析 PMG 模型檔 — 支援全部三種 `pm!` 區塊版本（v1.7 / v2.0 / v3.0）
- 3D 預覽（頂點色、正確的世界矩陣、選取高亮、線框切換、可見性切換）
- 屬性編輯：meshName / stateName / textureName / colorName，存回合法 PMG
- **Round-trip 保證**：未修改的檔案重新序列化為 byte-identical（已用 501 個真實檔案、6,806 個 mesh 區塊驗證）
- 匯出 OBJ（+MTL）與 glTF Binary（GLB）

### 特效（FX）
- 開啟/編輯 `data/gfx/fx/effect/*.xml`（effect_ver8 粒子定義；489 個真實檔案語意 round-trip 驗證）
- 發射器樹狀導覽、任意節點屬性編輯（未知屬性完整保留）
- **ColorOverLife 漸層編輯器**：視覺化漸層條、停駐點（時間/顏色/Alpha）增刪改
- meshdesc 綁定編輯：武器特效綁定（骨骼、effect_name、位移、旋轉）新增/刪除/修改
- 保留原始編碼（UTF-16/UTF-8 含 BOM）寫回

## 開發

```bash
npm install
npm run dev        # 開發模式
npm test           # Vitest（103 tests；samples/corpus 存在時會跑真實語料驗證）
npm run typecheck && npm run lint
npm run build:mac  # 打包 macOS（build:win / build:linux 亦可）
```

## 架構

- `src/core/` — 純 TS，無 Electron 相依：PMG 二進位讀寫、FX XML 解析、匯出器（單元測試完整覆蓋）
- `src/main/` — Electron 主程序：檔案對話框、IPC
- `src/renderer/` — React UI：Three.js viewport、面板、FX 工作區
- `samples/corpus/` — 真實遊戲檔案樣本（gitignored，驗證用）

## 格式重點（實檔驗證）

- 全部 little-endian；`pm!` 區塊 `size` 含 prologue 自身
- LP 字串長度**不含** NUL（實檔無 NUL 結尾）
- bounding 區塊 size 欄位**含自身 4 bytes**（實值 64 = 4 + 5×float3）
- 矩陣為 row-major、平移在索引 3/7/11（p′ = M·p）；glTF 匯出需轉置
- 頂點 36 bytes：pos 3f、normal 3f、色彩 **BGRA** u32、UV 2f（DirectX v，GL 需翻轉）
- 未知區域（unk1/unk2/unk8/unk10/unk18–23/physics/morph trailer）原樣保留以確保 round-trip

## 已知限制（v1）

- 角色模型的骨骼綁定部件以本地座標顯示（`.frm` 骨架尚未支援）
- DDS 貼圖預覽尚未接上（以頂點色＋素色材質顯示）
- 特效粒子即時預覽尚未實作（編輯後請以遊戲內驗證，如 DataModder）
