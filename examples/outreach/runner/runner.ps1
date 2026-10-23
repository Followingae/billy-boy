# Billy Boy outreach: the always-on runner (investor round or sales outreach).
#   powershell -File runner.ps1 -Folder "<your outreach folder>"
# install.ps1 schedules it. The folder needs PLAYBOOK.md (with its run modes) and billy_state.json.
#
# Windows Task Scheduler starts this every 10 minutes, at sign-in, and as soon as possible after a
# start was missed (PC off or asleep). Each start decides what to do:
#   game mode   a full-screen game or app is running  -> do nothing, try again in 10 minutes
#   catch-up    nothing has run for 30+ minutes       -> a full run now
#   deep        no deep run in the last 20 hours and it is night, or none for 30 hours -> deep run
#   quick check otherwise: a fast, cheap look for anything new; a full run only if something is
# Claude runs headless at the lowest priority, with Gmail (read + drafts only) and, if connected, Metal. Every send,
# forward, reply-send, delete and label tool is blocked, so nothing can ever be sent from here.

# -AllowTools: extra connectors the agent may use, e.g. 'mcp__claude_ai_Crunchbase','mcp__claude_ai_Lusha'
# (whole servers, read and write). Metal is allowed by default. Send tools stay blocked whatever you add.
param([Parameter(Mandatory = $true)][string]$Folder, [string]$FastModel = 'haiku', [string]$SmartModel = 'sonnet', [string[]]$AllowTools = @())
$ErrorActionPreference = 'Stop'
$Root    = (Resolve-Path $Folder).Path
$Dir     = Join-Path $Root 'runner'
New-Item -ItemType Directory -Force -Path $Dir, (Join-Path $Root 'runs'), (Join-Path $Root 'prep') | Out-Null
$Status  = Join-Path $Dir 'status.json'
$Log     = Join-Path $Dir 'runner.log'
$Lock    = Join-Path $Dir 'running.lock'
$Hold    = Join-Path $Dir 'HOLD'
$Claude  = Join-Path $env:APPDATA 'npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe'
if (-not (Test-Path $Claude)) { $c = Get-Command claude.exe -ErrorAction SilentlyContinue; if ($c) { $Claude = $c.Source } }
if (-not (Test-Path $Claude)) { throw 'Claude Code was not found. Install it from claude.com/claude-code.' }

