param(
    [string]$ServiceWorkerPath = (Join-Path $PSScriptRoot 'sw.js')
)

$version = Get-Date -Format 'yyyyMMddHHmmss'
$source = Get-Content -Raw -Encoding UTF8 -LiteralPath $ServiceWorkerPath
$updated = [regex]::Replace(
    $source,
    "const APP_VERSION = '[^']+';",
    "const APP_VERSION = '$version';",
    1
)

if ($updated -eq $source) {
    throw 'APP_VERSION not found in sw.js'
}

[System.IO.File]::WriteAllText(
    $ServiceWorkerPath,
    $updated,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Output "Release version $version"
