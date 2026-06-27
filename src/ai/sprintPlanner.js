const { StateGraph, END } = require('@langchain/langgraph');
const { ChatAnthropic } = require('@langchain/anthropic');
const pool = require('../config/database');

// Initialize Claude
const model = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-6',
  maxTokens: 2000
});

/**
 * PULSEBOARD AI SPRINT PLANNER
 * 
 * LangGraph multi-agent system with 4 nodes:
 * 1. velocityAnalyser  → reads past sprint data
 * 2. taskEstimator     → estimates story points
 * 3. sprintBuilder     → builds balanced plan
 * 4. conflictChecker   → validates plan, loops if conflicts
 * 
 * Conditional edge: if conflicts → back to sprintBuilder
 * Human checkpoint: pause for approval before saving
 */

// Node 1 — Velocity Analyser
const velocityAnalyser = async (state) => {
  console.log('🔍 Agent 1: Analysing team velocity...');

  const { projectId } = state;

  // Get past 5 completed sprints
  const pastSprints = await pool.query(
    `SELECT 
      s.name,
      s.start_date,
      s.end_date,
      COALESCE(SUM(CASE WHEN t.status = 'done' THEN t.story_points ELSE 0 END), 0) as completed_points,
      COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks
     FROM sprints s
     LEFT JOIN tasks t ON t.sprint_id = s.id
     WHERE s.project_id = $1 AND s.status = 'completed'
     GROUP BY s.id
     ORDER BY s.end_date DESC
     LIMIT 5`,
    [projectId]
  );

  // Get team size
  const teamSize = await pool.query(
    `SELECT COUNT(DISTINCT t.assignee_id) as size
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     WHERE p.id = $1 AND t.assignee_id IS NOT NULL`,
    [projectId]
  );

  const sprints = pastSprints.rows;
  const avgVelocity = sprints.length > 0
    ? Math.round(sprints.reduce((sum, s) => sum + parseInt(s.completed_points), 0) / sprints.length)
    : 20; // default if no past sprints

  console.log(`✅ Average velocity: ${avgVelocity} points, Team size: ${teamSize.rows[0].size}`);

  return {
    ...state,
    velocity: avgVelocity,
    teamSize: parseInt(teamSize.rows[0].size) || 1,
    pastSprints: sprints
  };
};

// Node 2 — Task Estimator
const taskEstimator = async (state) => {
  console.log('📊 Agent 2: Estimating task complexity...');

  const { projectId } = state;

  // Get backlog tasks (not in any sprint, not done)
  const backlogTasks = await pool.query(
    `SELECT t.*, u.name as assignee_name
     FROM tasks t
     LEFT JOIN users u ON t.assignee_id = u.id
     WHERE t.project_id = $1
     AND t.sprint_id IS NULL
     AND t.status != 'done'
     ORDER BY t.priority DESC`,
    [projectId]
  );

  if (backlogTasks.rows.length === 0) {
    return {
      ...state,
      estimatedTasks: [],
      message: 'No backlog tasks to plan'
    };
  }

  // Use Claude to estimate story points for tasks without them
  const tasksNeedingEstimation = backlogTasks.rows.filter(t => !t.story_points || t.story_points === 1);

  let estimatedTasks = [...backlogTasks.rows];

  if (tasksNeedingEstimation.length > 0) {
    const taskList = tasksNeedingEstimation
      .map(t => `- ${t.title}: ${t.description || 'No description'} (Priority: ${t.priority})`)
      .join('\n');

    const prompt = `You are a senior software engineer estimating story points for tasks.
    
Story point scale:
1 = trivial (< 1 hour)
2 = small (1-3 hours)
3 = medium (3-6 hours)
5 = large (1-2 days)
8 = very large (2-3 days)
13 = epic (needs breaking down)

Tasks to estimate:
${taskList}

Respond with ONLY a JSON array like this:
[{"title": "exact task title", "story_points": 3}]

No explanation. Just the JSON array.`;

    const response = await model.invoke(prompt);
    
    try {
      const estimates = JSON.parse(response.content);
      
      // Apply estimates
      estimatedTasks = estimatedTasks.map(task => {
        const estimate = estimates.find(e => e.title === task.title);
        return estimate ? { ...task, story_points: estimate.story_points } : task;
      });
    } catch (e) {
      console.log('Estimation parsing failed, using defaults');
    }
  }

  console.log(`✅ Estimated ${estimatedTasks.length} backlog tasks`);

  return {
    ...state,
    estimatedTasks
  };
};

