$root = $args[0]
$ph = Join-Path $root "photos"
$out = Join-Path $root "samples"
New-Item -ItemType Directory -Force $out | Out-Null

# trip-photos.zip
Remove-Item "$out\trip-photos.zip" -ErrorAction SilentlyContinue
Compress-Archive -Path "$ph\*.jpg" -DestinationPath "$out\trip-photos.zip"

# sales.xlsx
$xl = New-Object -ComObject Excel.Application; $xl.DisplayAlerts = $false
$wb = $xl.Workbooks.Add(); $ws = $wb.Worksheets(1); $ws.Name = "Q3 Sales"
$rows = @(
  @("Region", "July", "August", "September", "Total"),
  @("North", 12400, 13850, 15100),
  @("South", 9800, 10250, 11900),
  @("East", 14300, 13900, 16450),
  @("West", 8700, 9600, 10300),
  @("Online", 18200, 21400, 24750)
)
for ($r = 0; $r -lt $rows.Count; $r++) { for ($c = 0; $c -lt $rows[$r].Count; $c++) { $ws.Range("$([char](65 + $c))$($r + 1)").Formula = [string]$rows[$r][$c] } }
for ($r = 2; $r -le 6; $r++) { $ws.Range("E$r").Formula = "=SUM(B$($r):D$($r))" }
$ws.Range("A7").Value2 = "Total"
for ($c = 2; $c -le 5; $c++) { $col = [char](64 + $c); $ws.Range("$($col)7").Formula = "=SUM($($col)2:$($col)6)" }
$ws.Range("B2:E7").NumberFormat = '$#,##0'
$hdr = $ws.Range("A1:E1"); $hdr.Font.Bold = $true; $hdr.Interior.Color = 0xEB6325; $hdr.Font.Color = 0xFFFFFF
$ws.Range("A7:E7").Font.Bold = $true; $ws.Range("A7:E7").Interior.Color = 0xF5EFEA
$ws.Range("A1:E7").Borders.LineStyle = 1; $ws.Range("A1:E7").Borders.Color = 0xD0C8C0
$ws.Columns("A:E").ColumnWidth = 14
$wb.SaveAs("$out\sales.xlsx", 51); $wb.Close($false); $xl.Quit()

# Word 공통
$wd = New-Object -ComObject Word.Application; $wd.DisplayAlerts = 0

# report.docx
$doc = $wd.Documents.Add(); $sel = $wd.Selection
$sel.Style = $doc.Styles.Item(-1); $sel.Font.Size = 24; $sel.Font.Bold = 1; $sel.Font.Color = 0x8A4A1F
$sel.TypeText("Quarterly Sales Report"); $sel.TypeParagraph()
$sel.Font.Size = 12; $sel.Font.Bold = 0; $sel.Font.Color = 0x707070
$sel.TypeText("Q3 2026  ·  Prepared by the Sales Team"); $sel.TypeParagraph(); $sel.TypeParagraph()
$sel.Font.Color = 0
$sel.Style = $doc.Styles.Item(-2); $sel.TypeText("Summary"); $sel.TypeParagraph()
$sel.Style = $doc.Styles.Item(-1)
$sel.TypeText("Total sales reached `$210,900 this quarter, up 14% from Q2. Online sales grew the fastest, and every region beat its September target."); $sel.TypeParagraph()
$sel.Style = $doc.Styles.Item(-2); $sel.TypeText("Sales by region"); $sel.TypeParagraph()
$sel.Style = $doc.Styles.Item(-1)
$t = $doc.Tables.Add($sel.Range, 6, 3); $t.Borders.Enable = 1; $t.Rows.Item(1).Range.Font.Bold = 1; $t.Rows.Item(1).Shading.BackgroundPatternColor = 0xEBD9C6; $t.Range.ParagraphFormat.SpaceAfter = 0
$data = @(@("Region", "Q3 total", "vs. Q2"), @("North", "`$41,350", "+12%"), @("South", "`$31,950", "+9%"), @("East", "`$44,650", "+11%"), @("West", "`$28,600", "+6%"), @("Online", "`$64,350", "+27%"))
for ($r = 0; $r -lt 6; $r++) { for ($c = 0; $c -lt 3; $c++) { $t.Cell($r + 1, $c + 1).Range.Text = $data[$r][$c] } }
$sel.EndKey(6) | Out-Null; $sel.TypeParagraph()
$sel.Style = $doc.Styles.Item(-2); $sel.TypeText("Next steps"); $sel.TypeParagraph()
$sel.Style = $doc.Styles.Item(-49)
$sel.TypeText("Expand the online store to two new markets."); $sel.TypeParagraph()
$sel.TypeText("Run a spring promotion in the West region."); $sel.TypeParagraph()
$sel.TypeText("Review the Q4 targets in the October meeting.")
$doc.SaveAs2("$out\report.docx", 16); $doc.Close()

