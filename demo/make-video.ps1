# 원본 화면 녹화(dropPDF.mp4)를 1080p로 키우고, 빠진 장면(결과 PDF, Word, PowerPoint)을 끼워 넣는다.
# 실행: pwsh demo/make-video.ps1 <원본.mp4> demo/work [narration 파일(선택)]
$src = $args[0]; $work = $args[1]; $narr = $args[2]
$env:Path += ";C:\Users\dchl7\ffmpeg\bin"
$ins = Join-Path $work "inserts"; $seg = Join-Path $work "segments"
Remove-Item -Recurse -Force $seg -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force $seg | Out-Null
$enc = @("-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-an")
$up = "scale=1920:1080:flags=lanczos,unsharp=5:5:0.6:5:5:0.0"

# [종류, 시작/파일, 길이, 메모]
$plan = @(
  @("v", 4.0, 10.0, "1 intro"),
  @("v", 14.0, 10.5, "2 add files"),
  @("zoom", 24.5, 4.5, "2 format dropdown"),
  @("v", 29.0, 4.0, "2 rows"),
  @("v", 33.0, 5.0, "3 convert one"),
  @("i", "report.png", 6.0, "3 report pdf"),
  @("v", 53.0, 5.0, "4 convert all"),
  @("i", "photos.png", 7.0, "4 photos pdf"),
  @("v", 73.5, 8.5, "5 docx preview"),
  @("i", "word_00.png", 2.5, "5 word open"),
  @("i", "word_01.png", 1.0, "5 cursor")
)
2..11 | ForEach-Object { $plan += , @("i", ("word_{0:D2}.png" -f $_), 0.25, "5 typing") }
$plan += @(
  @("i", "word_12.png", 3.5, "5 typed"),
  @("v", 101.5, 5.5, "6 to powerpoint"),
  @("i", "ppt_00.png", 5.0, "6 pptx"),
  @("v", 118.0, 28.0, "7 library"),
  @("v", 146.0, 10.0, "8 wrap-up"),
  @("i", "end.png", 4.0, "8 end card")
)

$list = @(); $n = 0; $t = 0.0; $marks = @()
foreach ($p in $plan) {
  $out = Join-Path $seg ("{0:D2}.mp4" -f $n)
  switch ($p[0]) {
    "v" { ffmpeg -v error -y -ss $p[1] -t $p[2] -i $src -vf "$up,fps=30" @enc $out }
    "zoom" {
      # 형식 드롭다운 부분을 3배 확대하고 노란 테두리로 표시
      ffmpeg -v error -y -ss $p[1] -t $p[2] -i $src -vf "crop=640:360:140:264,scale=1920:1080:flags=lanczos,unsharp=5:5:0.8,drawbox=x=930:y=495:w=258:h=96:color=0xF5B700:t=8,fps=30" @enc $out
    }
    "i" { ffmpeg -v error -y -loop 1 -t $p[2] -i (Join-Path $ins $p[1]) -vf "scale=1920:1080,fps=30" @enc $out }
  }
  $list += "file '$($out.Replace('\', '/'))'"
  $marks += "{0,6:N2}s  {1}" -f $t, $p[3]
  $t += [double]$p[2]; $n++
}
$list | Set-Content (Join-Path $seg "list.txt") -Encoding ascii
$silent = Join-Path $work "DropPDF_demo_silent.mp4"
ffmpeg -v error -y -f concat -safe 0 -i (Join-Path $seg "list.txt") -f lavfi -i anullsrc=r=48000:cl=stereo -c:v copy -c:a aac -shortest -movflags +faststart $silent
$marks | Set-Content (Join-Path $work "timeline.txt")
$marks
"total {0:N2}s" -f $t

