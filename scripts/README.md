# 배포 스크립트

## 1) 안정형(권장): publish-only
스크린샷 도구 없이 `add → commit → push`만 수행합니다.

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\publish-only.ps1 -CommitMessage "화면 수정 반영" -Branch main
```

## 2) 캡처 포함형: publish-and-capture
Playwright 설치/실행이 가능한 환경에서만 사용하세요.

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\publish-and-capture.ps1 -CommitMessage "수정 내용" -Branch main
```

## 주의
- 반드시 저장소 루트 경로에서 실행 (`...\cj_work_page`)
- PowerShell 프롬프트가 `PS C:\...\cj_work_page>` 형태인지 확인
