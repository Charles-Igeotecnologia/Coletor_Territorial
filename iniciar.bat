@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Coletor Territorial - iniciando servidor local
echo ============================================
echo.
echo NAO FECHE esta janela enquanto estiver usando o app.
echo Para encerrar, feche esta janela ou pressione Ctrl+C.
echo.

start "" http://localhost:8080/

python -m http.server 8080
if errorlevel 1 (
  echo.
  echo [ERRO] Nao foi possivel iniciar o servidor Python.
  echo Verifique se o Python esta instalado e disponivel no PATH.
  pause
)