function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $Log -Value $line -Encoding utf8
  # keep the log small
  if ((Get-Item $Log).Length -gt 2MB) { Get-Content $Log -Tail 3000 | Set-Content $Log -Encoding utf8 }
}
function Save-Json($path, $obj) {
  [IO.File]::WriteAllText($path, ($obj | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
}
function Load-Status {
  if (Test-Path $Status) { try { return Get-Content $Status -Raw | ConvertFrom-Json } catch {} }
  return [pscustomobject]@{ last_check = $null; last_full = $null; last_deep = $null; last_result = $null; paused = $false }
}
function Age-Min($iso) { if (-not $iso) { return 1e9 } ; return ((Get-Date) - [datetime]$iso).TotalMinutes }
function Set-Field($obj, $name, $value) {
  if ($obj.PSObject.Properties[$name]) { $obj.$name = $value } else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}

# Tell Billy the runner is alive (he warns if this goes stale).
function Touch-Billy($note) {
  $p = Join-Path $Root 'billy_state.json'
  if (-not (Test-Path $p)) { return }
  try {
    $s = [IO.File]::ReadAllText($p) -replace "^\uFEFF", '' | ConvertFrom-Json
    Set-Field $s 'checked_at' ((Get-Date).ToString('o'))
    Set-Field $s 'runner' $note
    Save-Json $p $s
  } catch { Log "could not touch billy_state.json: $($_.Exception.Message)" }
}

# ── game mode ───────────────────────────────────────────────────────────────────────────
Add-Type -Namespace Native -Name Shell -MemberDefinition @'
[DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
'@ -ErrorAction SilentlyContinue
Add-Type -Namespace Native -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int pid);
'@ -ErrorAction SilentlyContinue
# Full-screen apps that are work, not games: these never pause the runner.
$WorkApps = @('Code', 'Cursor', 'chrome', 'msedge', 'firefox', 'brave', 'opera', 'explorer', 'WindowsTerminal',
  'powershell', 'pwsh', 'cmd', 'Teams', 'ms-teams', 'slack', 'OUTLOOK', 'olk', 'EXCEL', 'WINWORD', 'POWERPNT',
  'Notion', 'Figma', 'Claude', 'electron', 'Spotify', 'Zoom', 'mstsc', 'devenv', 'idea64', 'webstorm64')
function Is-Gaming {
  $state = 0
  try { [void][Native.Shell]::SHQueryUserNotificationState([ref]$state) } catch { return $false }
  # 3 = Direct3D exclusive full-screen: always a game. 4 = presentation mode.
  if ($state -eq 3 -or $state -eq 4) { return $true }
  # 2 = some full-screen window: borderless games report this, but so does a maximised editor
  # or browser in full screen, so it only counts when the app in front is not a work app.
  if ($state -ne 2) { return $false }
  $fgPid = 0
  try { [void][Native.Win]::GetWindowThreadProcessId([Native.Win]::GetForegroundWindow(), [ref]$fgPid) } catch { return $true }
  $name = (Get-Process -Id $fgPid -ErrorAction SilentlyContinue).ProcessName
  return -not ($name -and ($WorkApps -contains $name))
}

# ── run Claude headless, lowest priority ────────────────────────────────────────────────
$Allowed = @(
  'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
  'mcp__claude_ai_Gmail__search_threads', 'mcp__claude_ai_Gmail__get_thread', 'mcp__claude_ai_Gmail__get_message',
  'mcp__claude_ai_Gmail__list_drafts', 'mcp__claude_ai_Gmail__get_draft', 'mcp__claude_ai_Gmail__create_draft',
  'mcp__claude_ai_Metal'
) + $AllowTools
$Blocked = @(
  'Bash', 'PowerShell',
  'mcp__claude_ai_Metal__send-email-draft',
  'mcp__claude_ai_Gmail__send_message', 'mcp__claude_ai_Gmail__reply', 'mcp__claude_ai_Gmail__forward',
  'mcp__claude_ai_Gmail__delete_draft', 'mcp__claude_ai_Gmail__trash_message', 'mcp__claude_ai_Gmail__trash_thread',
  'mcp__claude_ai_Gmail__label_message', 'mcp__claude_ai_Gmail__label_thread', 'mcp__claude_ai_Gmail__unlabel_message',
  'mcp__claude_ai_Gmail__unlabel_thread', 'mcp__claude_ai_Gmail__update_message_labels', 'mcp__claude_ai_Gmail__mark_message_spam',
  'mcp__claude_ai_Gmail__mark_thread_spam', 'mcp__claude_ai_Gmail__create_label', 'mcp__claude_ai_Gmail__delete_label',
  'mcp__claude_ai_Gmail__update_label', 'mcp__claude_ai_Gmail__update_draft'
)

# Windows command-line quoting (CommandLineToArgvW rules), since PowerShell 5.1 has no ArgumentList.
function Quote-Arg([string]$a) {
  if ($a.Length -gt 0 -and $a -notmatch '[\s"]') { return $a }
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append('"')
  $bs = 0
  foreach ($ch in $a.ToCharArray()) {
    if ($ch -eq [char]92) { $bs++; continue }
    if ($ch -eq [char]34) { [void]$sb.Append(([string][char]92) * ($bs * 2 + 1)); [void]$sb.Append([char]34); $bs = 0; continue }
    if ($bs) { [void]$sb.Append(([string][char]92) * $bs); $bs = 0 }
    [void]$sb.Append($ch)
  }
  if ($bs) { [void]$sb.Append(([string][char]92) * ($bs * 2)) }
  [void]$sb.Append('"')
  return $sb.ToString()
}

function Invoke-Claude($prompt, $model, $budget, $minutes) {
  $out = Join-Path $Dir ("last_{0}.txt" -f $model)
  $cliArgs = @('-p', $prompt, '--model', $model, '--permission-mode', 'dontAsk',
            '--allowedTools') + $Allowed + @('--disallowedTools') + $Blocked + @('--max-budget-usd', "$budget")
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $Claude
  $psi.Arguments = ($cliArgs | ForEach-Object { Quote-Arg $_ }) -join ' '
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [Diagnostics.Process]::Start($psi)
  try { $p.PriorityClass = 'Idle' } catch {}
  $stdout = $p.StandardOutput.ReadToEndAsync()
  $stderr = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($minutes * 60 * 1000)) { try { $p.Kill() } catch {}; Log "timed out after $minutes min"; return @{ ok = $false; text = 'timeout' } }
  $text = $stdout.Result
  [IO.File]::WriteAllText($out, $text + "`n--- stderr ---`n" + $stderr.Result, (New-Object Text.UTF8Encoding($false)))
  return @{ ok = ($p.ExitCode -eq 0); text = $text }
}

# ── main ────────────────────────────────────────────────────────────────────────────────
if (Test-Path $Hold) { exit 0 }
if (Test-Path $Lock) {
  if ((Age-Min (Get-Item $Lock).LastWriteTime.ToString('o')) -lt 45) { exit 0 }   # a run is still going
  Remove-Item $Lock -Force                                                      # stale lock
}
$st = Load-Status
if (Is-Gaming) {
  if (-not $st.paused) { Log 'game mode: paused (full-screen app running)' }
  Set-Field $st 'paused' $true; Save-Json $Status $st
  Touch-Billy 'paused while you game'
  exit 0
}
if ($st.paused) { Log 'game mode: resumed' }
Set-Field $st 'paused' $false

New-Item -ItemType File -Path $Lock -Force | Out-Null
try {
  $now = Get-Date
  $hour = $now.Hour
  $mode = 'check'
  if ((Age-Min $st.last_deep) -gt 30 * 60 -or ((Age-Min $st.last_deep) -gt 20 * 60 -and ($hour -ge 1 -and $hour -lt 7))) { $mode = 'deep' }
  elseif ((Age-Min $st.last_full) -gt 30 -and (Age-Min $st.last_check) -gt 30) { $mode = 'full' }   # back after the PC was off

  $since = if ($st.last_check) { $st.last_check } else { (Get-Date).AddDays(-3).ToString('o') }
  $stamp = $now.ToString('yyyy-MM-dd_HHmm')

  if ($mode -eq 'check') {
    $r = Invoke-Claude "QUICK CHECK. Follow the 'QUICK CHECK' section of PLAYBOOK.md exactly. SINCE = $since. Today is $($now.ToString('dddd d MMMM yyyy, HH:mm')) local time." $FastModel 0.5 8
    Set-Field $st 'last_check' $now.ToString('o')
    $last = ($r.text -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
    if ($r.ok -and $last -match '^NEEDS_RUN') { Log "check: $last"; $mode = 'full' }
    elseif ($r.ok) { Log 'check: nothing new'; Set-Field $st 'last_result' 'nothing new'; Touch-Billy 'checked, nothing new' }
    else { Log "check failed: $($r.text)"; Set-Field $st 'last_result' 'check failed' }
  }
  if ($mode -eq 'full' -or $mode -eq 'deep') {
    $what = if ($mode -eq 'deep') { "DEEP RUN. Follow PLAYBOOK.md: 'Each run' plus the 'DEEP RUN' section." } else { "FULL RUN. Follow PLAYBOOK.md 'Each run' (see 'FULL RUN')." }
    $r = Invoke-Claude "$what Changes since $since. Today is $($now.ToString('dddd d MMMM yyyy, HH:mm')) local time. Write the run log to runs/$stamp.md." $SmartModel ($(if ($mode -eq 'deep') { 8 } else { 4 })) 40
    Log ("{0} run {1}" -f $mode, $(if ($r.ok) { 'done' } else { 'FAILED' }))
    Set-Field $st 'last_check' $now.ToString('o')
    Set-Field $st 'last_full' $now.ToString('o')
    if ($mode -eq 'deep') { Set-Field $st 'last_deep' $now.ToString('o') }
    Set-Field $st 'last_result' ("{0} {1}" -f $mode, $(if ($r.ok) { 'done' } else { 'failed' }))
    Touch-Billy ("{0} run {1}" -f $mode, $(if ($r.ok) { 'done' } else { 'failed, see runner.log' }))
  }
  Save-Json $Status $st
} catch {
  Log "error: $($_.Exception.Message)"
} finally {
  Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}
