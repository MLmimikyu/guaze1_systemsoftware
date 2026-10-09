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

## 영상

원본은 친구가 녹화한 `video/DropPDF-demo.mp4` (1080p, 2:40, 소리 없음). `make-video.ps1`이 편집본을 만든다 → **`video/DropPDF-demo-edited.mp4`** (1080p, 2:04, 소리 없음).
- 맨 앞 2초(편집 프로그램 화면)와 변환을 기다리며 멈춰 있던 구간을 잘랐다. 원본의 노란 강조 상자와 말풍선은 그대로 둔다.
- 녹화에 없던 장면을 **앱이 실제로 만든 결과**로 끼워 넣었다: 형식 드롭다운 확대, `report.pdf` 페이지, 사진 PDF 4쪽, Word로 연 `brochure.docx`에 글자 입력, PowerPoint로 연 `brochure.pptx`, 끝 화면.
- 원본에서 빠져 있던 "brochure 형식을 PowerPoint로 바꾸고 Convert 누르기" 장면은 headless Chrome으로 같은 화면 크기에서 다시 녹화해 넣었다(`demo/harness2.js`, `web/__test__/`에 복사해서 씀).
- 다시 만들기: `pwsh demo/make-inserts.ps1 demo/work` → `pwsh demo/make-video.ps1 video/DropPDF-demo.mp4 demo/work`
  (결과 파일은 `web/__test__/`의 headless Chrome 하네스로, Word/PowerPoint 화면은 Office COM으로 만든다.)
## 녹음 방법

- 편집본 영상을 틀어 놓고 아래 시간에 맞춰 읽는다. 한 번에 녹음 (폰 녹음기면 충분, m4a/mp3/wav).
- 구간 사이에 **2초쯤 쉰다** — 쉰 곳을 기준으로 영상에 맞춘다. 시간이 조금 어긋나도 편집에서 맞춘다.
- 파일은 `demo/narration.m4a`로 둔다 (녹음·영상 파일은 저장소에 올리지 않음).

## 대본 (편집본 기준 시간)

**1. Intro** (0:00–0:10) — 앱 첫 화면
> Hi, we're Hyeonmin Choi and Jaewu Yoo. This is DropPDF, a web app that converts files to and from PDF right in your browser. Nothing to install, and nothing is uploaded.

**2. Add files** (0:10–0:29) — 파일 4개를 끌어다 놓음, 줄마다 강조 → 0:25 형식 드롭다운 확대
> I just drag my files in: a Word report, an Excel sheet, a ZIP of trip photos, and a PDF brochure. Each row shows what it will become. For a PDF, I pick the output format right on the row: Word, PowerPoint, images, or text.

**3. Convert one file** (0:29–0:39) — report 줄 Convert → 0:33 만들어진 report.pdf
> I can convert just one file. I click Convert on the report, and it's saved right away. Here's the PDF it made.

**4. Convert all** (0:39–0:51) — Convert all → 0:44 사진 PDF 4쪽
> Or I convert everything at once with Convert all. The ZIP of photos became a single PDF, one photo per page.

**5. PDF → Word** (0:51–1:09) — 보관함 미리보기 → 1:00 Word로 열고 "for summer" 입력
> The brochure PDF became a Word file. Here's the preview, and here it is open in Word. The photos and background stay in place, and the text is still editable. I can type right here.

**6. PowerPoint** (1:09–1:20) — 형식을 PowerPoint로 바꾸고 Convert 클릭 → 1:16 PowerPoint로 연 화면
> Need slides instead? I switch the format to PowerPoint and click Convert again, with no re-upload. Here it is in PowerPoint.

**7. Library** (1:20–1:51) — 보관함
> Every result is saved in the Library, even after I close the browser. I can search and filter, preview a file, rename it and add a memo, send the original back to convert into another format, and delete what I don't need. There's also Delete all to clear everything.

화면 순서 (대략):
- 1:22 검색창에 "trip" → *I can search and filter,*
- 1:27 View → *preview a file,*
- 1:33 Edit → 이름 `Q3 report`, 메모 `final version` → *rename it and add a memo,*
- 1:40 brochure **Convert again** (위 목록 줄이 노랗게 표시됨) → *send the original back to convert into another format,*
- 1:47 sales.pdf **Delete** → *and delete what I don't need. There's also Delete all to clear everything.*

**8. Wrap-up** (1:51–2:04) — 2:00부터 끝 화면
> That's DropPDF: drop your files, convert, and keep everything in one library. Thanks for watching!

GenAI(Claude Code) 사용은 포스터 Tools에 적혀 있으므로 영상에서는 말하지 않는다.

## 진행 순서

1. ~~샘플 파일 만들기~~ — 완료
2. ~~앱 화면 녹화~~ — `video/DropPDF-demo.mp4` (친구 녹화, 1080p)
3. ~~편집본(빠진 장면 넣기)~~ — 완료, `video/DropPDF-demo-edited.mp4`
4. 대본 녹음 → `demo/narration.m4a`
5. 녹음을 편집본에 맞춰 붙이고 영어 자막 → 최종 MP4 (3분 이내)
6. YouTube 업로드, Phase 1 구글 시트에 링크 입력