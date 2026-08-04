$ref = "C:\Users\kayia\Downloads\ai-agent-hub-v5\ai-agent-hub"
$local = "C:\dev\ai-agent-hub"

$refFiles = Get-ChildItem $ref -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules|\.git\\' } | ForEach-Object { $_.FullName.Substring($ref.Length + 1) }
$localFiles = Get-ChildItem $local -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules|\.git\\' } | ForEach-Object { $_.FullName.Substring($local.Length + 1) }

Write-Host "`n=== MISSING locally ===" -ForegroundColor Yellow
Compare-Object $refFiles $localFiles | Where-Object { $_.SideIndicator -eq "<=" } | ForEach-Object { Write-Host $_.InputObject }

Write-Host "`n=== EXTRA locally ===" -ForegroundColor Cyan
Compare-Object $refFiles $localFiles | Where-Object { $_.SideIndicator -eq "=>" } | ForEach-Object { Write-Host $_.InputObject }

Write-Host "`n=== CONTENT MISMATCHES ===" -ForegroundColor Red
$common = $refFiles | Where-Object { $localFiles -contains $_ }
foreach ($f in $common) {
    $refHash = (Get-FileHash (Join-Path $ref $f)).Hash
    $localHash = (Get-FileHash (Join-Path $local $f)).Hash
    if ($refHash -ne $localHash) {
        Write-Host $f
    }
}

Write-Host "`n=== Done ===" -ForegroundColor Green
