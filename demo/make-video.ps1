# 화면 녹화(video/DropPDF-demo.mp4)를 1080p로 맞추고, 빠진 장면(결과 PDF, Word, PowerPoint)을 끼워 넣는다.
# 실행: pwsh demo/make-video.ps1 video/DropPDF-demo.mp4 demo/work
$src = $args[0]; $work = $args[1]; $narr = $args[2]
$env:Path += ";C:\Users\dchl7\ffmpeg\bin"
$ins = Join-Path $work "inserts"; $seg = Join-Path $work "segments"
Remove-Item -Recurse -Force $seg -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force $seg | Out-Null
$enc = @("-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-an")
$up = "scale=1920:1080:flags=lanczos"

# [종류, 시작/파일, 길이, 메모, (선택) 끝 화면을 더 멈춰 둘 초]  — 원본: video/DropPDF-demo.mp4 (친구가 녹화한 1080p)
# 자막을 초당 12자 이하로 읽을 수 있게 구간마다 길이를 잡았다 (전체 약 2:55).
$plan = @(
  @("i", "title.png", 7.0, "0 title card"),
  @("v", 2.1, 9.9, "1 intro", 3.6),
  @("v", 12.0, 15.5, "2 add files"),
  @("zoom", 27.5, 3.5, "2 format dropdown", 4.5),
  @("v", 31.0, 5.5, "3 convert one"),
  @("i", "report.png", 10.5, "3 report pdf"),
  @("v", 51.0, 6.0, "4 convert all"),
  @("i", "photos.png", 11.5, "4 photos pdf"),
  @("v", 71.0, 10.0, "5 docx preview"),
  @("i", "word_00.png", 4.5, "5 word open"),
  @("i", "word_01.png", 1.0, "5 cursor")
)
2..11 | ForEach-Object { $plan += , @("i", ("word_{0:D2}.png" -f $_), 0.25, "5 typing") }
$plan += @(
  @("i", "word_12.png", 8.0, "5 typed"),
  @("clip", "rec", 0, "6 to powerpoint (re-recorded)", 4.3),
  @("i", "ppt_00.png", 7.0, "6 pptx"),
  @("v", 111.5, 6.5, "7 library + search"),
  @("zoom2", 118.0, 3.5, "7 search zoom", 1.0),
  @("v", 121.5, 15.5, "7 view, edit, convert again", 2.0),
  @("v", 137.0, 13.0, "7 delete"),
  @("v", 150.0, 8.0, "8 wrap-up"),
  @("i", "end.png", 5.0, "8 end card")
)
$list = @(); $n = 0; $t = 0.0; $marks = @()
foreach ($p in $plan) {
  $out = Join-Path $seg ("{0:D2}.mp4" -f $n)
  $hold = if ($p.Count -gt 4) { [double]$p[4] } else { 0 }
  $pad = if ($hold -gt 0) { ",tpad=stop_mode=clone:stop_duration=$hold" } else { "" }
  switch ($p[0]) {
    "v" { ffmpeg -v error -y -ss $p[1] -t $p[2] -i $src -vf "$up,fps=30$pad" @enc $out }
    "zoom" {
      # 형식 드롭다운 부분을 2배 확대하고 노란 테두리로 표시
      ffmpeg -v error -y -ss $p[1] -t $p[2] -i $src -vf "crop=960:540:260:397,scale=1920:1080:flags=lanczos,drawbox=x=836:y=498:w=248:h=84:color=0xF5C400:t=6,fps=30$pad" @enc $out
    }
    "zoom2" {
      # 보관함 검색 부분 확대
      ffmpeg -v error -y -ss $p[1] -t $p[2] -i $src -vf "crop=1280:720:330:480,scale=1920:1080:flags=lanczos,drawbox=x=84:y=662:w=448:h=68:color=0xF5C400:t=6,fps=30$pad" @enc $out
    }
    "clip" {
      # headless Chrome으로 다시 녹화한 장면(demo/work/rec, 프레임마다 길이가 다름)
      ffmpeg -v error -y -f concat -safe 0 -i (Join-Path (Join-Path $work $p[1]) "concat.txt") -vf "scale=1920:1080,fps=30$pad" @enc $out
      $p[2] = [double](ffprobe -v error -show_entries format=duration -of csv=p=0 $out) - $hold
    }
    "i" { ffmpeg -v error -y -loop 1 -t $p[2] -i (Join-Path $ins $p[1]) -vf "scale=1920:1080,fps=30" @enc $out }
  }
  $list += "file '$($out.Replace('\', '/'))'"
  $marks += "{0,6:N2}s  {1}" -f $t, $p[3]
  $t += [double]$p[2] + $hold; $n++
}$list | Set-Content (Join-Path $seg "list.txt") -Encoding ascii
$silent = Join-Path $work "DropPDF_demo_silent.mp4"
ffmpeg -v error -y -f concat -safe 0 -i (Join-Path $seg "list.txt") -f lavfi -i anullsrc=r=48000:cl=stereo -c:v copy -c:a aac -shortest -movflags +faststart $silent
$marks | Set-Content (Join-Path $work "timeline.txt")
$marks
"total {0:N2}s" -f $t






