# 인수인계 메모 (2026-10-08, Windows PC → Mac)

다른 컴퓨터에서 이어서 작업할 때 이 파일부터 읽는다. 프로젝트 구조와 코드 규칙은 [CLAUDE.md](CLAUDE.md)에 있다.

## 시작할 때

```bash
git pull
```

앱 실행: `web/index.html`을 Chrome으로 연다. Safari는 아래처럼 localhost로 연다.

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory web
```

코드를 고친 뒤에는 강력 새로고침(Mac **Cmd+Shift+R**, Windows **Ctrl+F5**).
끝낼 때는 `git add -A` → `git commit -m "..."` → `git push`.

## 지금까지 된 것

- `web/` 앱(DropPDF) 완성: Office/HTML/이미지/텍스트 → PDF, PDF → Word/PowerPoint/PNG/JPG/TXT, 사진 ZIP → PDF 하나.
- 변환 목록: 파일마다 형식을 고르고 줄별 **Convert** 또는 **Convert all**. 형식을 바꾸고 다시 Convert하면 다시 올리지 않고 새 형식으로 변환.
- 보관함(CRUD): 검색·필터, View, Download, Convert again(원본 저장), Edit(이름·메모), Delete, Delete all.
- PDF → Word: 페이지마다 원래 크기·방향(가로 포함), 배경·사진·도형은 글자 뒤 그림 한 장, 글자는 앞에서 편집 가능.
- Word 미리보기·Word → PDF: 가로 페이지, 떠 있는 그림·텍스트 상자, 탭 위치, 그림 누락 문제 해결.
- Mac/Safari 대응(Safari 15.4+): NFD 파일 이름, ZIP 이름 인코딩, 저장소 실패 시 탭 안 임시 저장. 실제 Mac Safari에서 확인 완료.
- 옛 Electron 버전은 저장소에서 삭제(git 기록에는 남아 있음).

## 남은 할 일

1. **포스터 제출 — LMS `cse406-phase1-poster-submission`, 10월 9일 13:00까지(팀당 1부).**
   - 포스터 파일은 Windows PC의 `poster/` 폴더에만 있다(저장소에 올리지 않기로 함 — `.gitignore`에 포함). Mac에서 하려면 따로 옮겨 올 것.
   - `[Name 1] · [Name 2]`를 실제 이름으로 바꾸고 PDF로 다시 내보낸 뒤 제출.
2. **3분 이내 YouTube 데모 영상** 녹화·업로드, 링크를 Phase 1 구글 시트에 입력. 대본은 아래.
3. ~~실제 Mac에서 확인~~ — 완료(2026-10-08, macOS 27 / Safari 27). 고친 것과 확인한 것:
   - **고침: Safari에서 Word·Excel·PowerPoint·HTML → PDF가 "Rendering page 1/1…"에서 영원히 멈춤.** Safari는 `allow-scripts`가 없는 iframe 안에서 이벤트를 전혀 부르지 않아 html2canvas가 끝나지 않았다. iframe에 `allow-scripts`를 주고, 스크립트는 기존 CSP가 막는다(스크립트 든 HTML로 막히는 것 확인).
   - **고침(Chrome에도 있던 문제): Mac Chrome으로 "PDF로 저장"한 한글 PDF → Word/PowerPoint에서 글자가 두 번 겹쳐 보임.** 이런 PDF는 Type3 글꼴이라 배경 그림에서 글자가 빠지지 않았다.
   - **고침: Mac TextEdit로 저장한 DOCX → PDF가 아주 작게 나옴**(페이지 크기 정보가 없는 파일). 없으면 A4·기본 여백을 넣는다.
   - 확인: Safari + localhost에서 PDF → Word/PowerPoint/PNG/TXT, Word/Excel/PowerPoint/HTML/TXT/사진 → PDF, 다운로드(파일 하나, 여러 결과 ZIP) 모두 정상.
   - 확인: 한글 이름 사진 ZIP — 맥(NFD), Windows(CP949), Finder로 압축(`__MACOSX` 포함) 세 가지 모두 정상, 순서도 1·2·3·10.
   - 확인: Safari가 만든 PDF → Word 결과를 Mac용 Word로 열면 1페이지 그대로, 글자 편집 가능. Mac용 Word에 맑은 고딕이 들어 있어 대체 글꼴 문제 없음.
   - 확인: Safari로 `index.html`을 직접 열어도(file://) 변환·보관함 저장·새로고침 후 유지 모두 됨. Safari 27은 file://에서도 저장되므로 노란 안내는 뜨지 않는 게 정상이다. 저장이 실패하는 경우(비공개 창 등)를 흉내 내면 노란 안내가 뜨고 탭 안 임시 저장으로 계속 됨.
   - 테스트용으로 켠 Safari 설정 **개발자 → "Apple 이벤트의 JavaScript 허용"** 은 끝나면 꺼도 된다.
4. 원격 저장소의 **`master` 브랜치**는 옛 버전 그대로 남아 있다. 친구와 상의 후 필요 없으면 삭제.
5. ~~`.claude/launch.json`의 `python` 문제~~ — 해결(2026-10-08). `launch.json`은 Windows와 같이 쓰므로 그대로 두고, Mac에 `python` 링크를 만들었다: `ln -s /Library/Developer/CommandLineTools/usr/bin/python3 /opt/homebrew/bin/python`. (`/usr/bin/python3`에 링크하면 안 된다 — 중계 파일이라 `python` 이름으로 부르면 실패함.) 되돌리기: `rm /opt/homebrew/bin/python`.

## 저장소에 없는 것 (Windows PC에만 있음)

- `poster/` — 포스터 PPTX·PDF, 스크린샷
- `C:\Users\dchl7\Downloads\guaze1_old_backup` — 과제 안내 PDF, 옛 Electron 코드, 옛 `web.zip`
- 브라우저 보관함 데이터(브라우저마다 따로 저장됨)

## 영상 대본 (사용 방법만, 약 2:40)

준비: 보관함 비우기(Delete all), Word 열어 두기. 파일: `report.docx`, `sales.xlsx`, `trip-photos.zip`(사진 4장), `brochure.pdf`(사진 포함).

**0:00–0:10 Intro** — 앱 첫 화면
> "Hi, we're [Name 1] and [Name 2]. This is DropPDF, a web app that converts files to and from PDF right in your browser. Nothing to install, and nothing is uploaded."

**0:10–0:30 Add files** — 네 파일을 드롭, 목록 가리키기
> "I just drag my files in: a Word report, an Excel sheet, a ZIP of trip photos, and a PDF brochure. Each row shows what it will become. For PDFs, I can choose the format right on the row: Word, PowerPoint, images, or text."

**0:30–0:50 Convert one file** — `report.docx` 줄 Convert → Download → PDF 열기
> "I can convert just one file. I click Convert on the report, and it's done. One click on Download, and here's the PDF."

**0:50–1:10 Convert all + photo ZIP** — Convert all → ZIP 줄 Download → 페이지 넘기기
> "Or I convert everything at once with Convert all. The ZIP of photos became a single PDF, one photo per page."

**1:10–1:40 PDF → Word** — brochure Download → Word로 열기 → 원본과 나란히 → 단어 입력
> "The brochure PDF became a Word file. The page looks just like the original. The photos and background stay in place, and the text is still editable. I can type right here."

**1:40–1:55 Another format** — brochure 줄을 PowerPoint로 바꾸고 Convert → 열기
> "Need it as slides instead? I just change the format to PowerPoint and convert again. No need to upload the file again."

**1:55–2:30 Library** — 보관함으로 스크롤
> "Every result is saved in the Library, even after I close the browser."
- 검색창에 "trip" → "I can search and filter,"
- brochure.docx **View** → "preview a file,"
- report.pdf **Edit** → 이름 `Q3 report`, 메모 `final version` → "rename it and add a memo,"
- brochure **Convert again** (위 목록 줄이 노랗게 표시) → "send the original back to convert into another format,"
- sales.pdf **Delete** → "and delete what I don't need. There's also Delete all to clear everything."

**2:30–2:40 Wrap-up**
> "That's DropPDF: drop your files, convert, and keep everything in one library. We built it with Claude Code. Thanks for watching!"

팁: 변환 대기 시간은 편집으로 자르기. 마지막 Claude Code 한 줄은 GenAI 사용 표기용이라 남겨 둘 것.
