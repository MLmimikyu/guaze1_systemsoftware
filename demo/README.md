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

## 녹음 방법

- 아래 대본을 **처음부터 끝까지 한 번에** 녹음한다 (폰 녹음기면 충분, m4a/mp3/wav).
- 구간(1~8) 사이마다 **2초쯤 쉰다** — 쉰 곳을 기준으로 화면을 맞춘다.
- 천천히 읽어서 전체 **2분 40초 안팎**.
- 파일은 `demo/narration.m4a`로 둔다 (녹음·영상 파일은 저장소에 올리지 않음).

## 대본

준비: 보관함 비우기(Delete all).

**1. Intro** (0:00–0:10) — 앱 첫 화면
> Hi, we're Hyeonmin Choi and Jaewu Yoo. This is DropPDF, a web app that converts files to and from PDF right in your browser. Nothing to install, and nothing is uploaded.

**2. Add files** (0:10–0:30) — 네 파일을 끌어다 놓고 목록 가리키기
> I just drag my files in: a Word report, an Excel sheet, a ZIP of trip photos, and a PDF brochure. Each row shows what it will become. For PDFs, I can choose the format right on the row: Word, PowerPoint, images, or text.

**3. Convert one file** (0:30–0:50) — `report.docx` 줄 Convert → Download → PDF 열기
> I can convert just one file. I click Convert on the report, and it's done. One click on Download, and here's the PDF.

**4. Convert all** (0:50–1:10) — Convert all → ZIP 줄 Download → 페이지 넘기기
> Or I convert everything at once with Convert all. The ZIP of photos became a single PDF, one photo per page.

**5. PDF → Word** (1:10–1:40) — brochure Download → Word로 열기 → 원본과 나란히 → 단어 입력
> The brochure PDF became a Word file. The page looks just like the original. The photos and background stay in place, and the text is still editable. I can type right here.

**6. Another format** (1:40–1:55) — brochure 줄을 PowerPoint로 바꾸고 Convert → 열기
> Need it as slides instead? I just change the format to PowerPoint and convert again. No need to upload the file again.

**7. Library** (1:55–2:30) — 보관함으로 스크롤
> Every result is saved in the Library, even after I close the browser. I can search and filter, preview a file, rename it and add a memo, send the original back to convert into another format, and delete what I don't need. There's also Delete all to clear everything.

화면 순서:
- 검색창에 "trip" → *I can search and filter,*
- brochure.docx **View** → *preview a file,*
- report.pdf **Edit** → 이름 `Q3 report`, 메모 `final version` → *rename it and add a memo,*
- brochure **Convert again** (위 목록 줄이 노랗게 표시됨) → *send the original back to convert into another format,*
- sales.pdf **Delete** → *and delete what I don't need. There's also Delete all to clear everything.*

**8. Wrap-up** (2:30–2:40)
> That's DropPDF: drop your files, convert, and keep everything in one library. Thanks for watching!

GenAI(Claude Code) 사용은 포스터 Tools에 적혀 있으므로 영상에서는 말하지 않는다.

## 진행 순서

1. ~~샘플 파일 만들기~~ — 완료
2. 대본 녹음 → `demo/narration.m4a`
3. 앱 화면 녹화 (보이지 않는 Chrome으로 대본대로 자동 조작, 클릭 위치 표시). Word/PowerPoint 장면은 실제 결과 파일 화면 이미지로.
4. 녹음에 맞춰 편집, 변환 대기 시간 자르기, 영어 자막 → 3분 이내 MP4
5. YouTube 업로드, Phase 1 구글 시트에 링크 입력
