<#
.SYNOPSIS
    Move local Office settings from a pre-sync stash into the current checkout.

.DESCRIPTION
    Runs the whole recovery in one pass: inventory, classification, selective
    recovery and validation. The stash is only ever read. This script never runs
    git stash pop, apply, drop or clear, and never runs git reset --hard or
    git clean, so the stash stays available as rollback evidence either way.

    Implementation files inside the stash are reported and skipped, so the
    Living Lodge UI and the backend cannot be reverted by accident. Everything
    the script touches is backed up first and a rollback script is written next
    to the report.

.EXAMPLE
    .\scripts\recover_local_settings.ps1

.EXAMPLE
    .\scripts\recover_local_settings.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$Repo = (Split-Path -Parent $PSScriptRoot),
    [string]$Stash = 'local-before-sync-20260910',
    [int]$Port = 19119,
    [string]$Python,
    [switch]$DryRun,
    [switch]$SkipPreview
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$env:PYTHONIOENCODING = 'utf-8'

function Say([string]$text, [string]$colour = 'Gray') { Write-Host $text -ForegroundColor $colour }
function Under([string]$root, [string[]]$parts) {
    # Join-Path with more than two segments needs PowerShell 7, so fold instead.
    $path = $root
    foreach ($part in $parts) { $path = Join-Path $path $part }
    return $path
}
function Head([string]$text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }

$Repo = (Resolve-Path $Repo).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$workspace = Join-Path $Repo ".recovery-$stamp"
New-Item -ItemType Directory -Force -Path $workspace | Out-Null

$python = $Python
if (-not $python) {
    $python = Under $Repo @('.venv', 'Scripts', 'python.exe')
    if (-not (Test-Path $python)) { $python = 'python.exe' }
}

