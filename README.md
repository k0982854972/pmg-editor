# PMG Editor

瑪奇（Mabinogi）PMG 模型編輯器，內建 FX 特效編輯器、DDS 貼圖工具與 ANI 動畫檢視器。Electron + TypeScript + Three.js 桌面應用。

## 功能

### 模型（PMG）
- 開啟/解析 PMG 模型檔 — 支援全部三種 `pm!` 區塊版本（v1.7 / v2.0 / v3.0）
- 3D 預覽：頂點色、正確世界矩陣、選取高亮、線框切換、可見性切換、**自動適應視圖**（鏡頭對準模型、網格跟隨模型腳下；左鍵旋轉、右鍵平移、滾輪縮放）
- 屬性編輯：meshName / stateName / textureName / colorName，存回合法 PMG
- **Round-trip 保證**：未修改的檔案重新序列化為 byte-identical（已用 501 個真實檔案、6,806 個 mesh 區塊驗證）
- 匯出 OBJ（+MTL）與 glTF Binary（GLB）

### 特效（FX）
- 開啟/編輯 `data/gfx/fx/effect/*.xml`（effect_ver8 粒子定義；489 個真實檔案語意 round-trip 驗證）
- 發射器以 `name` 屬性顯示（如 dark_wind01），樹狀導覽、任意節點屬性編輯（未知屬性完整保留）
- **ColorOverLife 漸層編輯器**：視覺化漸層條、停駐點（時間/顏色/Alpha）增刪改
- **即時粒子預覽**：播放/暫停/循環，編輯參數即時反映；「選擇資料夾」指向解包的 `data`（或 `material`）即載入真實 DDS 貼圖圖集，每張貼圖有 ✓/✗ 載入狀態提示
- **meshdesc 綁定編輯＋即時預覽**：開啟 tool XML 自動載入同名 PMG 渲染模型，特效即時錨定在對應骨骼位置；骨骼為下拉選單（PMG 骨骼＋常用工具骨骼）；特效名稱可「選擇特效檔」後從內部發射器挑選
- 保留原始編碼（UTF-16/UTF-8 含 BOM）寫回

### 貼圖（DDS）
- 檢視 DXT1/3/5、DX10（BC1–BC3）、非壓縮 16/24/32-bit 貼圖（484 個真實貼圖驗證）
- 匯出 PNG；**從 PNG 取代**：同尺寸圖片重新編碼為「原本的壓縮格式」，檔頭位元組完整保留、mipmap 鏈重建——格式不變不破壞
- 不支援編輯的格式（cubemap/volume 等）仍可檢視資訊，按鈕會以提示說明原因

### 動畫（ANI）
- 開啟 `.ani` 骨骼動畫：版本、骨骼軌道數、總時長、關鍵幀總數
- 每根骨骼的關鍵幀表（時間/位置/四元數）與 XYZ 位置曲線圖
- 播放預覽需要 FRM 骨架支援（規劃中）

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

## 已知限制

- 角色模型的骨骼綁定部件以本地座標顯示（`.frm` 骨架與 ANI 播放預覽規劃中）
- 模型 3D 檢視以頂點色＋素色材質顯示（模型本體 DDS 貼圖尚未接到 viewport）
- 特效粒子預覽為近似模擬（引擎精確混合行為未公開），最終效果以遊戲內為準（DataModder 套用）
- 修改遊戲檔案屬遊戲改造行為，請自行評估所在伺服器的規範與風險

## 免責聲明

本工具為社群逆向工程成果，僅供學習與研究使用，與 Nexon / devCAT 無任何關聯。
