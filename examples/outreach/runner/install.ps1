# Keeps an outreach folder's agent always on (Windows Task Scheduler, for the signed-in user):
#   - a quick, cheap check every 10 minutes; a full run only when something happened
#   - a deep run once a night
#   - starts at sign-in, and a start missed while the PC was off or asleep runs right away
#   - pauses while a full-screen game or app is running, lowest priority, no window, never two at once
#   - drafts only: every send, reply, forward, delete and label tool is blocked
#
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Folder "C:\path\to\your outreach folder"
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Folder "..." -Remove      (to stop it)
param([Parameter(Mandatory = $true)][string]$Folder, [switch]$Remove, [string[]]$AllowTools = @())
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Folder).Path
$name = 'Billy outreach runner - ' + (Split-Path $Root -Leaf)
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; "Stopped: $name"; return }
if (-not (Test-Path (Join-Path $Root 'PLAYBOOK.md'))) { throw "No PLAYBOOK.md in $Root. Set the face up in Billy's room first." }

# Copy the runner next to the folder's work, so it keeps working if Billy moves or updates.
$dir = Join-Path $Root 'runner'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'runner.ps1') (Join-Path $dir 'runner.ps1')
$vbs = Join-Path $dir 'start-hidden.vbs'
$cmd = 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""' + (Join-Path $dir 'runner.ps1') + '"" -Folder ""' + $Root + '""' + $(if ($AllowTools.Count) { ' -AllowTools ' + ($AllowTools -join ',') } else { '' })
Set-Content -Path $vbs -Encoding ASCII -Value @(
  "' Starts the outreach runner with no window at all, so it never interrupts a game.",
  'Set sh = CreateObject("WScript.Shell")',
  "sh.Run `"$cmd`", 0, False"
)

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$atLogon.Delay = 'PT2M'
$every10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -Priority 7 -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($atLogon, $every10) -Settings $settings -Principal $principal `
  -Description "Billy Boy: checks mail every 10 minutes for $Root and drafts replies and follow-ups. Never sends. Pauses during full-screen games." -Force | Out-Null
"Always on: $name"
"Billy shows when it last checked. To stop it: install.ps1 -Folder `"$Root`" -Remove"
