# 인수인계 메모 (2026-10-08 저녁 갱신 — Windows PC·Mac 공용)

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
   - **최종본 완성(2026-10-08 저녁):** 이름(Hyeonmin Choi, Jaewu Yoo) 들어감, Mac 지원 반영(Browser 상자 "Chrome / Edge / Safari", Platform "Windows 11 / macOS (Safari 15.4+)"), 아키텍처 그림을 다시 그림(브라우저 탭 하나가 전체를 감싸는 구조 — 서버 없음, 라이브러리마다 역할 표시, CRUD 화살표는 app.js → IndexedDB). Tools는 예시처럼 도구+버전만 남김(IndexedDB는 그림에 있으므로 뺌). Platform은 사용자가 "macOS Golden Gate 27.0"으로 고침. 최종 `poster/DropPDF_poster.pdf` 내보냄. **남은 것: LMS 제출(사용자).**
2. **3분 이내 YouTube 데모 영상** 녹화·업로드, 링크를 Phase 1 구글 시트에 입력. 대본은 [demo/README.md](demo/README.md).
   - **진행 계획(2026-10-08 합의):** 녹음은 사용자가, 나머지는 Claude가 한다.
     1. ~~Claude: 샘플 파일 4개 만들기~~ — 완료(2026-10-08). `demo/samples/`에 `report.docx`, `sales.xlsx`, `trip-photos.zip`(사진 4장, 이름 1·2·3·10으로 자연 정렬 확인용), `brochure.pdf`(사진·색 배경·글자 섞인 1쪽). 사진은 직접 그린 풍경 그림(`demo/photos/`). 다시 만들려면 `demo/make-photos.ps1 demo/photos` → `powershell.exe -File demo/make-samples.ps1 demo` (Windows PowerShell 5.1로 실행 — PowerShell 7은 Office COM 값 설정이 깨짐). 대본·샘플·스크립트는 저장소에 있고, 사진 원본(`demo/photos/`)·녹음·녹화 파일은 올리지 않음(`.gitignore`).
     - **2026-10-09 변경:** 사용자가 화면을 직접 녹화(`Downloads\dropPDF.mp4`, 720p, 소리 없음). Claude가 1080p로 키우고 빠진 장면(결과 PDF, Word 입력, PowerPoint)을 끼워 넣어 편집본 `demo/DropPDF_demo_silent.mp4`(2:02)를 만들고 대본 시간을 그에 맞춤 — [demo/README.md](demo/README.md). 아래 3번은 이걸로 대체됨. **같은 날 갱신:** 친구가 1080p 녹화 `video/DropPDF-demo.mp4`를 올려서 그것으로 다시 편집 → `video/DropPDF-demo-edited.mp4`(2:04). PowerPoint로 바꾸는 장면은 headless Chrome으로 재녹화해 넣음.
     2. **사용자(다음 차례): 편집본을 보며 대본을 통으로 한 번에 녹음** → `demo/narration.m4a`(폰 녹음기 파일 그대로, mp3/wav도 됨). 구간 사이에 **2초쯤 쉬기** — Claude가 쉰 곳으로 구간을 나눈다. 천천히 읽어서 전체 2:40 안팎.
     3. Claude: 보이지 않는 headless Chrome으로 앱을 대본대로 조작하며 화면 녹화(클릭 위치에 커서 표시). Word/PowerPoint 장면은 Office COM으로 결과 파일을 열어 내보낸 실제 화면 이미지로 대체.
     4. Claude: ffmpeg로 녹음의 쉬는 구간에 맞춰 장면을 붙이고, 변환 대기 시간 자르고, 영어 자막(SRT)을 넣어 3분 이내 MP4로 만든다.
     5. 사용자: YouTube 업로드, 구글 시트에 링크 입력.
   - **정한 것(2026-10-08):** 화면 녹화는 (나) 보이지 않는 브라우저, 녹음은 통으로 1개.
   - 도구: Windows PC에는 ffmpeg가 `C:\Users\dchl7\ffmpeg\bin`에 있다(Mac은 확인 필요). Higgsfield 같은 AI 영상 생성은 가짜 앱 화면이 만들어지므로 본편에 쓰지 않는다(쓴다면 짧은 인트로 정도, 이 세션에는 연결 안 됨). Claude in Chrome(브라우저 조작·GIF 녹화, 소리 없음)과 Tella(직접 녹화 + Claude가 편집, 연결 필요)도 선택지로 검토함.
