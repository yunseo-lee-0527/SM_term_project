# InkPad Lab

GoodNotes처럼 iPad에서 바로 필기해볼 수 있는 Expo 기반 필기 앱 클론입니다. 파일 관리나 동기화보다 Apple Pencil/터치 필기, 형광펜, 지우개, 확대/이동, 페이지 전환 같은 필기 경험에 초점을 맞췄습니다.

## 주요 기능

- Skia 캔버스 기반 필기 렌더링
- 펜, 형광펜, whole-stroke 지우개
- Apple Pencil 압력값 기반 선 굵기 변화
- 속도 기반 선 굵기 보정과 포인트 보간/스무딩
- 두 손가락 페이지 이동 및 pinch zoom
- 실행취소/다시실행
- 페이지 추가 및 페이지 전환
- AsyncStorage 자동 저장

## 실행 준비

Node.js와 npm이 필요합니다. iPad에서 실행하려면 App Store에서 **Expo Go**를 설치해 주세요.

```bash
npm install
```

## iPad에서 실행

같은 Wi-Fi에서 잘 잡히면 기본 실행으로 충분합니다.

```bash
npm start
```

네트워크가 다르거나 학교/회사 Wi-Fi에서 기기 연결이 막힐 때는 tunnel 모드가 더 안정적입니다.

```bash
npm run start:tunnel
```

터미널에 QR 코드가 뜨면 iPad의 Expo Go 앱으로 스캔합니다. iOS 카메라 앱으로 QR을 스캔해도 Expo Go로 열 수 있습니다.

## 사용법

- 상단 툴바에서 펜, 형광펜, 지우개를 전환합니다.
- 색상 swatch로 잉크 색상을 바꿉니다.
- `-` / `+` 버튼으로 필기 굵기를 조절합니다.
- 한 손가락 또는 Apple Pencil로 필기합니다.
- 두 손가락으로 캔버스를 이동하고, pinch로 확대/축소합니다.
- 왼쪽 페이지 목록에서 페이지를 추가하거나 다른 페이지로 이동합니다.

## 검증

TypeScript 정적 검사는 다음 명령으로 실행합니다.

```bash
npm run typecheck
```

좌표 변환, 지우개 hit test, 압력 기반 굵기 계산 같은 순수 로직 테스트는 다음 명령으로 실행합니다.

```bash
npm test
```

## 범위

이 프로젝트는 수업용/데모용 필기 앱입니다. PDF import/export, iCloud 동기화, 실제 폴더 관리, App Store 배포 빌드는 구현 범위에 포함하지 않았습니다.

## 문제 해결

- QR 스캔 후 연결이 안 되면 `npm run start:tunnel`을 사용합니다.
- Expo Go에서 번들 캐시 문제가 보이면 `npx expo start -c --tunnel`로 캐시를 지우고 실행합니다.
- Apple Pencil 압력값은 실제 iPad 기기에서 확인해야 합니다. 웹 실행이나 일부 터치 입력에서는 기본 압력값으로 대체됩니다.
- iOS 시뮬레이터 실행은 macOS/Xcode가 필요합니다. Windows에서는 iPad + Expo Go 실행 흐름을 권장합니다.