// Node 3 — Sprint Builder
const sprintBuilder = async (state) => {
  console.log('🏗️ Agent 3: Building sprint plan...');

  const { velocity, estimatedTasks, teamSize, conflicts, iterations } = state;

  if (!estimatedTasks || estimatedTasks.length === 0) {
    return {
      ...state,
      sprintPlan: { tasks: [], totalPoints: 0, message: 'No tasks available' }
    };
  }

  // Get team members
  const members = await pool.query(
    `SELECT DISTINCT u.id, u.name
     FROM users u
     JOIN tasks t ON t.assignee_id = u.id
     WHERE t.project_id = $1`,
    [state.projectId]
  );

  const taskList = estimatedTasks
    .map(t => `- ID:${t.id} | ${t.title} | ${t.story_points} points | Priority: ${t.priority} | Assignee: ${t.assignee_name || 'unassigned'}`)
    .join('\n');

  const memberList = members.rows
    .map(m => `- ${m.name} (ID: ${m.id})`)
    .join('\n');

  const conflictFeedback = conflicts && conflicts.length > 0
    ? `\nPrevious plan had these conflicts to fix:\n${conflicts.join('\n')}`
    : '';

  const prompt = `You are a sprint planning expert. Build a balanced 2-week sprint plan.

Team capacity: ${velocity} story points total
Team members:
${memberList}

Backlog tasks (pick tasks that fit within capacity):
${taskList}
${conflictFeedback}

Rules:
- Total story points must not exceed ${velocity}
- Distribute work evenly across team members
- Prioritize HIGH priority tasks first
- Each developer should not exceed ${Math.ceil(velocity / (teamSize || 1))} points

Respond with ONLY a JSON object:
{
  "selectedTasks": [
    {
      "taskId": "id here",
      "title": "task title",
      "storyPoints": 3,
      "assigneeId": "user id or null",
      "assigneeName": "name or unassigned",
      "reason": "why selected"
    }
  ],
  "totalPoints": 0,
  "sprintGoal": "one sentence sprint goal"
}

No explanation. Just JSON.`;

  const response = await model.invoke(prompt);

  let sprintPlan;
  try {
    const cleanResponse = response.content.replace(/```json\n?|\n?```/g, '').trim();
    sprintPlan = JSON.parse(cleanResponse);
  } catch (e) {
    console.log('Sprint plan parsing failed:', e.message);
    sprintPlan = {
      selectedTasks: estimatedTasks.slice(0, 3).map(t => ({
        taskId: t.id,
        title: t.title,
        storyPoints: t.story_points,
        assigneeId: t.assignee_id,
        assigneeName: t.assignee_name || 'unassigned',
        reason: 'Auto-selected'
      })),
      totalPoints: estimatedTasks.slice(0, 3).reduce((sum, t) => sum + t.story_points, 0),
      sprintGoal: 'Complete highest priority backlog items'
    };
  }

  console.log(`✅ Sprint plan built: ${sprintPlan.totalPoints} points, ${sprintPlan.selectedTasks?.length} tasks`);

  return {
    ...state,
    sprintPlan,
    iterations: (iterations || 0) + 1
  };
};

