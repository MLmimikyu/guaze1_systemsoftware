# demo/subtitles.txt → video/DropPDF-demo.srt, 그리고 자막을 입힌 video/DropPDF-demo-subtitled.mp4
# 자막마다 모서리가 둥근 반투명 배경을 PNG로 그려서 해당 시간에만 영상 위에 겹친다.
# 실행: pwsh demo/make-subtitles.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot
$env:Path += ";C:\Users\dchl7\ffmpeg\bin"
$work = Join-Path $root "demo\work\subs"
Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force $work | Out-Null

function Stamp($t) { $ts = [TimeSpan]::FromSeconds($t); "{0:00}:{1:00}:{2:00},{3:000}" -f [int][Math]::Floor($ts.TotalHours), $ts.Minutes, $ts.Seconds, $ts.Milliseconds }
$cues = Get-Content (Join-Path $PSScriptRoot "subtitles.txt") -Encoding utf8 | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
  $a, $b, $text = $_ -split "\|", 3; [pscustomobject]@{ Start = [double]$a; End = [double]$b; Text = $text }
}

# SRT (YouTube 업로드용)
$srt = @(); $n = 1
foreach ($c in $cues) { $srt += "$n"; $srt += "$(Stamp $c.Start) --> $(Stamp $c.End)"; $srt += $c.Text; $srt += ""; $n++ }
[IO.File]::WriteAllLines((Join-Path $root "video\DropPDF-demo.srt"), $srt, (New-Object Text.UTF8Encoding($false)))

# 자막 이미지
$font = New-Object System.Drawing.Font("Arial", 40, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$maxText = 1500; $padX = 34; $padY = 16; $radius = 26
$i = 0
foreach ($c in $cues) {
  $probe = New-Object System.Drawing.Bitmap(1, 1); $pg = [System.Drawing.Graphics]::FromImage($probe)
  $sz = $pg.MeasureString($c.Text, $font, $maxText); $pg.Dispose(); $probe.Dispose()
  $w = [int][Math]::Ceiling($sz.Width) + 2 * $padX; $h = [int][Math]::Ceiling($sz.Height) + 2 * $padY
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"; $g.Clear([System.Drawing.Color]::Transparent)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = [Math]::Min($radius, $h / 2); $d = 2 * $r
  $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($w - $d - 1, 0, $d, $d, 270, 90)
  $path.AddArc($w - $d - 1, $h - $d - 1, $d, $d, 0, 90); $path.AddArc(0, $h - $d - 1, $d, $d, 90, 90); $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 17, 24, 39))), $path)
  $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = "Center"
  $g.DrawString($c.Text, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF($padX, $padY, ($w - 2 * $padX), ($h - 2 * $padY + 4))), $sf)
  $g.Dispose(); $bmp.Save((Join-Path $work ("s{0:D2}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  $i++
}

# 겹치기: 화면 아래 가운데, 해당 시간에만
$inputs = @("-i", (Join-Path $root "video\DropPDF-demo-edited.mp4"))
$chain = @(); $last = "0:v"
for ($k = 0; $k -lt $cues.Count; $k++) {
  $inputs += @("-i", (Join-Path $work ("s{0:D2}.png" -f $k)))
  $c = $cues[$k]; $outLabel = if ($k -eq $cues.Count - 1) { "vout" } else { "v$k" }
  $chain += "[$last][$($k + 1):v]overlay=x=(W-w)/2:y=H-h-48:enable='between(t,$($c.Start),$($c.End))'[$outLabel]"
  $last = $outLabel
}
$filter = Join-Path $work "filter.txt"; [IO.File]::WriteAllText($filter, ($chain -join ";`n"))
ffmpeg -v error -y @inputs -filter_complex_script $filter -map "[vout]" -map "0:a?" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart (Join-Path $root "video\DropPDF-demo-subtitled.mp4")
"$($cues.Count) cues → video/DropPDF-demo.srt, video/DropPDF-demo-subtitled.mp4"


