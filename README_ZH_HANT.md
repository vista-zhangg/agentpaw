<div align="center">
  <img src="assets/agentpaw-icon.png" width="112" alt="AgentPaw AI 桌面夥伴圖示">
  <h1>AgentPaw — Codex / Claude Code 桌面寵物</h1>
  <p><strong>把喜歡的 GIF 變成桌面夥伴，隨時掌握 AI 任務進度與使用額度。</strong></p>
  <p>多角色桌面寵物 · 自訂 GIF · AI 程式開發任務提醒 · Codex 訂閱額度監控 · Token 統計 · 休息提醒</p>
  <p>支援 Codex、Claude Code、WorkBuddy、opencode。</p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README_ZH_HANS.md">简体中文</a> ·
    <a href="README_ZH_HANT.md">繁體中文</a> ·
    <a href="README_FR.md">Français</a>
  </p>
  <p>
    <a href="https://github.com/vista-zhangg/codex-desktop-pet/releases/latest"><strong>下載 Windows 安裝程式</strong></a> ·
    <a href="https://github.com/vista-zhangg/codex-desktop-pet/releases/tag/v1.9.12">1.9.12 更新說明</a> ·
    <a href="docs/介绍.md">完整使用指南（簡體中文）</a>
  </p>
  <p>
    <a href="https://github.com/vista-zhangg/codex-desktop-pet/actions/workflows/ci.yml"><img src="https://github.com/vista-zhangg/codex-desktop-pet/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <img src="https://img.shields.io/badge/platform-Windows%20x64-0078D4?logo=windows" alt="僅支援 Windows x64">
    <img src="https://img.shields.io/badge/version-1.9.12-F6A04A" alt="Version 1.9.12">
    <a href="LICENSE"><img src="https://img.shields.io/badge/code%20license-MIT-2EA44F" alt="MIT License"></a>
  </p>
</div>

> [!IMPORTANT]
> 目前**僅支援 Windows x64**，不支援 macOS、Linux 或 Windows on ARM。應用程式介面支援 English、简体中文與繁體中文，預設 English。Windows 安裝程式尚未進行商業程式碼簽章，首次執行時可能出現 SmartScreen 提示。

**AgentPaw**是獨立的開放原始碼專案，與 OpenAI、Anthropic 無隸屬關係。專案免費且非營利，供個人桌面陪伴、學習與交流使用，不販售角色素材或付費下載。

## 可以做什麼

讓 Codex 任務進度、5 小時／7 天訂閱額度與 Token 用量常駐桌面，並彙整其他 AI 程式開發工具的本機工作階段。工作時顯示狀態，需要你回應時提醒，任務完成時通知；沒有 AI 任務執行時，也能提醒你喝水、伸展與休息。

- **一個夥伴，四種 Agent**：支援 Codex、Claude Code、WorkBuddy、opencode。
- **角色與自訂 GIF**：內建打工貓、奶茶鼠、小蜜蜂蜜蜜與線條小狗。可用一張待命 GIF 建立自己的角色，或匯入整套[角色包](docs/character-packs.md)；各角色的動作、輪換與還原設定獨立保存。
- **任務狀態與授權**：顯示工作、思考、並行、等待授權、等待回覆、完成與錯誤等狀態。Claude Code 支援的授權請求可直接在桌面夥伴上允許、拒絕或始終允許；其他工具提供唯讀提醒。
- **清楚的授權卡片**：標題、專案、命令與操作按鈕採用一致的圓角風格；回答輸入框只在需要時顯示，長內容可捲動。
- **提醒與行動中心**：可選標準或僅需處理的通知，依工具或專案靜音，查看最近事件、設定工作階段別名與關注；全域快捷鍵預設停用，可自行設定。
- **額度與用量**：托盤選單顯示 Codex 目前的遮蔽帳號、5 小時／7 天剩餘額度與重設時間。詳細面板提供工具與日期篩選、90 天 Token 活動熱圖、快取與模型資訊，以及歷史累計。
- **隱私與接入檢查**：可一鍵隱藏敏感明細，並在設定中檢查、修復或移除 AgentPaw 管理的工具接入。
- **工作與休息節奏**：支援喝水、伸展與遠眺提醒，可調整間隔、延後提醒或今天略過。全螢幕時自動隱藏，也可暫時安靜；角色與精簡膠囊模式共用設定。

| 打工貓 · 工作中 | 奶茶鼠 · 工作中 | 小蜜蜂蜜蜜 · 打招呼 | 線條小狗 · 工作中 |
| --- | --- | --- | --- |
| ![打工貓](assets/cat/cat-working.gif) | ![奶茶鼠](assets/characters/milktea-mouse/13.gif) | ![小蜜蜂蜜蜜](assets/characters/mimi-bee/01.gif) | ![線條小狗](assets/characters/line-dog/set2-18.gif) |

## 安裝與升級

從[最新 Release](https://github.com/vista-zhangg/codex-desktop-pet/releases/latest) 下載 `AgentPaw-1.9.12-Windows-x64.exe`，執行安裝程式後啟動 AgentPaw。已安裝的使用者可透過應用程式內更新升級，或執行新版安裝程式；現有設定與本機用量紀錄會保留。

Release 提供 Windows x64 EXE 安裝程式；`latest.yml` 供自動更新使用，無須手動下載。不提供 ZIP 可攜版。原始碼啟動與 npm 指令僅供開發者使用，請參閱[本機開發與打包手冊](docs/LOCAL_DEPLOYMENT.md)。

## 資料與隱私

程式名稱為 `AgentPaw.exe`，設定、角色與用量紀錄保存在 `~/.agentpaw/`。升級遷移舊版資料時會保留原目錄作為復原備份。

工作階段與用量資料在本機讀取及處理。models.dev 僅提供公開價格表；Codex 訂閱額度透過 Codex 自己的 App Server 讀取，認證由 Codex 負責，AgentPaw 不讀取 `~/.codex/auth.json` 的內容。隱私模式會遮蔽畫面上的敏感資訊，本機監控與統計仍持續運作。

面板金額是記錄或換算的參考值，不等同於訂閱帳單或最終結算。完整說明見[隱私與資料邊界](docs/PRIVACY.md)。

## 授權、署名與貢獻

本專案基於 [LLMPET](https://github.com/myunwang/LLMPET) 二次開發，保留上游 MIT 授權與原始版權聲明，見 [LICENSE](LICENSE)。第三方角色素材不包含在程式碼的 MIT 授權內；原創作者、來源與使用範圍見[角色素材總覽](assets/CREDITS.md)、[打工貓](assets/cat/CREDITS.md)、[奶茶鼠](assets/characters/milktea-mouse/CREDITS.md)、[小蜜蜂蜜蜜](assets/characters/mimi-bee/CREDITS.md)及[線條小狗](assets/characters/line-dog/CREDITS.md)。自行匯入素材時，請確認使用授權。

歡迎透過 [Issues](https://github.com/vista-zhangg/codex-desktop-pet/issues) 回報問題，或依[貢獻指南](CONTRIBUTING.md)提交改進。詳細接入矩陣與工作原理請參閱[簡體中文 README](README_ZH_HANS.md)。