# brochure.pdf — 사진, 색 배경, 글자가 섞인 한 쪽짜리
$doc = $wd.Documents.Add(); $ps = $doc.PageSetup
$ps.TopMargin = 36; $ps.BottomMargin = 36; $ps.LeftMargin = 42; $ps.RightMargin = 42
$pw = $ps.PageWidth; $phh = $ps.PageHeight
$bg = $doc.Shapes.AddShape(1, 0, 0, $pw, 262); $bg.Fill.ForeColor.RGB = 0x6B3A12; $bg.Line.Visible = 0
$bg.RelativeHorizontalPosition = 1; $bg.RelativeVerticalPosition = 1; $bg.Left = 0; $bg.Top = 0; $bg.WrapFormat.Type = 5
$hero = $doc.Shapes.AddPicture("$ph\1-beach.jpg", $false, $true, 0, 0, 420, 280)
$hero.RelativeHorizontalPosition = 1; $hero.RelativeVerticalPosition = 1; $hero.Left = $pw - 42 - 260; $hero.Top = 50; $hero.Width = 260; $hero.Height = 173; $hero.WrapFormat.Type = 3
$sel = $wd.Selection
$sel.ParagraphFormat.SpaceAfter = 4; $sel.ParagraphFormat.RightIndent = 270
$sel.Font.Name = "Segoe UI"; $sel.Font.Size = 11; $sel.Font.Color = 0xF5E6D9; $sel.Font.Bold = 1
$sel.TypeParagraph(); $sel.TypeText("SUMMER 2026"); $sel.TypeParagraph()
$sel.Font.Size = 34; $sel.Font.Color = 0xFFFFFF
$sel.TypeText("Island Escape"); $sel.TypeParagraph()
$sel.Font.Size = 13; $sel.Font.Bold = 0; $sel.Font.Color = 0xF5E6D9
$sel.TypeText("Four days of beaches, mountain trails and city lights."); $sel.TypeParagraph()
$sel.TypeParagraph(); $sel.TypeParagraph(); $sel.TypeParagraph(); $sel.TypeParagraph(); $sel.TypeParagraph()
$sel.ParagraphFormat.RightIndent = 0; $sel.Font.Color = 0x6B3A12; $sel.Font.Size = 18; $sel.Font.Bold = 1
$sel.TypeText("Trip highlights"); $sel.TypeParagraph()
$sel.Font.Size = 11.5; $sel.Font.Bold = 0; $sel.Font.Color = 0x333333
$items = @(
  @("Day 1  Beach", "Relax on white sand and swim in clear water."),
  @("Day 2  Mountains", "A guided hike to the twin peaks, lunch included."),
  @("Day 3  Sunset", "An evening boat ride along the west coast."),
  @("Day 4  City lights", "Night market tour and a farewell dinner.")
)
foreach ($it in $items) { $sel.Font.Bold = 1; $sel.TypeText($it[0] + "   "); $sel.Font.Bold = 0; $sel.TypeText($it[1]); $sel.TypeParagraph() }
$sel.TypeParagraph()
$y = 520
$x = 42; $gw = ($pw - 84 - 20) / 3
foreach ($f in "2-mountains", "3-sunset", "10-city") {
  $p = $doc.Shapes.AddPicture("$ph\$f.jpg", $false, $true, 0, 0, 200, 133)
  $p.RelativeHorizontalPosition = 1; $p.RelativeVerticalPosition = 1; $p.Left = [single]$x; $p.Top = [single]$y; $p.Width = [single]$gw; $p.Height = [single]($gw * 1067 / 1600); $p.WrapFormat.Type = 3
  $x += $gw + 10
}
$box = $doc.Shapes.AddShape(5, 42, $phh - 150, $pw - 84, 90); $box.Fill.ForeColor.RGB = 0xF3E9DF; $box.Line.Visible = 0
$box.RelativeHorizontalPosition = 1; $box.RelativeVerticalPosition = 1; $box.Left = 42; $box.Top = [single]($phh - 150); $box.WrapFormat.Type = 5
$tf = $box.TextFrame.TextRange
$tf.Text = "From `$899 per person  ·  Book by June 30`rCall 02-123-4567 or visit islandescape.example"
$tf.Font.Name = "Segoe UI"; $tf.Font.Size = 14; $tf.Font.Color = 0x6B3A12; $tf.Font.Bold = 1; $tf.ParagraphFormat.Alignment = 1
$tf.Paragraphs.Item(2).Range.Font.Size = 11; $tf.Paragraphs.Item(2).Range.Font.Bold = 0
$doc.Paragraphs.Item(2).Range.Font.Color = 0xF5E6D9; $doc.SaveAs2("$out\brochure.pdf", 17); $doc.Close(0)
$wd.Quit()
Get-ChildItem $out | Format-Table Name, Length








