# DropPDF 데모 영상 자료

3분 이내 YouTube 데모 영상에 쓰는 대본과 샘플 파일이다.

## 샘플 파일 (`samples/`)

| 파일 | 내용 | 영상에서 |
|---|---|---|
| `report.docx` | 3분기 매출 보고서 1쪽 (제목, 표, 글머리 기호) | 하나만 변환 → PDF |
| `sales.xlsx` | 지역별 3분기 매출표 (합계 수식) | Convert all → PDF, 보관함에서 Delete |
| `trip-photos.zip` | 여행 사진 4장 (`1-beach`, `2-mountains`, `3-sunset`, `10-city`) | 사진을 PDF 한 개로 (1·2·3·10 순서) |
| `brochure.pdf` | 여행 브로셔 1쪽 (사진, 색 배경, 글자) | PDF → Word, 다시 PowerPoint |

사진은 실제 사진이 아니라 직접 그린 풍경 그림이라 영상에 써도 저작권 문제가 없다.
직접 해 보려면 `web/index.html`을 Chrome으로 열고 네 파일을 끌어다 놓으면 된다.

다시 만들기(Windows, Office 필요; PowerShell 7 말고 Windows PowerShell 5.1로 실행):

```bash
powershell.exe -ExecutionPolicy Bypass -File demo/make-photos.ps1 demo/photos
powershell.exe -ExecutionPolicy Bypass -File demo/make-samples.ps1 demo
```

## 영상 (최종)

**`video/DropPDF-demo-subtitled.mp4`** — 1080p, **2:31**, 내레이션 + 영어 자막. YouTube에는 이 파일을 올린다. (`video/DropPDF-demo.srt`는 YouTube 자막 파일로 따로 올려도 됨, `video/DropPDF-demo-edited.mp4`는 자막 없는 버전)

- 화면: 친구가 녹화한 `video/DropPDF-demo.mp4`(1080p)에서 멈춰 있던 구간을 자르고, 앞에 제목 화면, 끝에 마무리 화면을 넣었다. 원본의 노란 강조 상자와 말풍선은 그대로.
- 녹화에 없던 장면은 **앱이 실제로 만든 결과**로 넣었다: 형식 드롭다운 확대, `report.pdf`, 사진 PDF 4쪽, Word로 연 `brochure.docx`에 글자 입력, PowerPoint로 연 `brochure.pptx`, 보관함 검색 확대. "형식을 PowerPoint로 바꾸고 Convert" 장면은 headless Chrome으로 같은 화면 크기에서 다시 녹화했다(`demo/harness2.js`).
- 내레이션: `demo/narration.m4a`(통으로 녹음, 저장소에는 없음). 무음 구간과 Whisper 받아쓰기로 문장 위치를 찾고, 말 없는 앞부분과 첫 시도에서 끊긴 "We hope…"는 뺐다. 잡음 줄이기·음량 맞추기 후, 말하는 순간에 해당 화면이 나오도록 구간 길이를 맞췄다. 배치표는 `demo/narration-plan.txt`.
- 자막: 실제로 읽은 말 그대로(이름·DropPDF 표기만 바로잡음), 모서리가 둥근 반투명 배경.

다시 만들기 (Windows, ffmpeg + Office + Python):
1. `pwsh demo/make-inserts.ps1 demo/work` — 끼워 넣을 장면 (결과 파일은 `web/__test__/`의 headless Chrome 하네스, Word/PowerPoint 화면은 Office COM)
2. `pwsh demo/make-video.ps1 video/DropPDF-demo.mp4 demo/work` — 화면 편집본 (구간 길이는 내레이션에 맞춰 둠)
3. `python demo/transcribe.py demo/narration.m4a` — (녹음을 바꿨을 때만) 받아쓰기, 그 결과로 `narration-plan.txt`를 고친다
4. `pwsh demo/make-narration.ps1` — 내레이션 붙이기 + `subtitles.txt` 생성 + `make-subtitles.ps1`(자막 영상, SRT)

## 대본 (실제 녹음 기준, 영상 시간)

**1. Intro** (0:00–0:16) — 제목 화면 → 앱 첫 화면
> Hi, we're Hyeonmin and Jaewu, and this is DropPDF. It turns your files into PDFs, and turns PDFs back into Word or PowerPoint, all right in your browser. There's nothing to install, and your files never leave your computer.

**2. Add files** (0:16–0:40) — 파일 4개를 끌어다 놓음 → 0:32 형식 드롭다운 확대
> Let's start by dragging in a few files: a Word report, an Excel sheet, a ZIP full of trip photos, and a PDF brochure. Each row shows what the file will turn into. Since the brochure is already a PDF, I get to choose what it becomes. It can be Word, PowerPoint, images, or a plain text file.

**3. Convert one file** (0:40–0:54) — report 줄 Convert → 0:47 만들어진 report.pdf
> If I only need one file, I can just click Convert on that row. In a moment, the report is saved, and here's the PDF it made. You can see the table and layout, just like the original.

**4. Convert all** (0:54–1:09) — Convert all → 0:59 사진 PDF 4쪽
> For everything else, you can click Convert all. So instead of four separate files, DropPDF puts every photo into one PDF, one page per photo, in the right order.

**5. PDF → Word** (1:09–1:26) — 보관함 미리보기 → 1:14 Word로 열고 1:19 "for summer" 입력
> The brochure is now a Word document. Here's a quick preview in the Library, and here it is open in Microsoft Word. It's not just a picture of the page. I can click into the heading and keep typing, while the photos and background stay right where they were.

**6. PowerPoint** (1:26–1:44) — 형식을 PowerPoint로 바꾸고 Convert → 1:40 PowerPoint로 연 화면
> The same brochure can also become slides. I just switch the format to PowerPoint and hit Convert again, with no need to upload anything twice. And here's the brochure as a PowerPoint slide.

**7. Library** (1:44–2:18) — 1:51 검색, 1:55 View, 1:59 Edit, 2:06 Convert again, 2:13 Delete
> Every result is saved in the Library, so it's still here even after I close the browser. I can search to find a file quickly, open a preview without downloading it, and rename a file or add a memo so I can remember what it's for. If I need another format later, Convert again sends the original back to the list, so I don't have to dig it up again. Anything I don't need is one click to delete, and Delete all clears the whole library.

**8. Wrap-up** (2:18–2:31) — 2:25부터 끝 화면
> Okay, so that's DropPDF: drop in your files, pick a format, and keep everything organized in one place. We hope it saves you some time. Thank you for watching.
GenAI(Claude Code) 사용은 포스터 Tools에 적혀 있으므로 영상에서는 말하지 않는다.

## 진행 순서

1. ~~샘플 파일~~ 2. ~~화면 녹화(친구)~~ 3. ~~편집~~ 4. ~~녹음~~ 5. ~~내레이션·자막 붙이기~~ — 완료, `video/DropPDF-demo-subtitled.mp4`
6. YouTube 업로드, Phase 1 구글 시트에 링크 입력