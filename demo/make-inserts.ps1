# 영상에 끼워 넣을 1920x1080 장면을 만든다: 앱이 만든 결과 PDF 페이지, Word/PowerPoint 화면, 끝 화면.
# 실행: pwsh demo/make-inserts.ps1 demo/work   (outputs/, shots/ 를 읽어 inserts/ 에 쓴다)
Add-Type -AssemblyName System.Drawing
$work = $args[0]
$outs = Join-Path $work "outputs"; $shots = Join-Path $work "shots"; $dst = Join-Path $work "inserts"
New-Item -ItemType Directory -Force $dst | Out-Null
$W = 1920; $H = 1080

function C($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function Canvas($bg) {
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"; $g.InterpolationMode = "HighQualityBicubic"; $g.TextRenderingHint = "AntiAliasGridFit"
  $g.Clear((C $bg)); return $bmp, $g
}
function Shadow($g, $x, $y, $w, $h) {
  for ($i = 8; $i -ge 1; $i--) {
    $b = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(10, 0, 0, 0))
    $g.FillRectangle($b, $x - $i + 4, $y - $i + 6, $w + 2 * $i, $h + 2 * $i); $b.Dispose()
  }
}
function Page($g, $file, $x, $y, $w, $h) {
  $im = [System.Drawing.Image]::FromFile($file)
  Shadow $g $x $y $w $h
  $g.DrawImage($im, [single]$x, [single]$y, [single]$w, [single]$h); $im.Dispose()
}
function Chip($g, $text, $sub) {
  $f = New-Object System.Drawing.Font("Segoe UI Semibold", 26)
  $fs = New-Object System.Drawing.Font("Segoe UI", 20)
  $g.DrawString($text, $f, (New-Object System.Drawing.SolidBrush((C "#1f2937"))), 48, 30)
  if ($sub) { $g.DrawString($sub, $fs, (New-Object System.Drawing.SolidBrush((C "#6b7280"))), 50, 76) }
}
function Save($bmp, $g, $name) { $bmp.Save((Join-Path $dst $name), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose() }

# 1) report.pdf — 앱이 만든 PDF 1쪽
$bmp, $g = Canvas "#e5e7eb"
$im = [System.Drawing.Image]::FromFile("$outs\report.pdf-page1.png"); $ar = $im.Width / $im.Height; $im.Dispose()
$ph = 960; $pw = [int]($ph * $ar)
Page $g "$outs\report.pdf-page1.png" (($W - $pw) / 2) 90 $pw $ph
Chip $g "report.pdf" "made by DropPDF from report.docx"
Save $bmp $g "report.png"

# 2) trip-photos.pdf — 사진 한 장당 한 쪽
$bmp, $g = Canvas "#e5e7eb"
$pages = 1..4 | ForEach-Object { "$outs\trip-photos.pdf-page$_.png" }
$im = [System.Drawing.Image]::FromFile($pages[0]); $ar = $im.Width / $im.Height; $im.Dispose()
$ph = 390; $pw = [int]($ph * $ar); $gx = 60; $gy = 70
$x0 = ($W - (2 * $pw + $gx)) / 2; $y0 = 140
$fl = New-Object System.Drawing.Font("Segoe UI", 20)
for ($i = 0; $i -lt 4; $i++) {
  $x = $x0 + ($i % 2) * ($pw + $gx); $y = $y0 + [Math]::Floor($i / 2) * ($ph + $gy)
  Page $g $pages[$i] $x $y $pw $ph
  $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = "Center"
  $g.DrawString("Page $($i + 1)", $fl, (New-Object System.Drawing.SolidBrush((C "#4b5563"))), (New-Object System.Drawing.RectangleF($x, ($y + $ph + 12), $pw, 40)), $sf)
}
Chip $g "trip-photos.pdf" "4 photos from trip-photos.zip, one per page"
Save $bmp $g "photos.png"

# 3) Word / PowerPoint 실제 화면 (가로세로 비율 유지, 어두운 여백)
foreach ($f in Get-ChildItem $shots -Filter *.png) {
  $bmp, $g = Canvas "#111827"
  $im = [System.Drawing.Image]::FromFile($f.FullName)
  $s = [Math]::Min($W / $im.Width, $H / $im.Height); $w = [int]($im.Width * $s); $h = [int]($im.Height * $s)
  $g.DrawImage($im, [int](($W - $w) / 2), [int](($H - $h) / 2), $w, $h); $im.Dispose()
  Save $bmp $g $f.Name
}

# 4) 끝 화면
$bmp, $g = Canvas "#ffffff"
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment = "Center"
$g.DrawString("DropPDF", (New-Object System.Drawing.Font("Arial", 110, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush((C "#1f2937"))), (New-Object System.Drawing.RectangleF(0, 330, $W, 170)), $sf)
$g.DrawString("Drop your files, convert, and keep everything in one library.", (New-Object System.Drawing.Font("Arial", 30)), (New-Object System.Drawing.SolidBrush((C "#2563eb"))), (New-Object System.Drawing.RectangleF(0, 520, $W, 60)), $sf)
$g.DrawString("Hyeonmin Choi  ·  Jaewu Yoo  ·  CSE406 Phase 1", (New-Object System.Drawing.Font("Arial", 24)), (New-Object System.Drawing.SolidBrush((C "#6b7280"))), (New-Object System.Drawing.RectangleF(0, 620, $W, 50)), $sf)
Save $bmp $g "end.png"
Get-ChildItem $dst -Name

