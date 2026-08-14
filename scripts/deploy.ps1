# 포트폴리오 배포 — 빌드 → Cloudflare Pages → 실측 검증
# 사용법:  pwsh C:\Users\admin\Projects\portfolio\scripts\deploy.ps1
$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $PSScriptRoot
$wrangler = 'C:\Users\admin\Projects\devtutor\cloud\node_modules\.bin\wrangler.cmd'
$project  = 'parkgeunmin'
$url      = "https://$project.pages.dev"

Write-Host "[1/3] 빌드"
Push-Location $root
try {
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw "빌드 실패 (exit $LASTEXITCODE)" }
} finally { Pop-Location }

Write-Host "[2/3] 배포"
# ⚠️ --branch main 을 빼면 preview 로 새고 apex 는 옛 버전으로 남는다.
& $wrangler pages deploy "$root\dist" --project-name $project --branch main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { throw "배포 실패 (exit $LASTEXITCODE)" }

Write-Host "[3/3] 실측 검증"

# ⚠️ PowerShell 7 은 응답 헤더를 String[] 로 준다. 그대로 [int] 캐스팅하면
#    0 이 되어 멀쩡한 파일이 FAIL 로 찍힌다(실제로 한 번 당했다). 첫 원소를 꺼내 쓴다.
function First([object]$v) {
    if ($null -eq $v) { return '' }
    if ($v -is [array]) { if ($v.Count -gt 0) { return [string]$v[0] } else { return '' } }
    return [string]$v
}

function Get-Head([string]$path) {
    try {
        $r = Invoke-WebRequest "$url$path" -Method Head -UseBasicParsing `
             -Headers @{'Cache-Control' = 'no-cache'} -TimeoutSec 30
        return @{
            code = [int]$r.StatusCode
            type = First $r.Headers['Content-Type']
            len  = [int](First $r.Headers['Content-Length'])
        }
    } catch {
        return @{ code = 0; type = ''; len = 0 }
    }
}

# 엣지 전파 대기 — 업로드 직후 20초쯤은 옛 버전이 남는다.
$expectTitle = '박근민'
for ($try = 1; $try -le 10; $try++) {
    Start-Sleep -Seconds 5
    try {
        $page = Invoke-WebRequest "$url/" -UseBasicParsing -Headers @{'Cache-Control'='no-cache'} -TimeoutSec 30
        if ($page.Content -match 'stratum' -and $page.Content -match $expectTitle) { break }
    } catch { }
    Write-Host "  ...엣지 전파 대기 ($try/10)"
}

$fail = 0

# ── 페이지 ──
foreach ($p in @('/', '/category/agent-infra/', '/work/justswarm/', '/work/just-design/')) {
    $h = Get-Head $p
    $ok = ($h.code -eq 200 -and $h.type -like 'text/html*')
    if (-not $ok) { $fail++ }
    "{0}  {1,-28} {2} {3}" -f $(if($ok){'  OK  '}else{'  FAIL'}), $p, $h.code, $h.type | Write-Host
}

# ── 이미지: content-type 으로 본다 ──
# ⚠️ 상태코드 200 만 보면 안 된다. CF Pages 는 없는 경로에도 SPA 폴백으로 200 을 준다.
#    실제로 이 함정 때문에 justdesign-*.jpg 5장이 깨진 채 며칠 서비스됐다.
foreach ($img in @('inlife-login.jpg','statusline.png','justdesign-intake.jpg',
                   'justdesign-flower.jpg','justdesign-3variants.jpg',
                   'justdesign-map.jpg','justdesign-variant-c.jpg')) {
    $h = Get-Head "/shots/$img"
    $ok = ($h.code -eq 200 -and $h.type -like 'image/*' -and $h.len -gt 1000)
    if (-not $ok) { $fail++ }
    "{0}  shots/{1,-28} {2} {3} {4}B" -f $(if($ok){'  OK  '}else{'  FAIL'}), $img, $h.code, $h.type, $h.len | Write-Host
}

# ── 변별력 검사 ──
# 이 검증이 "무엇이든 통과시키는 검증"이 아님을 증명한다.
# 존재하지 않는 이미지가 image/* 로 잡히면 위의 OK 들은 아무 의미가 없다.
$ghost = Get-Head '/shots/__does-not-exist__.jpg'
if ($ghost.type -like 'image/*') {
    Write-Host "  FAIL  변별력 없음 — 없는 파일도 image/* 로 응답한다. 위 결과 전부 무효."
    $fail++
} else {
    Write-Host "  OK    변별력 있음 — 없는 파일은 $($ghost.type) (검증이 실제로 구별한다)"
}

Write-Host ""
if ($fail -gt 0) {
    Write-Host "검증 실패 $fail 건 — $url"
    exit 1
}
Write-Host "완료: $url"
