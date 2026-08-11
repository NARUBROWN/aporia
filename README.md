# Aporia

도메인 전문가가 웹 화면과 데이터 시트를 직접 구성하고 관계를 확인하는 시각적 시스템 빌더입니다.

## 로컬 실행

필요한 프로그램은 Node.js와 npm입니다. 로컬 PostgreSQL을 사용할 때만 Docker가 필요합니다.

```bash
cp .env.example .env
npm install
npm run db:seed
npm run dev
```

[http://localhost:3000/playground](http://localhost:3000/playground)에서 플레이그라운드를 열 수 있습니다.

`.env`에 Supabase 연결 문자열을 설정합니다.

```dotenv
# 앱 런타임: Supabase Transaction pooler 연결 문자열
DATABASE_URL="postgresql://...:6543/postgres"

# Prisma 마이그레이션: Supabase Direct connection 연결 문자열
DIRECT_URL="postgresql://...:5432/postgres"
```

두 연결 문자열은 Supabase 프로젝트의 **Connect** 화면에서 복사할 수 있습니다. 비밀번호에 특수 문자가 있으면 URL 인코딩된 연결 문자열을 사용하세요.

`npm run dev`와 `npm start`는 부팅 전에 `prisma db push`를 실행해 Prisma 모델과 데이터베이스 스키마를 자동으로 동기화합니다. 운영 배포에서 마이그레이션 이력을 엄격하게 관리하려면 자동 동기화 대신 `npm run db:deploy`를 사용하세요.

로컬 PostgreSQL을 대신 사용할 때:

```bash
docker compose up -d
```

로컬 연결 문자열은 다음과 같습니다.

```dotenv
DATABASE_URL="postgresql://aporia:aporia@localhost:5432/aporia"
DIRECT_URL="postgresql://aporia:aporia@localhost:5432/aporia"
```

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

- Supabase PostgreSQL
- Prisma ORM 7
- `projects` 테이블의 `document` JSONB에 편집 문서 저장
- 화면 컴포넌트, 데이터 시트, 내부 행 식별자, 다중 시트 연결 설정 포함
- 편집 후 700ms 단위로 자동 저장
- 문서 저장마다 `version` 증가
- API 문서 크기 제한 5MB

Prisma 스키마와 마이그레이션은 [prisma](prisma), 로컬 PostgreSQL 구성은 [compose.yaml](compose.yaml)에 있습니다.

## 검사

```bash
npm run lint
npm run build
```
