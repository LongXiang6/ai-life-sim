# Purpose: Validate shared checker functions, MOD declarations, and generated registration probes.
# Owner: quality:infrastructure
# Responsibility: Checker self-test phases 2 and 2b only.

# Test 2: Function Availability Check
# ============================================================
Write-SectionHeader "Test 2: Function Availability Check"

$utilsPath = Join-Path $checkDir "lib/checker-utils.ps1"
$requiredFunctions = @(
  "Get-FileContent",
  "Fail",
  "Warn",
  "Pass",
  "Get-DeclaredStringArray",
  "Test-FunctionOrder",
  "Preload-AllFiles",
  "Save-Reports"
)

# Dot-source checker-utils.ps1 to check function availability
# Note: this defines $E, $Results, and helper functions in current scope.
# The self-test uses its own $TotalTests/$PassedTests/$FailedTests tracking (not $E),
# and Test 3 uses child scopes, so no conflict.

try {
  . $utilsPath
  Write-TestResult "2-LOAD: checker-utils.ps1" $true "Successfully dot-sourced"

  foreach ($fn in $requiredFunctions) {
    $cmd = Get-Command -Name $fn -ErrorAction SilentlyContinue
    if ($cmd) {
      Write-TestResult "2-FUNC: $fn" $true "Function exists"
    } else {
      Write-TestResult "2-FUNC: $fn" $false "Function NOT found in checker-utils.ps1"
    }
  }
} catch {
  Write-TestResult "2-LOAD: checker-utils.ps1" $false "Failed to dot-source: $_"
  foreach ($fn in $requiredFunctions) {
    Write-TestResult "2-FUNC: $fn" $false "Cannot check (load failed)"
  }
}

# ============================================================
# Test 2b: MOD declaration and generated registration probes
# ============================================================
Write-SectionHeader "Test 2b: MOD Declaration and Registration Probes"

$manifestProbe = @'
defineMod({
  dependencies: ['mod-core', '~mod-optional'],
  provides: ['engine', 'narrative-parser'],
  consumes: [],
  subsystems: ['TimeSystem', 'NarrativeParserSystem'],
  stores: ['useEngineStore'],
  events: { emits: ['mod-engine:round-start'], listens: [] },
})
'@
$probeSubsystems = @(Get-DeclaredStringArray $manifestProbe 'subsystems')
$probeDependencies = @(Get-DeclaredStringArray $manifestProbe 'dependencies')
$probeProvides = @(Get-DeclaredStringArray $manifestProbe 'provides')
$arraysOk =
  $probeSubsystems.Count -eq 2 -and
  $probeSubsystems[0] -eq 'TimeSystem' -and
  $probeSubsystems[1] -eq 'NarrativeParserSystem' -and
  $probeDependencies.Count -eq 2 -and
  $probeProvides.Count -eq 2
Write-TestResult "2b-ARRAYS: Manifest arrays remain itemized" $arraysOk "Manifest array parser returned nested or incomplete values"

$runtimePolicyPath = Join-Path $projectRoot "src/mods/mod-engine/helpers/mvp-stages-config.default.json"
$runtimePolicy = $null
try {
  $runtimePolicyRaw = [System.IO.File]::ReadAllText($runtimePolicyPath, [System.Text.UTF8Encoding]::new($true, $true))
  $runtimePolicy = $runtimePolicyRaw | ConvertFrom-Json
} catch {
  Write-TestResult "2b-POLICY: Runtime policy parses as UTF-8 JSON" $false "Unable to parse runtime policy: $_"
}

if ($runtimePolicy) {
  $stage = $runtimePolicy.stages.($runtimePolicy.currentStage)
  $activeIds = @($stage.runtime.external) + @($stage.runtime.engine)
  $activeFile = Join-Path $projectRoot "src/mods/mod-engine/subsystems/time-system.ts"
  $activeMatch = [regex]::Match((Get-FileContent $activeFile), "readonly\s+id\s*=\s*'([^']+)'")
  $inactiveProbeId = '__checker_self_test_inactive__'
  $filterOk =
    $activeMatch.Success -and $activeMatch.Groups[1].Value -in $activeIds -and
    $inactiveProbeId -notin $activeIds
  Write-TestResult "2b-FILTER: Active and inactive subsystem IDs are distinct" $filterOk "Runtime policy did not separate known active and inactive files"
}

$registrationPath = Join-Path $projectRoot "src/mods/mod-engine/bootstrap/register-subsystems.ts"
$registrationContent = Get-FileContent $registrationPath
$registrationOk =
  $registrationContent -match 'MOD_SUBSYSTEM_IMPORTERS' -and
  $registrationContent -match 'registerAllSubsystems' -and
  $registrationContent -match 'manifest\.subsystems'
Write-TestResult "2b-REGISTRATION: Dynamic manifest registration entry exists" $registrationOk "Dynamic subsystem registration contract is incomplete"

$externalImporterPath = Join-Path $projectRoot "src/core/mod-loader/mod-subsystem-importers.generated.ts"
$engineImporterPath = Join-Path $projectRoot "src/mods/mod-engine/bootstrap/engine-subsystems.generated.ts"
$externalImporterContent = Get-FileContent $externalImporterPath
$engineImporterContent = Get-FileContent $engineImporterPath
$generatedImportsOk =
  $externalImporterContent -match "@/mods/mod-world/subsystems/world-context-registry-system" -and
  $engineImporterContent -match "\.\./subsystems/time-system" -and
  $registrationContent -match "\.\./subsystems/orchestrator-system"
Write-TestResult "2b-GENERATED: External and engine generated imports are wired" $generatedImportsOk "Generated subsystem import paths are incomplete"

# ============================================================
