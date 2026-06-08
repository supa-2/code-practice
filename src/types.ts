export interface ProblemMeta {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  category: string;
  module: string;
  status: "passed" | "tried" | "new";
  last_time?: string;
}

export interface TestCase {
  name: string;
  inputs: { key: string; value: string }[];
  expected?: string;
}

export interface DiscussComment {
  user: string;
  avatar: string;
  votes: number;
  time: string;
  content: string;
}

export interface ProblemFull extends ProblemMeta {
  description: string;
  starterCode: string;
  tests: string;
  testcases: TestCase[];
  discuss: DiscussComment[];
}

export interface RunResult {
  stdout: string;
  stderr: string;
  returncode: number;
  elapsed_ms: number;
}

export interface TestResult {
  passed: boolean;
  output: string;
  error: string;
  elapsed_ms: number;
  submissionId?: number;
}

export interface Submission {
  id: number;
  time: string;
  exercise: string;
  type: string;
  code: string;
  output: string;
  passed: number;
}

export interface LintError {
  line: number;
  col: number;
  msg: string;
  severity: "error" | "warning" | "info";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AppSettings {
  python_path: string;
  current_module: string;
  has_api_key: boolean;
}
