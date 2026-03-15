$target = 'D:\Documents\GitHub\CRF-Editor'
$badDirs = @('.venv', 'node_modules', '__pycache__', 'dist', 'build', '.pytest_cache')
$badExts = @('*.db', '*.sqlite3')
$found = @()

foreach ($d in $badDirs) {
    $items = Get-ChildItem -Path $target -Recurse -Directory -Filter $d -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        $p = $item.FullName
        if ($p -notlike '*\.git*' -and $p -notlike '*\openspec*' -and $p -notlike '*\.claude*') {
            $found += $p
        }
    }
}

foreach ($ext in $badExts) {
    $items = Get-ChildItem -Path $target -Recurse -Filter $ext -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        $p = $item.FullName
        if ($p -notlike '*\.git*' -and $p -notlike '*\openspec*' -and $p -notlike '*\.claude*') {
            $found += $p
        }
    }
}

if ($found.Count -eq 0) {
    Write-Host 'PASS: No excluded dirs/files found in target'
} else {
    Write-Host 'FAIL: Found excluded items:'
    foreach ($f in $found) { Write-Host "  - $f" }
}