// Node 4 — Conflict Checker
const conflictChecker = async (state) => {
  console.log('🔎 Agent 4: Checking for conflicts...');

  const { sprintPlan, velocity, teamSize } = state;

  if (!sprintPlan || !sprintPlan.selectedTasks) {
    return { ...state, conflicts: [], isValid: true };
  }

  const conflicts = [];

  // Check 1 — total points exceed capacity
  if (sprintPlan.totalPoints > velocity * 1.1) {
    conflicts.push(`Total points (${sprintPlan.totalPoints}) exceeds team capacity (${velocity})`);
  }

  // Check 2 — any developer overloaded
  const pointsByAssignee = {};
  sprintPlan.selectedTasks.forEach(task => {
    if (task.assigneeId) {
      pointsByAssignee[task.assigneeId] = (pointsByAssignee[task.assigneeId] || 0) + task.storyPoints;
    }
  });

  const maxPerPerson = Math.ceil(velocity / (teamSize || 1)) * 1.2;
  Object.entries(pointsByAssignee).forEach(([assigneeId, points]) => {
    if (points > maxPerPerson) {
      const task = sprintPlan.selectedTasks.find(t => t.assigneeId === assigneeId);
      conflicts.push(`${task?.assigneeName || assigneeId} is overloaded with ${points} points (max: ${Math.ceil(maxPerPerson)})`);
    }
  });

  // Check 3 — no tasks selected
  if (sprintPlan.selectedTasks.length === 0) {
    conflicts.push('No tasks were selected for the sprint');
  }

  const isValid = conflicts.length === 0;
  console.log(isValid ? '✅ Plan is valid' : `⚠️ Found ${conflicts.length} conflicts`);

  return {
    ...state,
    conflicts,
    isValid
  };
};

// Conditional edge — should we loop or continue?
const shouldContinue = (state) => {
  const { isValid, iterations } = state;

  // Max 3 iterations to prevent infinite loop
  if (iterations >= 3) {
    console.log('Max iterations reached, accepting plan');
    return 'accept';
  }

  if (isValid) {
    return 'accept';
  }

  console.log('Conflicts found, looping back to sprint builder...');
  return 'replan';
};

// Build the LangGraph
const buildSprintPlannerGraph = () => {
  const workflow = new StateGraph({
    channels: {
      projectId: { value: (x, y) => y ?? x },
      velocity: { value: (x, y) => y ?? x },
      teamSize: { value: (x, y) => y ?? x },
      pastSprints: { value: (x, y) => y ?? x },
      estimatedTasks: { value: (x, y) => y ?? x },
      sprintPlan: { value: (x, y) => y ?? x },
      conflicts: { value: (x, y) => y ?? x },
      isValid: { value: (x, y) => y ?? x },
      iterations: { value: (x, y) => y ?? x, default: () => 0 },
      message: { value: (x, y) => y ?? x }
    }
  });

  // Add nodes
  workflow.addNode('velocityAnalyser', velocityAnalyser);
  workflow.addNode('taskEstimator', taskEstimator);
  workflow.addNode('sprintBuilder', sprintBuilder);
  workflow.addNode('conflictChecker', conflictChecker);

  // Add edges
  workflow.setEntryPoint('velocityAnalyser');
  workflow.addEdge('velocityAnalyser', 'taskEstimator');
  workflow.addEdge('taskEstimator', 'sprintBuilder');
  workflow.addEdge('sprintBuilder', 'conflictChecker');

  // Conditional edge — loop or end
  workflow.addConditionalEdges(
    'conflictChecker',
    shouldContinue,
    {
      'replan': 'sprintBuilder',
      'accept': END
    }
  );

  return workflow.compile();
};

// Main function — run the planner
const generateSprintPlan = async (projectId) => {
  console.log(`\n🚀 Starting AI Sprint Planner for project ${projectId}`);
  console.log('================================================');

  const graph = buildSprintPlannerGraph();

  const result = await graph.invoke({
    projectId,
    iterations: 0
  });

  console.log('================================================');
  console.log('✅ Sprint plan generation complete');

  return {
    sprintPlan: result.sprintPlan,
    velocity: result.velocity,
    teamSize: result.teamSize,
    conflicts: result.conflicts,
    isValid: result.isValid,
    iterations: result.iterations
  };
};

module.exports = { generateSprintPlan };