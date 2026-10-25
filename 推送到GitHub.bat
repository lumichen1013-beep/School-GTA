@echo off
chcp 65001 >nul
title 學校GTA - 推送至 GitHub
echo ========================================================
echo       【學校GTA】正在推送程式碼至 GitHub...
echo ========================================================
echo.
echo 遠端儲存庫: https://github.com/lumichen1013-beep/School-GTA.git
echo.
git push -u origin main
if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo ✅ 成功推送！您的專案已成功發布至 GitHub：
    echo 👉 https://github.com/lumichen1013-beep/School-GTA
    echo ========================================================
) else (
    echo.
    echo ❌ 推送失敗！請確認是否已在 GitHub 建立名為 School-GTA 的儲存庫。
    echo 快速建立連結: https://github.com/new?name=School-GTA
)
pause
