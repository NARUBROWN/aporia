# Aporia

도메인 전문가가 웹 화면과 데이터 시트를 직접 구성하고 관계를 확인하는 시각적 시스템 빌더입니다.

## 로컬 실행

필요한 프로그램은 Node.js, npm, Docker입니다.

```bash
cp .env.example .env.local
docker compose up -d
npm install
npm run dev
```

[http://localhost:3000/playground](http://localhost:3000/playground)에서 플레이그라운드를 열 수 있습니다.

PostgreSQL 상태 확인:

```bash
docker compose ps
```

종료:

```bash
docker compose down
```

`docker compose down`은 컨테이너만 종료하며 데이터 볼륨은 유지합니다.

## 저장 구조

- PostgreSQL 17
- `projects` 테이블의 `document` JSONB에 편집 문서 저장
- 화면 컴포넌트, 데이터 시트, 내부 행 식별자, 다중 시트 연결 설정 포함
- 편집 후 700ms 단위로 자동 저장
- 문서 저장마다 `version` 증가
- API 문서 크기 제한 5MB

초기 스키마는 [database/init.sql](database/init.sql), PostgreSQL 구성은 [compose.yaml](compose.yaml)에 있습니다.

## 검사

```bash
npm run lint
npm run build
```
