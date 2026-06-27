import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const errorRate = new Rate('error_rate');
const taskDuration = new Trend('task_duration');
const analyticsDuration = new Trend('analytics_duration');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
    error_rate: ['rate<0.1'],
  },
};

const BASE_URL = 'http://localhost:5000/api';

// Login once before test — get token
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'bhav@test.com', password: '123456' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const body = JSON.parse(loginRes.body);
  if (!body.token) {
    console.error('Login failed during setup:', loginRes.body);
    return { token: null, workspaceId: null, projectId: null };
  }

  const token = body.token;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Get workspace ID
  const wsRes = http.get(`${BASE_URL}/workspaces`, { headers });
  const workspaces = JSON.parse(wsRes.body).workspaces || [];
  const workspaceId = workspaces[0]?.id || null;

  // Get project ID
  let projectId = null;
  if (workspaceId) {
    const projRes = http.get(`${BASE_URL}/projects/workspace/${workspaceId}`, { headers });
    const projects = JSON.parse(projRes.body).projects || [];
    projectId = projects[0]?.id || null;
  }

  console.log(`Setup complete. Workspace: ${workspaceId}, Project: ${projectId}`);
  return { token, workspaceId, projectId };
}

export default function (data) {
  const { token, workspaceId, projectId } = data;

  if (!token) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1. Health check
  const healthRes = http.get('http://localhost:5000/health');
  check(healthRes, {
    'health check 200': (r) => r.status === 200,
  });

  sleep(0.2);

  // 2. Get workspaces
  const wsRes = http.get(`${BASE_URL}/workspaces`, { headers });
  const wsOk = check(wsRes, {
    'workspaces 200': (r) => r.status === 200,
    });
    if (!wsOk) {
        console.log(`Workspace failed: ${wsRes.status} - ${wsRes.body.substring(0, 100)}`);
    }
    errorRate.add(!wsOk ? 1 : 0);

  sleep(0.2);

  // 3. Get notifications
  const notifRes = http.get(`${BASE_URL}/notifications`, { headers });
  check(notifRes, {
    'notifications 200': (r) => r.status === 200,
  });

  sleep(0.2);

  // 4. Analytics (Redis cached — should be fast)
  if (workspaceId) {
    const analyticsStart = Date.now();
    const analyticsRes = http.get(
      `${BASE_URL}/analytics/workspace/${workspaceId}`,
      { headers }
    );
    analyticsDuration.add(Date.now() - analyticsStart);

    const analyticsOk = check(analyticsRes, {
      'analytics 200': (r) => r.status === 200,
      'analytics cached': (r) => {
        try { return JSON.parse(r.body).cached !== undefined; } catch { return false; }
      },
    });
    errorRate.add(!analyticsOk ? 1 : 0);
  }

  sleep(0.2);

  // 5. Get tasks (Kanban)
  if (projectId) {
    const taskStart = Date.now();
    const tasksRes = http.get(
      `${BASE_URL}/tasks/project/${projectId}`,
      { headers }
    );
    taskDuration.add(Date.now() - taskStart);

    const taskOk = check(tasksRes, {
      'tasks 200': (r) => r.status === 200,
      'has kanban': (r) => {
        try { return JSON.parse(r.body).kanban !== undefined; } catch { return false; }
      },
    });
    errorRate.add(!taskOk ? 1 : 0);
  }

  sleep(0.5);

  // 6. Get sprints
  if (projectId) {
    const sprintRes = http.get(
      `${BASE_URL}/sprints/project/${projectId}`,
      { headers }
    );
    check(sprintRes, {
      'sprints 200': (r) => r.status === 200,
    });
  }

  sleep(0.3);
}

export function handleSummary(data) {
  const m = data.metrics;
  const summary = `
╔══════════════════════════════════════════════════╗
║         PULSEBOARD LOAD TEST RESULTS             ║
╚══════════════════════════════════════════════════╝

📊 REQUEST METRICS
  Total requests:     ${m.http_reqs?.values?.count || 0}
  Failed requests:    ${m.http_req_failed?.values?.fails || 0}
  Avg duration:       ${Math.round(m.http_req_duration?.values?.avg || 0)}ms
  P95 duration:       ${Math.round(m.http_req_duration?.values?.['p(95)'] || 0)}ms
  P99 duration:       ${Math.round(m.http_req_duration?.values?.['p(99)'] || 0)}ms
  Req/sec:            ${Math.round(m.http_reqs?.values?.rate || 0)}

⚡ CUSTOM METRICS
  Analytics avg:      ${Math.round(m.analytics_duration?.values?.avg || 0)}ms
  Task fetch avg:     ${Math.round(m.task_duration?.values?.avg || 0)}ms
  Error rate:         ${((m.error_rate?.values?.rate || 0) * 100).toFixed(2)}%

🎯 THRESHOLDS
  p(95)<500ms:   ${(m.http_req_duration?.values?.['p(95)'] || 0) < 500 ? '✅ PASS' : '❌ FAIL'}
  failure<5%:    ${(m.http_req_failed?.values?.rate || 0) < 0.05 ? '✅ PASS' : '❌ FAIL'}
  error<10%:     ${(m.error_rate?.values?.rate || 0) < 0.1 ? '✅ PASS' : '❌ FAIL'}

🚀 VERDICT: ${
    (m.http_req_duration?.values?.['p(95)'] || 0) < 500 &&
    (m.http_req_failed?.values?.rate || 0) < 0.05
    ? '✅ PRODUCTION READY'
    : '⚠️  NEEDS OPTIMIZATION'
  }
`;



  return {
    'k6-results.json': JSON.stringify(data, null, 2),
    stdout: summary,
  };
}