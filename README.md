# DropPDF

파일을 드래그 앤 드롭해 PDF로 변환하는 로컬 Windows 데스크톱 앱입니다. 파일을 외부 서버로 업로드하지 않습니다.

앱이 켜진 상태에서 파일을 드롭하면 변환을 즉시 시작합니다. 변환이 끝나면 PDF를 저장하고 Windows 탐색기에서 생성된 파일을 자동으로 표시합니다. 저장 폴더를 지정하지 않으면 원본 파일이 있던 폴더에 저장합니다.

## 지원 형식

- 이미지: JPG, JPEG, PNG, WEBP, GIF, BMP
- 텍스트: TXT, TEXT, LOG, MD
- 웹 문서: HTML, HTM
- Office 및 OpenDocument: DOC(X), XLS(X), PPT(X), ODT, ODS, ODP, RTF
  - Office 계열 파일은 [LibreOffice](https://www.libreoffice.org/)가 설치되어 있어야 합니다.

## 설치 및 실행

```powershell
pnpm install
pnpm dev
```

## 테스트

```powershell
pnpm test
```

## Windows 실행 파일 만들기

```powershell
pnpm package:win
```

완료되면 `dist/DropPDF-win32-x64/DropPDF.exe`를 실행합니다. 실행 파일과 같은 폴더의 DLL 및 `resources` 폴더가 함께 있어야 합니다.

기본적으로 생성된 PDF는 원본 파일과 같은 폴더에 저장됩니다. 앱에서 별도 저장 폴더를 지정할 수도 있습니다. 같은 이름의 PDF가 이미 있으면 `(1)`, `(2)`와 같은 번호를 붙여 기존 파일을 보호합니다.
