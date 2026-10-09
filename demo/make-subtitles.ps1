# demo/subtitles.txt → video/DropPDF-demo.srt, 그리고 자막을 입힌 video/DropPDF-demo-subtitled.mp4
# 실행: pwsh demo/make-subtitles.ps1
$root = Split-Path $PSScriptRoot
$env:Path += ";C:\Users\dchl7\ffmpeg\bin"
function Stamp($t) { $ts = [TimeSpan]::FromSeconds($t); "{0:00}:{1:00}:{2:00},{3:000}" -f [int][Math]::Floor($ts.TotalHours), $ts.Minutes, $ts.Seconds, $ts.Milliseconds }
$lines = Get-Content (Join-Path $PSScriptRoot "subtitles.txt") -Encoding utf8 | Where-Object { $_ -and -not $_.StartsWith("#") }
$srt = @(); $n = 1
foreach ($l in $lines) {
  $a, $b, $text = $l -split "\|", 3
  $srt += "$n"; $srt += "$(Stamp ([double]$a)) --> $(Stamp ([double]$b))"; $srt += $text; $srt += ""; $n++
}
$srtPath = Join-Path $root "video\DropPDF-demo.srt"
[IO.File]::WriteAllLines($srtPath, $srt, (New-Object Text.UTF8Encoding($false)))

# 자막 입히기 (libass). 경로 이스케이프를 피하려고 video 폴더에서 상대 경로로 실행한다.
Push-Location (Join-Path $root "video")
try {
  $style = "FontName=Arial,FontSize=13,PrimaryColour=&H00FFFFFF,OutlineColour=&H59000000,BackColour=&H59000000,BorderStyle=3,Outline=10,Shadow=0,MarginV=22,Alignment=2"
  ffmpeg -v error -y -i DropPDF-demo-edited.mp4 -vf "subtitles=DropPDF-demo.srt:force_style='$style'" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart DropPDF-demo-subtitled.mp4
} finally { Pop-Location }
"$($n - 1) cues → video/DropPDF-demo.srt, video/DropPDF-demo-subtitled.mp4"