Head 'Phase 0 - environment'
Say "  repo       : $Repo"
Say "  python     : $python"
Say "  workspace  : $workspace"
Push-Location $Repo
try {
    $head = (& git rev-parse HEAD).Trim()
    $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
    Say "  HEAD       : $head ($branch)"
    $stashList = & git stash list
    if (-not $stashList) { throw 'NO_STASH_PRESENT: git stash list is empty.' }
    Say '  stash list :'
    $stashList | ForEach-Object { Say "      $_" }
    if (-not ($stashList -match [regex]::Escape($Stash))) {
        throw "STASH_NOT_FOUND: no stash entry mentions '$Stash'. Nothing was changed."
    }

    Head 'Phase 1+2 - inventory and classification (read only)'
    $planPath = Join-Path $workspace 'plan.json'
    & $python (Under $Repo @('scripts', 'recover_local_settings.py')) `
        --repo $Repo --stash $Stash --workspace (Join-Path $workspace 'plan') |
        Tee-Object -FilePath $planPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Inventory failed; see $planPath" }
    $plan = Get-Content $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $plan.recovery.summary.PSObject.Properties | ForEach-Object {
        Say ("  {0,-20} {1}" -f $_.Name, $_.Value)
    }
    Say '  planned actions:'
    $plan.recovery.actions | Where-Object { $_.action -ne 'SKIPPED' } |
        ForEach-Object { Say ("      {0,-16} {1}" -f $_.action, $_.path) }
    Say '  left alone (new code / audit):' 'DarkGray'
    $plan.recovery.actions | Where-Object { $_.action -eq 'SKIPPED' } |
        ForEach-Object { Say ("      {0,-16} {1}" -f $_.category, $_.path) 'DarkGray' }

    if ($DryRun) {
        Head 'Dry run - nothing was written'
        Say "  full report: $planPath" 'Yellow'
        return
    }

    Head 'Phase 3 - selective recovery'
    $reportPath = Join-Path $workspace 'recovery.json'
    & $python (Under $Repo @('scripts', 'recover_local_settings.py')) `
        --repo $Repo --stash $Stash --workspace $workspace --apply |
        Tee-Object -FilePath $reportPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Recovery failed; see $reportPath" }
    $report = Get-Content $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $report.recovery.actions | Where-Object { $_.action -ne 'SKIPPED' } |
        ForEach-Object { Say ("      {0,-16} {1}" -f $_.action, $_.path) 'Green' }

    $backupRoot = Join-Path $workspace 'backups'
    if (Test-Path $backupRoot) {
        $rollback = Join-Path $workspace 'rollback.ps1'
        @(
            '# Undo this recovery by putting every backed-up file back.',
            "`$ErrorActionPreference = 'Stop'",
            "Get-ChildItem -Recurse -File '$backupRoot' | ForEach-Object {",
            "    `$target = Join-Path '$Repo' `$_.FullName.Substring($($backupRoot.Length + 1))",
            "    New-Item -ItemType Directory -Force -Path (Split-Path `$target) | Out-Null",
            "    Copy-Item `$_.FullName `$target -Force",
            "    Write-Host `"restored `$target`"",
            '}'
        ) | Set-Content -Path $rollback -Encoding UTF8
        Say "  rollback script: $rollback" 'Yellow'
    }

    Head 'Phase 4 - verification'
    $gate = [ordered]@{}

    $dirty = @(& git status --porcelain | Where-Object { $_ -notmatch '^\?\?' })
    $allowedData = @('asset-positions.json', 'asset-defaults.json', 'frontend/creator-residents.json')
    $badCode = @()
    foreach ($line in $dirty) {
        $path = ($line.Substring(3)).Trim().Replace('\', '/').Trim('"')
        $ok = ($allowedData -contains $path) -or ($path -like 'frontend/renguin-characters/*')
        if (-not $ok) { $badCode += $path }
    }
    $gate['OLD_CODE_RESTORED'] = if ($badCode.Count) { 'YES -> ' + ($badCode -join ', ') } else { 'NO' }

    $lodge = @('frontend/creator-lodge.css', 'frontend/creator-ambience.css', 'frontend/creator-ambience.js')
    $missing = $lodge | Where-Object { -not (Test-Path (Join-Path $Repo $_)) }
    $indexed = (Select-String -Path (Under $Repo @('frontend', 'index.html')) -Pattern 'creator-lodge\.css|creator-ambience\.js' -AllMatches).Count
    $gate['NEW_UI_PRESERVED'] = if ($missing.Count -eq 0 -and $indexed -ge 2) { 'YES' } else { 'NO' }

    Say '  running tests...'
    $testOut = & $python -m unittest discover -s tests 2>&1 | Out-String
    $gate['PYTHON_TESTS'] = if ($testOut -match '\bOK\b') { (($testOut -split "`n" | Where-Object { $_ -match '^Ran ' }) -join ' ').Trim() + ' OK' } else { 'FAIL' }
    if ($gate['PYTHON_TESTS'] -eq 'FAIL') { $testOut | Set-Content (Join-Path $workspace 'tests-failed.txt') -Encoding UTF8 }

    if (Get-Command node -ErrorAction SilentlyContinue) {
        $truth = & node (Under $Repo @('tests', 'test_creator_truth.cjs')) 2>&1 | Out-String
        $gate['AGENT_TRUTH'] = if ($truth -match '"result"\s*:\s*"PASS"') { 'PASS' } else { 'FAIL' }
        $suites = & node --test (Under $Repo @('tests', 'creator-ambience.test.cjs')) (Under $Repo @('tests', 'creator-scene.test.cjs')) (Under $Repo @('tests', 'creator-contexts.test.cjs')) (Under $Repo @('tests', 'browser-bridge.test.cjs')) 2>&1 | Out-String
        $gate['NODE_SUITES'] = if ($suites -match '#\s*fail\s+0') { 'PASS' } else { 'FAIL' }
    } else {
        $gate['AGENT_TRUTH'] = 'SKIPPED (node not on PATH)'
        $gate['NODE_SUITES'] = 'SKIPPED (node not on PATH)'
    }

    if (-not $SkipPreview) {
        Say "  starting the Preview on $Port..."
        $previewRaw = & $python (Under $Repo @('scripts', 'launch_preview.py')) --port $Port --server-only 2>&1 | Out-String
        $previewRaw | Set-Content (Join-Path $workspace 'preview.json') -Encoding UTF8
        try {
            $preview = $previewRaw | ConvertFrom-Json
            $gate['PREVIEW_PORT'] = "PASS ($($preview.preview_url))"
            $gate['LOADED_VERSION'] = $preview.loaded_version
            $gate['REVISION_MATCH'] = $preview.revision_match
            $gate['IDENTITY_VERIFIED'] = $preview.identity_verified
            $code = (Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 20).StatusCode
            $gate['HTTP'] = $code
        } catch {
            $gate['PREVIEW_PORT'] = "FAIL - see $(Join-Path $workspace 'preview.json')"
        }
    }

    $after = $report.after
    $store = $after.production
    if ($store) {
        $gate['PROJECTS'] = "$($store.projects) (named $($store.named_projects), covers $($store.covers), workflow $($store.with_workflow))"
        $gate['CAST_ASSIGNED'] = $store.cast_assigned
        $gate['INBOX'] = $store.inbox
    } else {
        $gate['PROJECTS'] = 'no presentation store on disk'
    }
    $gate['DANGLING_CAST_REFS'] = $after.dangling_resident_references.Count
    $gate['STASH_PRESERVED'] = if ((& git stash list) -match [regex]::Escape($Stash)) { 'YES' } else { 'NO' }

    Head 'Result'
    foreach ($key in $gate.Keys) {
        $value = $gate[$key]
        $colour = 'Green'
        if ("$value" -match 'FAIL|^NO$|^YES ->') { $colour = 'Red' }
        if ($key -eq 'OLD_CODE_RESTORED' -and "$value" -eq 'NO') { $colour = 'Green' }
        if ("$value" -match 'SKIPPED') { $colour = 'Yellow' }
        Say ("  {0,-20} {1}" -f $key, $value) $colour
    }
    Say ''
    Say "  report   : $reportPath" 'Yellow'
    Say "  quarantine: $(Join-Path $workspace 'stash-contents')" 'Yellow'
    Say "  the stash was not dropped; keep it until you are happy with the result." 'Yellow'
}
finally {
    Pop-Location
}
