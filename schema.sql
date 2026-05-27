-- 업무 관리 시스템 D1 데이터베이스 스키마
CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT '진행 중' CHECK(status IN ('진행 중', '완료')),
    priority     TEXT NOT NULL DEFAULT '보통'   CHECK(priority IN ('높음', '보통', '낮음')),
    assignee     TEXT,
    description  TEXT,
    created_at   TEXT,
    due_date     TEXT,
    completed_at TEXT
);
