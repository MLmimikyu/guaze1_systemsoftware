Add-Type -AssemblyName System.Drawing
$out = $args[0]
New-Item -ItemType Directory -Force $out | Out-Null
$W = 1600; $H = 1067

function Grad($g, $rect, $c1, $c2) {
  $b = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 90)
  $g.FillRectangle($b, $rect); $b.Dispose()
}
function Poly($g, $color, $pts) {
  $b = New-Object System.Drawing.SolidBrush($color)
  $g.FillPolygon($b, [System.Drawing.PointF[]]($pts | ForEach-Object { New-Object System.Drawing.PointF($_[0], $_[1]) }))
  $b.Dispose()
}
function C($r, $g2, $b) { [System.Drawing.Color]::FromArgb($r, $g2, $b) }
function CA($a, $r, $g2, $b) { [System.Drawing.Color]::FromArgb($a, $r, $g2, $b) }
function Ridge($g, $color, $base, $amp, $seed) {
  $rnd = New-Object System.Random($seed)
  $pts = @(, @(0, $H))
  $y = $base
  for ($x = 0; $x -le $W; $x += 40) { $y = [Math]::Max($base - $amp, [Math]::Min($base + $amp, $y + $rnd.Next(-55, 56))); $pts += , @($x, $y) }
  $pts += , @($W, $H)
  Poly $g $color $pts
}
function Sun($g, $x, $y, $r, $color) {
  for ($i = 5; $i -ge 1; $i--) { $b = New-Object System.Drawing.SolidBrush((CA (20 * (6 - $i)) $color.R $color.G $color.B)); $rr = $r * (1 + $i * 0.35); $g.FillEllipse($b, $x - $rr, $y - $rr, 2 * $rr, 2 * $rr); $b.Dispose() }
  $b = New-Object System.Drawing.SolidBrush($color); $g.FillEllipse($b, $x - $r, $y - $r, 2 * $r, 2 * $r); $b.Dispose()
}
function Caption($g, $text) {
  $f = New-Object System.Drawing.Font("Segoe UI Semibold", 44)
  $g.DrawString($text, $f, (New-Object System.Drawing.SolidBrush((CA 110 0 0 0))), 63, $H - 117)
  $g.DrawString($text, $f, [System.Drawing.Brushes]::White, 60, $H - 120)
}
function Save($bmp, $name) {
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq "image/jpeg"
  $p = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)
  $bmp.Save((Join-Path $out $name), $enc, $p)
}
function New-Scene { $bmp = New-Object System.Drawing.Bitmap($W, $H); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAlias"; return $bmp, $g }

# 1 해변
$bmp, $g = New-Scene
Grad $g (New-Object System.Drawing.Rectangle(0, 0, $W, 640)) (C 86 160 230) (C 190 225 250)
Sun $g 1200 260 70 (C 255 244 200)
Grad $g (New-Object System.Drawing.Rectangle(0, 600, $W, 260)) (C 30 130 180) (C 70 190 200)
Poly $g (C 236 214 170) @(@(0, 820), @(400, 780), @(900, 800), @(1600, 760), @(1600, $H), @(0, $H))
Poly $g (CA 140 255 255 255) @(@(0, 815), @(400, 776), @(900, 796), @(1600, 756), @(1600, 770), @(900, 810), @(400, 790), @(0, 830))
Caption $g "Day 1 · Beach"; Save $bmp "1-beach.jpg"; $g.Dispose(); $bmp.Dispose()

# 2 산
$bmp, $g = New-Scene
Grad $g (New-Object System.Drawing.Rectangle(0, 0, $W, $H)) (C 120 170 220) (C 235 230 215)
Poly $g (C 120 130 160) @(@(0, 700), @(350, 300), @(600, 520), @(900, 220), @(1250, 560), @(1600, 380), @(1600, $H), @(0, $H))
Poly $g (C 250 250 255) @(@(350, 300), @(300, 360), @(340, 350), @(390, 365))
Poly $g (C 250 250 255) @(@(900, 220), @(830, 300), @(890, 290), @(960, 310))
Ridge $g (C 70 120 90) 800 60 7
Ridge $g (C 40 85 60) 920 50 11
Caption $g "Day 2 · Mountains"; Save $bmp "2-mountains.jpg"; $g.Dispose(); $bmp.Dispose()

# 3 노을
$bmp, $g = New-Scene
Grad $g (New-Object System.Drawing.Rectangle(0, 0, $W, 700)) (C 60 50 120) (C 250 150 90)
Sun $g 800 640 110 (C 255 200 120)
Grad $g (New-Object System.Drawing.Rectangle(0, 680, $W, 400)) (C 200 110 90) (C 40 40 80)
Ridge $g (C 30 25 50) 700 30 3
Caption $g "Day 3 · Sunset"; Save $bmp "3-sunset.jpg"; $g.Dispose(); $bmp.Dispose()

# 10 도시 야경 (자연 정렬 확인용 이름)
$bmp, $g = New-Scene
Grad $g (New-Object System.Drawing.Rectangle(0, 0, $W, $H)) (C 15 20 50) (C 60 50 110)
$rnd = New-Object System.Random(5)
for ($i = 0; $i -lt 60; $i++) { $g.FillEllipse([System.Drawing.Brushes]::White, $rnd.Next(0, $W), $rnd.Next(0, 400), 3, 3) }
$x = 0
while ($x -lt $W) {
  $bw = $rnd.Next(70, 150); $bh = $rnd.Next(250, 650)
  $b = New-Object System.Drawing.SolidBrush((C 25 30 55)); $g.FillRectangle($b, $x, $H - $bh, $bw - 6, $bh); $b.Dispose()
  for ($wy = $H - $bh + 20; $wy -lt $H - 20; $wy += 30) { for ($wx = $x + 10; $wx -lt $x + $bw - 20; $wx += 22) { if ($rnd.Next(0, 3) -gt 0) { $g.FillRectangle((New-Object System.Drawing.SolidBrush((C 255 210 120))), $wx, $wy, 10, 14) } } }
  $x += $bw
}
Caption $g "Day 4 · City lights"; Save $bmp "10-city.jpg"; $g.Dispose(); $bmp.Dispose()
