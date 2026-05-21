# StudyFlow Notes

Expo 기반 iPad 필기 앱 프로토타입입니다. Goodnotes와 유사한 페이지/툴바/필기 경험을 기본으로 두고, 과학적 관리 Term Project에서 제안한 필기 공정 개선 기능을 추가했습니다.

## 주요 기능

- Skia 기반 펜/형광펜/지우개 필기
- 펜/지우개 빠른 전환
- 펜 굵기와 지우개 크기 독립 조절
- 두 손가락 이동 및 pinch zoom
- 페이지 추가/전환
- 실행 취소/다시 실행
- AsyncStorage 자동 저장
- 편집 가능한 Elements 레이어
  - 좌표축: 1D/2D/3D 선택
  - 분포: 정규, 균등, 지수, 쌍봉, 우편향
  - 함수: `sin(x)`, `x^2`, `cos(x)` 등 수식 입력
  - 벡터: 시작점/끝점 핸들 자유 이동
  - 행렬: 행/열 자리 가이드
  - 표: 행/열/길이/색상 조절
- 휴식 타이머: 탭으로 시작/정지, 길게 눌러 5분 추가

## 실행

```bash
npm install
npm start
```

iPad에서는 Expo Go로 QR 코드를 스캔해 실행합니다. 네트워크 연결이 불안정하면 다음 명령을 사용합니다.

```bash
npm run start:tunnel
```

## 검증

```bash
npm run typecheck
npm test
```
