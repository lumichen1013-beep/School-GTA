@echo off
chcp 65001 >nul
title 部署學校GTA到 Cloudflare Pages
cls
echo ========================================================
echo       【學校GTA】部署到 Cloudflare Pages (永久網址)
echo ========================================================
echo.

:: 步驟 1: 打包前端程式碼
echo [步驟 1/3] 正在打包最新遊戲程式碼 (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ❌ 打包失敗，請檢查上方錯誤訊息！
    pause
    exit /b %errorlevel%
)
echo.
echo ✔ 打包完成！

:: 步驟 2: 檢查 Cloudflare 登入狀態
echo.
echo [步驟 2/3] 正在檢查 Cloudflare 登入狀態...
call npx wrangler whoami >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ⚠️ 尚未登入 Cloudflare！
    echo 正在為您開啟瀏覽器登入授權頁面...
    echo (瀏覽器彈出後，請登入 Cloudflare 帳號並點擊「Allow」授權)
    echo.
    call npx wrangler login
    if %errorlevel% neq 0 (
        echo.
        echo ❌ Cloudflare 授權失敗或已取消。
        echo.
        echo 💡 替代方案：您可以直接登入 https://dash.cloudflare.com/
        echo    點選「Workers 與 Pages」->「建立」->「Pages」->「上傳資產」，
        echo    直接將本專案的 dist 資料夾拖曳上傳即可！
        pause
        exit /b 1
    )
)
echo ✔ 已成功連接 Cloudflare 帳號！

:: 步驟 3: 設定專案名稱並部署
echo.
echo [步驟 3/3] 準備部署至 Cloudflare Pages...
set PROJECT_NAME=school-gta
echo --------------------------------------------------------
echo 提示：專案名稱將決定您的網址 (https://[專案名稱].pages.dev)
set /p USER_INPUT="請輸入專案名稱 (直接按 Enter 使用預設 [%PROJECT_NAME%]): "
if not "%USER_INPUT%"=="" set PROJECT_NAME=%USER_INPUT%
echo 正在部署至專案: %PROJECT_NAME% ...
echo --------------------------------------------------------

:: 若專案尚未建立，嘗試建立專案（若已存在會自動忽略）
call npx wrangler pages project create %PROJECT_NAME% --production-branch main >nul 2>&1

:: 執行上傳部署
call npx wrangler pages deploy dist --project-name %PROJECT_NAME%
if %errorlevel% neq 0 (
    echo.
    echo ❌ 部署失敗！
    echo --------------------------------------------------------
    echo 常見原因：
    echo 1. 專案名稱 "%PROJECT_NAME%" 已被全球其他 Cloudflare 使用者佔用。
    echo    - 解決方法：重新執行本腳本，並輸入一個獨特的名稱（例如：school-gta-%random%）
    echo.
    echo 2. 免安裝任何工具的網頁部署法（推薦最穩）：
    echo    a. 打開瀏覽器訪問 https://dash.cloudflare.com/
    echo    b. 進入「Workers 與 Pages」->「建立」->「Pages」->「上傳資產」
    echo    c. 隨意填寫專案名稱，並將專案中的 "dist" 資料夾拖曳放進去
    echo    d. 點擊「部署」，立刻獲得永久免費的 https://xxx.pages.dev 網址！
    echo --------------------------------------------------------
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo 🎉 部署成功！
echo 請複製上方終端機顯示的網址（例如 https://%PROJECT_NAME%.pages.dev）
echo ========================================================
pause