3. ~~실제 Mac에서 확인~~ — 완료(2026-10-08, macOS 27 / Safari 27). 고친 것과 확인한 것:
   - **고침: Safari에서 Word·Excel·PowerPoint·HTML → PDF가 "Rendering page 1/1…"에서 영원히 멈춤.** Safari는 `allow-scripts`가 없는 iframe 안에서 이벤트를 전혀 부르지 않아 html2canvas가 끝나지 않았다. iframe에 `allow-scripts`를 주고, 스크립트는 기존 CSP가 막는다(스크립트 든 HTML로 막히는 것 확인).
   - **고침(Chrome에도 있던 문제): Mac Chrome으로 "PDF로 저장"한 한글 PDF → Word/PowerPoint에서 글자가 두 번 겹쳐 보임.** 이런 PDF는 Type3 글꼴이라 배경 그림에서 글자가 빠지지 않았다.
   - **고침: Mac TextEdit로 저장한 DOCX → PDF가 아주 작게 나옴**(페이지 크기 정보가 없는 파일). 없으면 A4·기본 여백을 넣는다.
   - 확인: Safari + localhost에서 PDF → Word/PowerPoint/PNG/TXT, Word/Excel/PowerPoint/HTML/TXT/사진 → PDF, 다운로드(파일 하나, 여러 결과 ZIP) 모두 정상.
   - 확인: 한글 이름 사진 ZIP — 맥(NFD), Windows(CP949), Finder로 압축(`__MACOSX` 포함) 세 가지 모두 정상, 순서도 1·2·3·10.
   - 확인: Safari가 만든 PDF → Word 결과를 Mac용 Word로 열면 1페이지 그대로, 글자 편집 가능. Mac용 Word에 맑은 고딕이 들어 있어 대체 글꼴 문제 없음.
   - 확인: Safari로 `index.html`을 직접 열어도(file://) 변환·보관함 저장·새로고침 후 유지 모두 됨. Safari 27은 file://에서도 저장되므로 노란 안내는 뜨지 않는 게 정상이다. 저장이 실패하는 경우(비공개 창 등)를 흉내 내면 노란 안내가 뜨고 탭 안 임시 저장으로 계속 됨.
   - 테스트용으로 켠 Safari 설정 **개발자 → "Apple 이벤트의 JavaScript 허용"** 은 끝나면 꺼도 된다.
4. 원격 저장소의 **`master` 브랜치**는 옛 버전 그대로 남아 있고, **GitHub의 기본 브랜치도 `master`** 라서 저장소 첫 화면에 옛 Electron 버전이 보인다. 친구와 상의 후: GitHub 저장소 **Settings → General → Default branch** 를 `main`으로 바꾸고, 필요 없으면 `master`를 삭제. (기본 브랜치 변경은 저장소 관리자 권한으로 웹에서 해야 한다.)
5. ~~`.claude/launch.json`의 `python` 문제~~ — 해결(2026-10-08). `launch.json`은 Windows와 같이 쓰므로 그대로 두고, Mac에 `python` 링크를 만들었다: `ln -s /Library/Developer/CommandLineTools/usr/bin/python3 /opt/homebrew/bin/python`. (`/usr/bin/python3`에 링크하면 안 된다 — 중계 파일이라 `python` 이름으로 부르면 실패함.) 되돌리기: `rm /opt/homebrew/bin/python`.

## 저장소에 없는 것 (Windows PC에만 있음)

- `poster/` — 포스터 PPTX·PDF, 스크린샷
- `demo/photos/`, 녹음·녹화 파일
- `C:\Users\dchl7\Downloads\guaze1_old_backup` — 과제 안내 PDF, 옛 Electron 코드, 옛 `web.zip`
- 브라우저 보관함 데이터(브라우저마다 따로 저장됨)

## 영상 대본

대본·녹음 방법·샘플 파일 설명은 [demo/README.md](demo/README.md)로 옮김(친구도 볼 수 있게 저장소에 올림).
