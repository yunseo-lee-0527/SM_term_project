# StudyFlow Notes

Expo 기반 iPad 필기 실험 프로토타입입니다. 과학적 관리 Term Project에서 필기 과정 개선을 검증하기 위해, Goodnotes와 유사한 자유 필기 환경에 실험용 도형 삽입과 세션 로그 수집 기능을 붙인 상태입니다.

## 현재 상태

- Expo SDK 54, React Native 0.81, React 19 기반 앱입니다.
- iPad + Expo Go 실행을 주 대상으로 합니다.
- 필기 데이터와 세션 로그는 `AsyncStorage`에 저장됩니다.
- 캔버스 렌더링은 `@shopify/react-native-skia`를 사용합니다.
- 터널 실행을 위해 `@expo/ngrok`와 `scripts/start-expo-tunnel.js`가 포함되어 있습니다.
- 일부 앱 내부 한국어 UI 문자열은 현재 소스에서 인코딩이 깨진 상태라 화면에서도 깨져 보일 수 있습니다.

## 주요 기능

- Skia 기반 필기 캔버스
- 펜 색상 및 굵기 조절
- 전체 획 지우개와 정밀 지우개
- 실행 취소 / 다시 실행
- 여러 페이지 추가, 전환, 삭제
- 두 손가락 이동 및 pinch zoom
- 선을 그리고 잠깐 멈추면 직선으로 보정되는 draw-and-hold 동작
- 실험용 도형 삽입 패널
  - Normal curve, Hyperbola, Exponential decay, Log curve
  - Sin curve, Tan curve, Semicircle, Quadrant
  - Matrix, Table, Determinant
- 삽입한 도형 선택, 이동, 크기 조절
- Matrix/Table/Determinant의 row/column 수 조절
- 세션 기록
  - 참가자, 조건 A/B, 노트 입력
  - 필기, 지우기, 도형 삽입, 도형 이동/크기 변경, 이동/확대, 페이지 변경, undo/redo 이벤트 기록
  - 현재 세션 JSON 내보내기

## A/B 실험 구성

세션 시작 시 선택한 조건에 따라 런타임에서 변형(variant)을 전환하는 단일 앱입니다.

- A(베이스라인): 도형 삽입 비활성
- B(개선): 실험용 도형 삽입 활성

두 조건 모두 동일한 페이지 기반 캔버스를 사용합니다. 기능 플래그는 `src/constants/variant.ts`에서 관리합니다.

## 실행

의존성 설치:

```bash
npm install
```

기본 실행:

```bash
npm start
```

같은 Wi-Fi의 iPad에서 Expo Go로 QR 코드를 스캔해 실행합니다. 같은 네트워크 접속이 불안정하거나 외부 네트워크의 iPad로 접속해야 하면 터널 모드를 사용합니다.

```bash
npm run start:tunnel
```

터널에서 `HTTP 502: no connected tunnel source`가 뜨면 기존 QR이나 링크가 stale 상태일 가능성이 큽니다. Metro를 종료한 뒤 터널을 다시 시작하고 새 QR을 스캔하세요.

```bash
npm run start:tunnel -- -c
```

### iPad 접속 문제 해결

- 터널 URL은 오래 켜두면 끊길 수 있으므로, 문제가 생기면 기존 QR 대신 새로 띄운 QR을 사용합니다.
- Expo Go에서 이전 프로젝트가 계속 열리면 앱을 완전히 종료한 뒤 새 QR을 다시 스캔합니다.
- 노트북이 절전 모드에 들어가거나 Wi-Fi/VPN이 바뀌면 Metro와 터널 연결이 끊길 수 있습니다.
- 같은 Wi-Fi에 붙어 있는 iPad라면 터널보다 기본 LAN 실행(`npm start`)이 더 안정적입니다.

## 검증

타입 체크:

```bash
npm run typecheck
```

테스트:

```bash
npm test
```

## 프로젝트 구조

```text
App.tsx                         앱 진입점 및 전체 상태 관리
src/components/HandwritingCanvas.tsx
                                Skia 필기 캔버스, 제스처, 도형 조작
src/components/Toolbar.tsx      도구 선택, 색상/굵기, 세션 기록 UI
src/components/PageStrip.tsx    페이지 전환/추가/삭제
src/components/SessionSetupModal.tsx
                                세션 시작 정보 입력
src/constants/variant.ts        A/B 실험 변형 기능 플래그
src/lib/notebook.ts             노트북/페이지/히스토리 상태 유틸
src/lib/geometry.ts             좌표, 지우개, 캔버스 기하 유틸
src/lib/shapePresets.ts         실험용 도형 프리셋
src/lib/sessionLog.ts           세션 이벤트 기록 및 JSON 내보내기
src/lib/storage.ts              AsyncStorage 저장/불러오기
scripts/start-expo-tunnel.js    Expo 터널 실행 래퍼
scripts/patch-expo-ngrok.js     @expo/ngrok 응답 처리 패치
```

## 개발 메모

- 서버가 실행 중일 때는 앱 소스 변경보다 README나 문서 변경 위주로 작업하는 편이 안전합니다.
- `postinstall`에서 `scripts/patch-expo-ngrok.js`가 실행되어 ngrok 응답 처리 문제를 보완합니다.
- 터널보다 같은 Wi-Fi의 LAN 실행이 가능한 경우 `npm start`가 더 안정적입니다.
