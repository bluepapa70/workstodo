// Cloudflare Workers 진입점 - D1 DB 연동 업무 관리 REST API

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResp(data, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

// 요청 바디에서 필드 추출 (없으면 기존값 유지, 빈문자열이면 null)
function pick(body, key, fallback) {
  if (!(key in body)) return fallback;
  const v = body[key];
  if (typeof v === 'string') return v.trim() || null;
  return v ?? null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await route(request, env, url.pathname);
      } catch (err) {
        return jsonResp({ error: err.message }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function route(request, env, path) {
  const method = request.method;

  // GET /api/tasks
  if (path === '/api/tasks' && method === 'GET') {
    const { results } = await env.DB
      .prepare('SELECT * FROM tasks ORDER BY created_at DESC, due_date ASC')
      .all();
    return jsonResp(results);
  }

  // POST /api/tasks
  if (path === '/api/tasks' && method === 'POST') {
    const body = await request.json();
    const title = body.title?.trim();
    if (!title) return jsonResp({ error: '작업 이름은 필수입니다.' }, 400);

    const id     = crypto.randomUUID();
    const today  = new Date().toISOString().split('T')[0];
    const status = body.status === '완료' ? '완료' : '진행 중';
    const prios  = ['높음', '보통', '낮음'];

    await env.DB.prepare(
      `INSERT INTO tasks
         (id, title, status, priority, assignee, description, created_at, due_date, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      title,
      status,
      prios.includes(body.priority) ? body.priority : '보통',
      body.assignee?.trim() || null,
      body.description?.trim() || null,
      body.created_at || today,
      body.due_date || null,
      status === '완료' ? (body.completed_at || today) : null,
    ).run();

    const task = await env.DB
      .prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
    return jsonResp(task, 201);
  }

  // /api/tasks/:id 라우트
  const match = path.match(/^\/api\/tasks\/([^/]+)$/);
  if (match) {
    const id = match[1];

    // PUT /api/tasks/:id
    if (method === 'PUT') {
      const existing = await env.DB
        .prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
      if (!existing) return jsonResp({ error: '존재하지 않는 업무입니다.' }, 404);

      const body      = await request.json();
      const today     = new Date().toISOString().split('T')[0];
      const prios     = ['높음', '보통', '낮음'];
      const newStatus = 'status' in body ? body.status : existing.status;

      // 완료 처리 시 completed_at 자동 기록, 진행 중 복귀 시 초기화
      const completed_at = newStatus === '완료'
        ? (existing.completed_at || today)
        : null;

      const newPriority = 'priority' in body && prios.includes(body.priority)
        ? body.priority
        : existing.priority;

      await env.DB.prepare(
        `UPDATE tasks
         SET title=?, status=?, priority=?, assignee=?, description=?,
             created_at=?, due_date=?, completed_at=?
         WHERE id=?`
      ).bind(
        pick(body, 'title', existing.title) || existing.title,
        newStatus,
        newPriority,
        pick(body, 'assignee', existing.assignee),
        pick(body, 'description', existing.description),
        pick(body, 'created_at', existing.created_at),
        pick(body, 'due_date', existing.due_date),
        completed_at,
        id,
      ).run();

      const updated = await env.DB
        .prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
      return jsonResp(updated);
    }

    // DELETE /api/tasks/:id
    if (method === 'DELETE') {
      const existing = await env.DB
        .prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
      if (!existing) return jsonResp({ error: '존재하지 않는 업무입니다.' }, 404);

      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
      return jsonResp({ success: true });
    }
  }

  return jsonResp({ error: '요청한 리소스를 찾을 수 없습니다.' }, 404);
}
