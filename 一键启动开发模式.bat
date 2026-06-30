@echo off
chcp 65001 >nul
echo ==============================================
echo          AI 人生模拟器 - 开发模式启动
echo ==============================================
echo.
echo 正在启动开发服务器（后台自动预热基础路由）...
echo 预热完成后可直接访问: http://localhost:3000
echo ==============================================
echo.

npm run dev:warm
if errorlevel 1 (
  echo.
  echo 启动失败，请查看上方错误信息。
  pause
)