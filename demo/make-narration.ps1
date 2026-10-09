# 내레이션을 다듬어 편집본에 붙이고, 실제로 읽은 말로 자막을 다시 만든다.
# 읽는 것: demo/narration.m4a, demo/narration-plan.txt, demo/work/DropPDF_demo_silent.mp4 (make-video.ps1 결과)
# 만드는 것: video/DropPDF-demo-edited.mp4 (소리 있음), demo/subtitles.txt → make-subtitles.ps1 → 자막 영상·SRT
# 실행: pwsh demo/make-narration.ps1
$root = Split-Path $PSScriptRoot
$env:Path += ";C:\Users\dchl7\ffmpeg\bin"
$work = Join-Path $root "demo\work\audio"; New-Item -ItemType Directory -Force $work | Out-Null
$silent = Join-Path $root "demo\work\DropPDF_demo_silent.mp4"
$videoLen = [double](ffprobe -v error -show_entries format=duration -of csv=p=0 $silent)

$clips = @(); $subs = @()
foreach ($line in Get-Content (Join-Path $PSScriptRoot "narration-plan.txt") -Encoding utf8) {
  if (-not $line -or $line.StartsWith("#")) { continue }
  $kind, $a, $b, $rest = $line -split "\|", 4
  if ($kind -eq "clip") { $clips += [pscustomobject]@{ A = [double]$a; B = [double]$b; Dest = [double]$rest } }
  if ($kind -eq "sub") { $subs += [pscustomobject]@{ A = [double]$a; B = [double]$b; Text = $rest } }
}
for ($i = 1; $i -lt $clips.Count; $i++) {
  $prevEnd = $clips[$i - 1].Dest + $clips[$i - 1].B - $clips[$i - 1].A
  if ($clips[$i].Dest -lt $prevEnd) { throw "clip $i overlaps the previous one" }
}

# 1) 잡음 줄이고 음량 맞추기
$clean = Join-Path $work "clean.wav"
ffmpeg -v error -y -i (Join-Path $root "demo\narration.m4a") -af "highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -ac 1 $clean

# 2) 조각마다 잘라서 영상 시간에 놓기
$parts = @(); $labels = @()
for ($i = 0; $i -lt $clips.Count; $i++) {
  $c = $clips[$i]; $len = $c.B - $c.A; $ms = [int]($c.Dest * 1000)
  $parts += "[0:a]atrim=start=$($c.A):end=$($c.B),asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=$([Math]::Round($len - 0.06, 3)):d=0.06,adelay=$($ms)[c$i]"
  $labels += "[c$i]"
}
$filter = ($parts -join ";`n") + ";`n" + ($labels -join "") + "amix=inputs=$($clips.Count):normalize=0,apad,atrim=end=$videoLen,pan=stereo|c0=c0|c1=c0[out]"
$filterFile = Join-Path $work "mix.txt"; [IO.File]::WriteAllText($filterFile, $filter)
$track = Join-Path $work "narration-track.wav"
ffmpeg -v error -y -i $clean -filter_complex_script $filterFile -map "[out]" -ar 48000 $track

# 3) 편집본에 붙이기
ffmpeg -v error -y -i $silent -i $track -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -movflags +faststart (Join-Path $root "video\DropPDF-demo-edited.mp4")

# 4) 자막: 녹음 시간 → 영상 시간. 읽기 쉽게 다음 자막 전까지 최대 0.6초 더 보여 준다.
function ToVideo($t) {
  $best = $clips[0]; $dist = [double]::MaxValue
  foreach ($c in $clips) {
    $d = if ($t -lt $c.A) { $c.A - $t } elseif ($t -gt $c.B) { $t - $c.B } else { 0 }
    if ($d -lt $dist) { $dist = $d; $best = $c }
  }
  $best.Dest + [Math]::Min([Math]::Max($t, $best.A), $best.B) - $best.A
}
$out = @("# 시작초|끝초|자막 — make-narration.ps1이 narration-plan.txt에서 만든다 (직접 고치지 말 것)")
for ($i = 0; $i -lt $subs.Count; $i++) {
  $s = ToVideo $subs[$i].A; $e = (ToVideo $subs[$i].B) + 0.6
  if ($i + 1 -lt $subs.Count) { $e = [Math]::Min($e, (ToVideo $subs[$i + 1].A) - 0.1) }
  $out += ("{0:0.00}|{1:0.00}|{2}" -f $s, $e, $subs[$i].Text)
}
[IO.File]::WriteAllLines((Join-Path $PSScriptRoot "subtitles.txt"), $out, (New-Object Text.UTF8Encoding($false)))
& (Join-Path $PSScriptRoot "make-subtitles.ps1")
