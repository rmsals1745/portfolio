# 포트폴리오 갱신 — 볼트 → 초안 → 다듬기 → 빌드 검증
#
# 사용법:
#   pwsh scripts\refresh.ps1           # 볼트가 바뀐 경우에만 실행
#   pwsh scripts\refresh.ps1 -Force    # 무조건 실행
#   pwsh scripts\refresh.ps1 -NoLlm    # 변환만 (LLM 호출 없음)
#
# ★ 이 스크립트는 아무것도 공개하지 않는다.
#   산출물은 전부 draft:true 라 빌드에서 제외된다. 사이트에 띄우는 것은
#   사람이 draft 를 false 로 내리는 행위 하나뿐이다.

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$NoLlm
)

$ErrorActionPreference = 'Stop'
# 한글 출력이 깨지지 않게 — 파이프로 넘길 때 특히 필요하다
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'

$root  = Split-Path -Parent $PSScriptRoot
$vault = 'C:\Users\admin\Documents\Obsidian\포트폴리오'
$stamp = Join-Path $root '.astro\last-refresh'

# ── 게이트: 볼트가 바뀌지 않았으면 LLM 을 부르지 않는다 ──────────────
# 매 세션마다 도는 자리라, 새 자료가 없는데 모델을 부르면 돈과 시간만 쓴다.
$newest = $null
if (Test-Path $vault) {
    $newest = Get-ChildItem $vault -Recurse -Filter *.md -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending |
              Select-Object -First 1 -ExpandProperty LastWriteTime
}
if (-not $newest) {
    Write-Host "[refresh] 볼트에 마크다운이 없습니다: $vault"
    exit 0
}

if (-not $Force -and (Test-Path $stamp)) {
    $last = [datetime](Get-Content $stamp -Raw).Trim()
    if ($newest -le $last) {
        Write-Host "[refresh] 볼트 변경 없음 (최종 $($newest.ToString('yyyy-MM-dd HH:mm'))) — 건너뜁니다"
        exit 0
    }
}

Push-Location $root
try {
    Write-Host "[1/3] 볼트 → 초안 변환"
    $ingest = & python scripts\ingest\ingest.py --out src\content\cases 2>$null | ConvertFrom-Json
    Write-Host "  새 초안 $($ingest.written)건 · 기존 유지 $($ingest.skipped)건"

    if (-not $NoLlm) {
        Write-Host "[2/3] 초안 다듬기 (LLM — 수치는 원문 인용 대조 통과분만)"
        $polish = & python scripts\polish.py --apply 2>$null | ConvertFrom-Json
        if ($polish.drafts -gt 0) {
            $dropped = 0
            foreach ($r in $polish.reports) { $dropped += @($r.dropped).Count }
            Write-Host "  초안 $($polish.drafts)건 처리 · 근거 없는 수치 $dropped 건 폐기"
        } else {
            Write-Host "  다듬을 초안 없음"
        }
    } else {
        Write-Host "[2/3] 건너뜀 (-NoLlm)"
    }

    # ── 빌드 검증 ──────────────────────────────────────────────
    # 초안이 스키마를 어기면 여기서 잡는다. 사이트가 깨진 채 배포되는 것보다
    # 여기서 실패하는 편이 낫다.
    Write-Host "[3/3] 빌드 검증"
    & pnpm build 2>&1 | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { throw "빌드 실패 — 초안 프론트매터를 확인하세요" }

    $newest.ToString('o') | Set-Content $stamp -Encoding utf8

    # ── 사람이 할 일 안내 ──────────────────────────────────────
    $drafts = Get-ChildItem "$root\src\content\cases\*.md" |
              Where-Object { (Get-Content $_ -Raw -Encoding utf8) -match '(?m)^draft:\s*true' }
    Write-Host ""
    if ($drafts) {
        Write-Host "확인 대기 중인 초안 $($drafts.Count)건 — 열어서 다듬고 draft: false 로 내리면 공개됩니다:"
        $drafts | Select-Object -First 10 | ForEach-Object { Write-Host "  $($_.FullName)" }
        Write-Host ""
        Write-Host "공개는 별도 명령: pwsh scripts\deploy.ps1"
    } else {
        Write-Host "확인 대기 초안 없음 — 최신 상태입니다."
    }
} finally {
    Pop-Location
}
