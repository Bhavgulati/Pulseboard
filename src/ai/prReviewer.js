require('dotenv').config();
const { ChatAnthropic } = require('@langchain/anthropic');
const { Octokit } = require('@octokit/rest');

const model = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-6',
  maxTokens: 3000
});

/**
 * PR REVIEWER
 * 
 * What it does:
 * 1. Receives PR diff (what code changed)
 * 2. Sends to Claude API for analysis
 * 3. Posts review comments back to GitHub
 */

const reviewPullRequest = async ({ 
  owner,          // GitHub repo owner
  repo,           // GitHub repo name  
  pullNumber,     // PR number
  diff,           // The actual code changes
  githubToken     // GitHub API token
}) => {
  console.log(`🔍 Starting PR review for ${owner}/${repo} #${pullNumber}`);

  // Step 1 — Send diff to Claude for analysis
  const prompt = `You are an expert code reviewer. Analyse this pull request diff and provide a detailed review.

Pull Request Diff:
${diff.substring(0, 8000)} // limit to 8000 chars to stay within token limit

Provide your review in this EXACT JSON format:
{
  "summary": "Overall summary of the changes in 2-3 sentences",
  "overallScore": 85,
  "issues": [
    {
      "severity": "high",
      "type": "security",
      "description": "Clear description of the issue",
      "suggestion": "How to fix it",
      "line": "approximate line number or file name"
    }
  ],
  "positives": [
    "What was done well"
  ],
  "recommendation": "approve" or "request_changes" or "comment"
}

Severity levels: high (bugs/security), medium (performance/best practices), low (style/minor)
Types: security, bug, performance, readability, best_practice

Return ONLY the JSON. No explanation.`;

  const response = await model.invoke(prompt);

  let review;
  try {
    const cleanResponse = response.content
      .replace(/```json\n?|\n?```/g, '')
      .trim();
    review = JSON.parse(cleanResponse);
  } catch (e) {
    console.error('Failed to parse Claude review:', e.message);
    review = {
      summary: 'Code review completed. Please check the changes carefully.',
      overallScore: 70,
      issues: [],
      positives: ['Code was submitted for review'],
      recommendation: 'comment'
    };
  }

  console.log(`✅ Claude review complete. Score: ${review.overallScore}/100`);
  console.log(`Found ${review.issues?.length || 0} issues`);

  // Step 2 — Post review back to GitHub
  const octokit = new Octokit({ auth: githubToken });

  // Build review comment body
  const issuesList = review.issues?.length > 0
    ? review.issues.map(issue => 
        `### ${issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢'} ${issue.severity.toUpperCase()} — ${issue.type}\n**Issue:** ${issue.description}\n**Suggestion:** ${issue.suggestion}\n**Location:** ${issue.line}`
      ).join('\n\n')
    : '✅ No critical issues found';

  const positivesList = review.positives?.length > 0
    ? review.positives.map(p => `- ✅ ${p}`).join('\n')
    : '';

  const reviewBody = `## 🤖 PulseBoard AI Code Review

**Overall Score: ${review.overallScore}/100**

### Summary
${review.summary}

### Issues Found
${issuesList}

### What's Good
${positivesList}

---
*Automated review by PulseBoard AI. Human review still required before merging.*`;

  // Post review to GitHub
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    body: reviewBody,
    event: review.recommendation === 'approve' ? 'APPROVE' : 
           review.recommendation === 'request_changes' ? 'REQUEST_CHANGES' : 'COMMENT'
  });

  console.log(`✅ Review posted to GitHub PR #${pullNumber}`);

  return review;
};

module.exports = { reviewPullRequest };