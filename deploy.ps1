$ServerIP = "107.170.33.75"
$User = "root"
$DeployDir = "/var/www/nglobal"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Iniciando despliegue hacia $ServerIP..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "Empaquetando el proyecto..." -ForegroundColor Yellow
tar.exe -czvf deploy.tar.gz --exclude=node_modules --exclude=.git --exclude=dist --exclude=dist-desktop --exclude=deploy.tar.gz --exclude=setup.sh --exclude=.env --exclude=.vscode --exclude=.idea --exclude=*.log --exclude=Thumbs.db --exclude=android/.gradle --exclude=android/build --exclude=android/app/build --exclude=android/app/src/main/assets/public --exclude=supabase/.temp .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al empaquetar el proyecto." -ForegroundColor Red
    exit 1
}

Write-Host "Subiendo el proyecto al servidor..." -ForegroundColor Yellow
scp deploy.tar.gz setup.sh ${User}@${ServerIP}:/root/
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al subir el archivo al servidor." -ForegroundColor Red
    exit 1
}

Write-Host "Ejecutando configuracion remota..." -ForegroundColor Yellow
ssh ${User}@${ServerIP} "bash /root/setup.sh"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Despliegue completado con exito!" -ForegroundColor Green
} else {
    Write-Host "Ocurrio un error en el servidor." -ForegroundColor Red
}

Remove-Item deploy.tar.gz -ErrorAction SilentlyContinue
