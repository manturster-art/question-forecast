# 역할: register_task.ps1 로 등록한 「질문예보 자동갱신」 작업을 작업 스케줄러에서 뺀다.
#   확인 없이 자동으로 지우지 않는다 — 무엇을 지울지 먼저 보여 주고 Read-Host 로 확인을 받는다.
#
# 쓰는 법: powershell -ExecutionPolicy Bypass -File tools\unregister_task.ps1

$ErrorActionPreference = 'Stop'
$TaskName = '질문예보 자동갱신'

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "`"$TaskName`" 은 등록되어 있지 않습니다. 할 일이 없습니다."
    exit 0
}

Write-Host "다음 작업을 작업 스케줄러에서 뺍니다:"
Write-Host "  이름 : $TaskName"
Write-Host "  상태 : $($existing.State)"
Write-Host ''

$answer = Read-Host '이대로 해제할까요? (예/아니오)'
if ($answer -notin @('예', 'y', 'Y', 'yes', 'Yes')) {
    Write-Host '해제를 취소했습니다.'
    exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "해제했습니다. 자동 갱신은 이제 사람이 python tools\sync.py 나 python run.py 를 손으로 돌려야 합니다."
