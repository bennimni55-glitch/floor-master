// Strips answer data before a quiz payload leaves the server.
// The client must never receive is_correct — correctness is checked
// server-side in /api/quiz/answer.
export interface QuizOption {
  text: string;
  is_correct?: boolean;
}

export interface QuizQuestionOut {
  id?: string;
  category: string;
  difficulty: string;
  question_text: string;
  options: Array<{ text: string }>;
  explanation?: string;
  points: number;
}

export function sanitizeQuestions(
  questions: ReadonlyArray<{ options?: unknown }>
): QuizQuestionOut[] {
  return questions.map((q) => ({
    ...(q as unknown as QuizQuestionOut),
    options: (Array.isArray(q.options) ? q.options : []).map((o) => ({
      text: String((o as QuizOption)?.text ?? ''),
    })),
  }));
}
