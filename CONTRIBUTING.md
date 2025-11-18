# 貢獻指南

感謝你有興趣為 School SaaS Platform 做出貢獻！

## 如何貢獻

### 回報 Bug

1. 確認 Bug 尚未被回報（搜尋 [Issues](https://github.com/your-org/school-system-design/issues)）
2. 如果沒有，創建新的 Issue
3. 提供詳細資訊：
   - 重現步驟
   - 預期行為
   - 實際行為
   - 環境資訊（OS、Node.js 版本等）
   - 錯誤訊息與截圖

### 建議新功能

1. 創建新的 Issue，標記為 `enhancement`
2. 描述功能的用途與價值
3. 如果可以，提供實作建議

### 提交程式碼

#### 1. Fork 與 Clone

```bash
# Fork 專案後，clone 到本地
git clone https://github.com/YOUR_USERNAME/school-system-design.git
cd school-system-design

# 添加上游倉庫
git remote add upstream https://github.com/original-org/school-system-design.git
```

#### 2. 建立分支

```bash
# 更新主分支
git checkout main
git pull upstream main

# 建立功能分支
git checkout -b feature/your-feature-name

# 或修復分支
git checkout -b fix/bug-description
```

#### 3. 開發

遵循我們的 [開發指南](./docs/08-development-guide.md)：

- 使用 TypeScript
- 遵循 ESLint 規則
- 撰寫測試（單元測試 + 整合測試）
- 保持測試覆蓋率 > 80%
- 遵循 Conventional Commits 規範

#### 4. Commit 規範

使用 Conventional Commits 格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新功能
- `fix`: 錯誤修復
- `docs`: 文檔更新
- `style`: 程式碼格式（不影響功能）
- `refactor`: 重構
- `test`: 測試
- `chore`: 建置工具或輔助工具

**範例:**
```
feat(sis): add student bulk import from Excel

Implement Excel file upload and parsing for bulk student creation.
Supports .xlsx and .csv formats.

Closes #123
```

#### 5. 測試

```bash
# 執行測試
cd backend
npm test

# 檢查覆蓋率
npm run test:coverage

# Lint 檢查
npm run lint
```

#### 6. 提交 Pull Request

```bash
# 推送到你的 fork
git push origin feature/your-feature-name
```

然後在 GitHub 上創建 Pull Request：

1. 填寫 PR 模板
2. 描述變更內容
3. 關聯相關 Issue（使用 `Closes #123`）
4. 確保 CI 測試通過
5. 等待 Code Review

### Code Review 流程

1. 至少需要一位維護者批准
2. 所有 CI 檢查必須通過
3. 解決所有 Review 意見
4. Squash merge 保持歷史乾淨

## 開發環境設置

請參考 [開發指南](./docs/08-development-guide.md)。

## 編碼規範

### TypeScript

- 使用明確的型別定義
- 避免 `any`
- 使用 `async/await` 而非 callbacks
- 命名規範：
  - Classes: `PascalCase`
  - Functions/Variables: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`

### 測試

- 每個功能都要有測試
- 測試命名清晰描述行為
- 使用 AAA 模式（Arrange, Act, Assert）

### 文檔

- 複雜邏輯加入註解
- 公開 API 需要 JSDoc
- 更新 README 與相關文檔

## 需要幫助？

- 查看 [文檔](./docs/)
- 提問於 [Discussions](https://github.com/your-org/school-system-design/discussions)
- 聯絡維護者

## 行為準則

請保持友善、尊重與專業。我們致力於為所有人提供友善的協作環境。

---

再次感謝你的貢獻！ 🎉
