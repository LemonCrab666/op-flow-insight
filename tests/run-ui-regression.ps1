$ErrorActionPreference = 'Stop'

$chromeCandidates = @(
	"$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
	"${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
	"$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $chrome) {
	throw 'Google Chrome was not found'
}

$outputDirectory = Join-Path $PSScriptRoot 'ui-output'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$cases = @(
	@{ Width = 2560; Dark = 0 },
	@{ Width = 1920; Dark = 0 },
	@{ Width = 1280; Dark = 0 },
	@{ Width = 768; Dark = 1 },
	@{ Width = 480; Dark = 1 }
)

$failed = $false
foreach ($case in $cases) {
	$name = "layout-$($case.Width)-dark$($case.Dark)"
	$stdout = Join-Path $outputDirectory "$name.html"
	$stderr = Join-Path $outputDirectory "$name.err"
	$screenshot = Join-Path $outputDirectory "$name.png"
	$profile = Join-Path $env:TEMP "op-flow-ui-$name-$PID"
	$url = "http://127.0.0.1:8765/tests/ui-runtime.html?dark=$($case.Dark)"
	$arguments = @(
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--no-first-run',
		'--no-default-browser-check',
		"--user-data-dir=$profile",
		"--window-size=$($case.Width),900",
		'--virtual-time-budget=5000',
		'--dump-dom',
		$url
	)
	Start-Process -FilePath $chrome -ArgumentList $arguments -WindowStyle Hidden -Wait `
		-RedirectStandardOutput $stdout -RedirectStandardError $stderr
	$html = Get-Content -LiteralPath $stdout -Raw
	$match = [regex]::Match($html, '<pre id="layout-report" hidden="">(?<json>.*?)</pre>')
	if (-not $match.Success) {
		Write-Host "$name FAIL (missing report)"
		$failed = $true
		continue
	}
	$report = [System.Net.WebUtility]::HtmlDecode($match.Groups['json'].Value) | ConvertFrom-Json
	if ($report.passed) {
		Write-Host "$name PASS root=$($report.rootWidth) viewport=$($report.viewport -join 'x')"
	} else {
		Write-Host "$name FAIL"
		$report.checks | Where-Object { -not $_.pass } | ForEach-Object {
			Write-Host "  $($_.name): $($_.detail)"
		}
		$failed = $true
	}
	$screenshotArguments = @(
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--no-first-run',
		'--no-default-browser-check',
		"--user-data-dir=$profile",
		"--window-size=$($case.Width),900",
		"--screenshot=`"$screenshot`"",
		'--virtual-time-budget=5000',
		$url
	)
	Start-Process -FilePath $chrome -ArgumentList $screenshotArguments -WindowStyle Hidden -Wait `
		-RedirectStandardOutput "$stdout.shot" -RedirectStandardError "$stderr.shot"
}

if ($failed) {
	exit 1
}
