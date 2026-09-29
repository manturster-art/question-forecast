# 역할: 「질문예보 자동갱신」 작업을 Windows 작업 스케줄러에 등록한다(현재 사용자 권한, 관리자 불필요).
#   매주 월요일 07:30 에 `python tools/sync.py` 를 저장소 뿌리에서 실행하도록 등록하고,
#   예약된 시작 시간을 놓치면(PC 가 꺼져 있었으면) 가능한 빨리 실행하도록 켠다.
#
# 이 스크립트는 실행만 준비할 뿐, 무엇을 등록할지 먼저 보여 주고 Read-Host 로 확인을
# 받은 뒤에만 등록한다. 확인 없이 자동으로 등록하지 않는다.
#
# 쓰는 법: 저장소 뿌리에서 (관리자 아닌) 보통 PowerShell 창에 그대로 붙여 실행
#   powershell -ExecutionPolicy Bypass -File tools\register_task.ps1

$ErrorActionPreference = 'Stop'

$TaskName = '질문예보 자동갱신'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $Python) {
    $Python = (Get-Command py -ErrorAction SilentlyContinue).Source
}
if (-not $Python) {
    Write-Host '오류: python(또는 py)을 PATH 에서 찾지 못했습니다. Python 을 설치한 뒤 다시 실행하십시오.'
    exit 1
}

Write-Host '다음 내용으로 작업 스케줄러에 등록합니다:'
Write-Host "  이름       : $TaskName"
Write-Host "  실행       : `"$Python`" tools\sync.py"
Write-Host "  작업 폴더  : $RepoRoot"
Write-Host '  일정       : 매주 월요일 07:30'
Write-Host '  놓친 실행  : 가능한 빨리 실행(켬) — PC 가 꺼져 있었으면 다음 켰을 때 바로 돕니다'
Write-Host '  권한       : 현재 로그인한 사용자(관리자 권한 필요 없음)'
Write-Host ''
Write-Host '이 도구는 배포(공개 URL 게시)를 하지 않습니다. config/sync.json 의 auto_deploy 가'
Write-Host 'false 로 있는 한 새 자료를 받아 out/부서점검표.html 만 새로 굽고, 공개 URL 은'
Write-Host '건드리지 않습니다.'
Write-Host ''

$answer = Read-Host '이대로 등록할까요? (예/아니오)'
if ($answer -notin @('예', 'y', 'Y', 'yes', 'Yes')) {
    Write-Host '등록을 취소했습니다.'
    exit 0
}

$Action = New-ScheduledTaskAction -Execute $Python -Argument 'tools\sync.py' -WorkingDirectory $RepoRoot
$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 07:30
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -Principal $Principal -Description '질문 예보 — 주 1회 자료 확인·갱신(공개 배포는 하지 않음)' | Out-Null

Write-Host "등록했습니다. 작업 스케줄러(taskschd.msc)에서 `"$TaskName`" 을 확인할 수 있습니다."
Write-Host "해제하려면 tools\unregister_task.ps1 을 실행하십시오."
